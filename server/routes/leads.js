const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const db = require('../database/init');

const router = express.Router();

const VALID_STAGES = ['New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed', 'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'];

// Validation middleware
const validateLead = [
  body('dispensary_name').notEmpty().trim().withMessage('Dispensary name is required'),
  body('contact_date').notEmpty().withMessage('Contact date is required'),
  body('contact_email').optional({ values: 'falsy' }).isEmail().withMessage('Invalid email format'),
  body('stage').optional().isIn(VALID_STAGES),
  body('deal_value').optional({ values: 'falsy' }).isNumeric(),
];

// Get all leads with optional filtering
router.get('/', async (req, res) => {
  try {
    const { search, stage, sort = 'updated_at', order = 'DESC' } = req.query;

    let sql = `SELECT l.*, sub.last_contact_date,
      EXTRACT(DAY FROM NOW() - sub.last_contact_date)::INTEGER AS days_since_last_contact
      FROM leads l
      LEFT JOIN (
        SELECT lead_id, MAX(contact_date) AS last_contact_date
        FROM contact_history
        WHERE NOT (contact_method = 'Other' AND notes LIKE 'Stage changed%')
        GROUP BY lead_id
      ) sub ON sub.lead_id = l.id
      WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (l.dispensary_name ILIKE $${paramIndex} OR l.contact_name ILIKE $${paramIndex} OR l.manager_name ILIKE $${paramIndex} OR l.owner_name ILIKE $${paramIndex} OR l.address ILIKE $${paramIndex} OR l.city ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (stage && VALID_STAGES.includes(stage)) {
      sql += ` AND l.stage = $${paramIndex}`;
      params.push(stage);
      paramIndex++;
    }

    const validSortColumns = ['contact_date', 'dispensary_name', 'created_at', 'updated_at', 'stage', 'deal_value'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'updated_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY l.${sortColumn} ${sortOrder}`;

    const leads = await db.all(sql, params);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// Get today's callbacks (leads scheduled for today's day of week)
router.get('/callbacks/today', async (req, res) => {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Use day from query param (from client's local time) or fall back to server time
    const todayDay = req.query.day && days.includes(req.query.day) ? req.query.day : days[new Date().getDay()];

    const sql = `
      SELECT * FROM leads
      WHERE callback_days ILIKE $1
      ORDER BY dispensary_name ASC
    `;

    const leads = await db.all(sql, [`%${todayDay}%`]);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching today callbacks:', error);
    res.status(500).json({ error: 'Failed to fetch callbacks' });
  }
});

// Get all leads with callback days set (for upcoming section)
router.get('/callbacks/upcoming', async (req, res) => {
  try {
    const sql = `
      SELECT * FROM leads
      WHERE callback_days IS NOT NULL AND callback_days != '[]' AND callback_days != ''
      ORDER BY dispensary_name ASC
    `;

    const leads = await db.all(sql);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching upcoming callbacks:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming callbacks' });
  }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];

    // Total leads
    const totalResult = await db.get('SELECT COUNT(*) as count FROM leads');
    stats.total = totalResult?.count || 0;

    // Today's callbacks count (leads scheduled for today's day of week)
    const todayResult = await db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE callback_days ILIKE $1
    `, [`%${todayDay}%`]);
    stats.todayCallbacks = todayResult?.count || 0;

    // Leads with callbacks scheduled
    const scheduledResult = await db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE callback_days IS NOT NULL AND callback_days != '[]' AND callback_days != ''
    `);
    stats.scheduledCallbacks = scheduledResult?.count || 0;

    // This week's new leads
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const newResult = await db.get(`
      SELECT COUNT(*) as count FROM leads WHERE DATE(created_at) >= DATE($1)
    `, [weekAgo]);
    stats.newThisWeek = newResult?.count || 0;

    // Stage counts
    const stageRows = await db.all(`SELECT stage, COUNT(*) as count FROM leads GROUP BY stage`);
    stats.stageCounts = {};
    for (const row of stageRows) {
      stats.stageCounts[row.stage || 'New Lead'] = parseInt(row.count, 10);
    }

    // Total pipeline value (exclude closed stages)
    const pipelineValueResult = await db.get(`
      SELECT COALESCE(SUM(deal_value), 0) as total FROM leads
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
    `);
    stats.totalPipelineValue = parseFloat(pipelineValueResult?.total || 0);

    // Value per stage
    const stageValueRows = await db.all(`
      SELECT stage, COALESCE(SUM(deal_value), 0) as total FROM leads GROUP BY stage
    `);
    stats.stageValues = {};
    for (const row of stageValueRows) {
      stats.stageValues[row.stage || 'New Lead'] = parseFloat(row.total);
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const [
      stageCounts,
      avgTimeInStage,
      leadsBySource,
      leadsByPOS,
      leadsByState,
      weeklyNewLeads,
      weeklyClosedWon,
      staleLeads
    ] = await Promise.all([
      // 1. Stage counts (cumulative for funnel)
      db.all(`SELECT stage, COUNT(*) as count FROM leads GROUP BY stage`),
      // 2. Average time in each stage using stage-change history
      db.all(`
        WITH stage_changes AS (
          SELECT lead_id, notes, contact_date,
            LAG(contact_date) OVER (PARTITION BY lead_id ORDER BY contact_date) AS prev_date,
            LAG(notes) OVER (PARTITION BY lead_id ORDER BY contact_date) AS prev_notes
          FROM contact_history
          WHERE contact_method = 'Other' AND notes LIKE 'Stage changed%'
        )
        SELECT
          SUBSTRING(prev_notes FROM 'to "([^"]+)"') AS stage,
          ROUND(AVG(EXTRACT(EPOCH FROM (contact_date - prev_date)) / 86400)::NUMERIC, 1) AS avg_days
        FROM stage_changes
        WHERE prev_date IS NOT NULL
        GROUP BY SUBSTRING(prev_notes FROM 'to "([^"]+)"')
        HAVING SUBSTRING(prev_notes FROM 'to "([^"]+)"') IS NOT NULL
      `),
      // 3. Leads by source
      db.all(`SELECT COALESCE(source, 'Unknown') AS source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC`),
      // 4. Leads by POS competitor
      db.all(`SELECT COALESCE(current_pos_system, 'Unknown') AS pos, COUNT(*) as count FROM leads WHERE current_pos_system IS NOT NULL AND current_pos_system != '' GROUP BY current_pos_system ORDER BY count DESC`),
      // 5. Leads by state
      db.all(`SELECT COALESCE(state, 'Unknown') AS state, COUNT(*) as count FROM leads WHERE state IS NOT NULL AND state != '' GROUP BY state ORDER BY count DESC LIMIT 10`),
      // 6. Weekly new leads (last 12 weeks)
      db.all(`
        SELECT DATE_TRUNC('week', created_at)::DATE AS week, COUNT(*) as count
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '12 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week
      `),
      // 7. Weekly closed won (last 12 weeks)
      db.all(`
        SELECT DATE_TRUNC('week', contact_date)::DATE AS week, COUNT(*) as count
        FROM contact_history
        WHERE contact_method = 'Other' AND notes LIKE '%to "Closed Won"%'
          AND contact_date >= NOW() - INTERVAL '12 weeks'
        GROUP BY DATE_TRUNC('week', contact_date)
        ORDER BY week
      `),
      // 8. Stale leads (no activity in 14+ days, excluding Closed Won/Lost)
      db.all(`
        SELECT l.id, l.dispensary_name, l.stage, l.deal_value,
          MAX(ch.contact_date) AS last_activity,
          EXTRACT(DAY FROM NOW() - COALESCE(MAX(ch.contact_date), l.created_at))::INTEGER AS days_inactive
        FROM leads l
        LEFT JOIN contact_history ch ON ch.lead_id = l.id
        WHERE l.stage NOT IN ('Closed Won', 'Closed Lost')
        GROUP BY l.id, l.dispensary_name, l.stage, l.deal_value, l.created_at
        HAVING COALESCE(MAX(ch.contact_date), l.created_at) < NOW() - INTERVAL '14 days'
        ORDER BY days_inactive DESC
      `)
    ]);

    // Build cumulative funnel counts
    const stageOrder = ['New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed', 'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'];
    const stageCountMap = {};
    stageCounts.forEach(r => { stageCountMap[r.stage] = parseInt(r.count); });
    const funnel = stageOrder.filter(s => s !== 'Closed Lost').map(stage => {
      const idx = stageOrder.indexOf(stage);
      let cumulative = 0;
      for (let i = idx; i < stageOrder.length; i++) {
        cumulative += (stageCountMap[stageOrder[i]] || 0);
      }
      return { stage, count: cumulative };
    });

    res.json({
      funnel,
      avgTimeInStage,
      leadsBySource,
      leadsByPOS,
      leadsByState,
      weeklyNewLeads,
      weeklyClosedWon,
      staleLeads
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Bulk create leads (CSV import)
router.post('/bulk', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { leads, source } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'leads array is required' });
    }

    if (leads.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 leads per request' });
    }

    const today = new Date().toISOString().split('T')[0];
    const errors = [];
    let created = 0;

    await client.query('BEGIN');

    for (let i = 0; i < leads.length; i++) {
      const row = leads[i];

      if (!row.dispensary_name || !row.dispensary_name.trim()) {
        errors.push({ row: i, error: 'dispensary_name is required' });
        continue;
      }

      try {
        await client.query(`
          INSERT INTO leads (
            contact_date, dispensary_name, address, city, state, zip_code,
            dispensary_number, contact_name, contact_position, manager_name, owner_name,
            contact_number, contact_email, website, current_pos_system,
            notes, priority, stage, deal_value, source, user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        `, [
          row.contact_date || today,
          row.dispensary_name.trim(),
          row.address || null,
          row.city || null,
          row.state || null,
          row.zip_code || null,
          row.dispensary_number || null,
          row.contact_name || null,
          row.contact_position || null,
          row.manager_name || null,
          row.owner_name || null,
          row.contact_number || null,
          row.contact_email || null,
          row.website || null,
          row.current_pos_system || null,
          row.notes || null,
          ['Low', 'Medium', 'High'].includes(row.priority) ? row.priority : 'Medium',
          VALID_STAGES.includes(row.stage) ? row.stage : 'New Lead',
          row.deal_value || null,
          source || row.source || null,
          1
        ]);
        created++;
      } catch (err) {
        errors.push({ row: i, error: err.message });
      }
    }

    await client.query('COMMIT');
    res.json({ created, errors });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk creating leads:', error);
    res.status(500).json({ error: 'Failed to bulk create leads' });
  } finally {
    client.release();
  }
});

// Check for duplicate leads by name
router.post('/check-duplicates', async (req, res) => {
  try {
    const { names } = req.body;

    if (!Array.isArray(names) || names.length === 0) {
      return res.json({ duplicates: [] });
    }

    const duplicates = [];

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (!name || !name.trim()) continue;

      const matches = await db.all(
        `SELECT id, dispensary_name, city, stage FROM leads
         WHERE dispensary_name ILIKE $1 OR dispensary_name ILIKE $2`,
        [name.trim(), `%${name.trim()}%`]
      );

      for (const match of matches) {
        duplicates.push({
          input_name: name,
          input_index: i,
          existing: {
            id: match.id,
            dispensary_name: match.dispensary_name,
            city: match.city,
            stage: match.stage
          }
        });
      }
    }

    res.json({ duplicates });
  } catch (error) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({ error: 'Failed to check duplicates' });
  }
});

// Bulk update stage
router.patch('/bulk/stage', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { ids, stage } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    await client.query('BEGIN');

    // Get current stages for logging
    const currentLeads = await client.query(
      `SELECT id, stage, dispensary_name FROM leads WHERE id = ANY($1::int[])`,
      [ids]
    );

    // Update all stages
    await client.query(
      `UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2::int[])`,
      [stage, ids]
    );

    // Log stage changes to contact_history
    for (const lead of currentLeads.rows) {
      const oldStage = lead.stage || 'New Lead';
      if (oldStage !== stage) {
        await client.query(
          `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
           VALUES ($1, 'Other', $2, $3)`,
          [lead.id, `Stage changed from "${oldStage}" to "${stage}"`, `Stage: ${stage}`]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ updated: currentLeads.rows.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk updating stage:', error);
    res.status(500).json({ error: 'Failed to bulk update stage' });
  } finally {
    client.release();
  }
});

// Get single lead by ID
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const lead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get contact history, days since last contact, and completed tasks in parallel
    const [history, lastContactRow, completedTasks] = await Promise.all([
      db.all(`SELECT * FROM contact_history WHERE lead_id = $1 ORDER BY contact_date DESC`, [req.params.id]),
      db.get(`
        SELECT EXTRACT(DAY FROM NOW() - MAX(contact_date))::INTEGER AS days_since_last_contact
        FROM contact_history
        WHERE lead_id = $1 AND NOT (contact_method = 'Other' AND notes LIKE 'Stage changed%')
      `, [req.params.id]),
      db.all(`SELECT * FROM tasks WHERE lead_id = $1 AND status = 'completed' ORDER BY completed_at DESC`, [req.params.id])
    ]);

    res.json({
      ...lead,
      contact_history: history,
      days_since_last_contact: lastContactRow?.days_since_last_contact ?? null,
      completed_tasks: completedTasks
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// Create new lead
router.post('/', validateLead, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      contact_date,
      dispensary_name,
      address,
      city,
      state,
      zip_code,
      dispensary_number,
      contact_name,
      contact_position,
      manager_name,
      owner_name,
      contact_number,
      contact_email,
      website,
      current_pos_system,
      notes,
      callback_days,
      callback_time_slots,
      callback_time_from,
      callback_time_to,
      priority = 'Medium',
      stage = 'New Lead',
      callback_date,
      deal_value
    } = req.body;

    // Convert arrays to JSON strings
    const callbackDaysJson = Array.isArray(callback_days) ? JSON.stringify(callback_days) : callback_days;
    const callbackTimeSlotsJson = Array.isArray(callback_time_slots) ? JSON.stringify(callback_time_slots) : callback_time_slots;

    const sql = `
      INSERT INTO leads (
        contact_date, dispensary_name, address, city, state, zip_code,
        dispensary_number, contact_name, contact_position, manager_name, owner_name,
        contact_number, contact_email, website, current_pos_system,
        notes, callback_days, callback_time_slots, callback_time_from, callback_time_to, priority, stage, callback_date, deal_value, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING id
    `;

    const result = await db.run(sql, [
      contact_date, dispensary_name, address, city, state, zip_code,
      dispensary_number, contact_name, contact_position, manager_name, owner_name,
      contact_number, contact_email, website, current_pos_system,
      notes, callbackDaysJson, callbackTimeSlotsJson, callback_time_from, callback_time_to, priority, stage, callback_date || null, deal_value || null, 1
    ]);

    const newLead = await db.get('SELECT * FROM leads WHERE id = $1', [result.lastInsertRowid]);
    res.status(201).json(newLead);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// Update lead
router.put('/:id', [param('id').isInt(), ...validateLead], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const {
      contact_date,
      dispensary_name,
      address,
      city,
      state,
      zip_code,
      dispensary_number,
      contact_name,
      contact_position,
      manager_name,
      owner_name,
      contact_number,
      contact_email,
      website,
      current_pos_system,
      notes,
      callback_days,
      callback_time_slots,
      callback_time_from,
      callback_time_to,
      priority,
      stage,
      callback_date,
      deal_value
    } = req.body;

    // Convert arrays to JSON strings
    const callbackDaysJson = Array.isArray(callback_days) ? JSON.stringify(callback_days) : callback_days;
    const callbackTimeSlotsJson = Array.isArray(callback_time_slots) ? JSON.stringify(callback_time_slots) : callback_time_slots;

    const sql = `
      UPDATE leads SET
        contact_date = $1,
        dispensary_name = $2,
        address = $3,
        city = $4,
        state = $5,
        zip_code = $6,
        dispensary_number = $7,
        contact_name = $8,
        contact_position = $9,
        manager_name = $10,
        owner_name = $11,
        contact_number = $12,
        contact_email = $13,
        website = $14,
        current_pos_system = $15,
        notes = $16,
        callback_days = $17,
        callback_time_slots = $18,
        callback_time_from = $19,
        callback_time_to = $20,
        priority = $21,
        stage = $22,
        callback_date = $23,
        deal_value = $24,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $25
    `;

    await db.run(sql, [
      contact_date, dispensary_name, address, city, state, zip_code,
      dispensary_number, contact_name, contact_position, manager_name, owner_name,
      contact_number, contact_email, website, current_pos_system,
      notes, callbackDaysJson, callbackTimeSlotsJson, callback_time_from, callback_time_to, priority,
      stage || existing.stage || 'New Lead',
      callback_date || null,
      deal_value || null,
      req.params.id
    ]);

    const updatedLead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// Update lead stage (lightweight, auto-logs to contact history)
router.patch('/:id/stage', [
  param('id').isInt(),
  body('stage').isIn(VALID_STAGES).withMessage('Invalid stage'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { stage } = req.body;
    const oldStage = existing.stage || 'New Lead';

    await db.run(`UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [stage, req.params.id]);

    // Auto-log stage change to contact history
    await db.run(`
      INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
      VALUES ($1, 'Other', $2, $3)
    `, [req.params.id, `Stage changed from "${oldStage}" to "${stage}"`, `Stage: ${stage}`]);

    const updatedLead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating stage:', error);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});

// Add contact history entry
router.post('/:id/history', [
  param('id').isInt(),
  body('contact_method').optional().isIn(['Phone', 'Email', 'In-Person', 'Text', 'Other']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { contact_method, contact_person, notes, outcome, next_callback, email_template_id, email_subject } = req.body;

    // Convert empty strings to null for PostgreSQL
    const result = await db.run(`
      INSERT INTO contact_history (lead_id, contact_method, contact_person, notes, outcome, next_callback, email_template_id, email_subject)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      req.params.id,
      contact_method || null,
      contact_person || null,
      notes || null,
      outcome || null,
      next_callback || null,
      email_template_id || null,
      email_subject || null
    ]);

    // Update lead's updated_at
    await db.run(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.params.id]);

    const newHistory = await db.get('SELECT * FROM contact_history WHERE id = $1', [result.lastInsertRowid]);
    res.status(201).json(newHistory);
  } catch (error) {
    console.error('Error adding contact history:', error);
    res.status(500).json({ error: 'Failed to add contact history' });
  }
});

// Get contact history for a lead
router.get('/:id/history', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const history = await db.all(`
      SELECT * FROM contact_history WHERE lead_id = $1 ORDER BY contact_date DESC
    `, [req.params.id]);

    res.json(history);
  } catch (error) {
    console.error('Error fetching contact history:', error);
    res.status(500).json({ error: 'Failed to fetch contact history' });
  }
});

// Delete lead
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Delete related records first (cascade should handle this but being explicit)
    await db.run('DELETE FROM tasks WHERE lead_id = $1', [req.params.id]);
    await db.run('DELETE FROM contact_history WHERE lead_id = $1', [req.params.id]);
    await db.run('DELETE FROM leads WHERE id = $1', [req.params.id]);

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// Export leads to CSV
router.get('/export/csv', async (req, res) => {
  try {
    const sql = 'SELECT * FROM leads ORDER BY created_at DESC';
    const leads = await db.all(sql);

    // CSV headers
    const headers = [
      'ID', 'Contact Date', 'Dispensary Name', 'Address', 'City', 'State', 'Zip Code',
      'Dispensary Phone', 'Reference', 'Name',
      'Role', 'Phone', 'Email', 'Website',
      'Current POS', 'Deal Value', 'Notes', 'Callback Days', 'Callback Time From', 'Callback Time To',
      'Stage', 'Callback Date', 'Created At', 'Updated At'
    ];

    // Convert leads to CSV rows
    const rows = leads.map(lead => [
      lead.id,
      lead.contact_date || '',
      `"${(lead.dispensary_name || '').replace(/"/g, '""')}"`,
      `"${(lead.address || '').replace(/"/g, '""')}"`,
      lead.city || '',
      lead.state || '',
      lead.zip_code || '',
      lead.dispensary_number || '',
      `"${(lead.contact_name || '').replace(/"/g, '""')}"`,
      `"${(lead.manager_name || '').replace(/"/g, '""')}"`,
      lead.owner_name || '',
      lead.contact_number || '',
      lead.contact_email || '',
      lead.website || '',
      lead.current_pos_system || '',
      lead.deal_value || '',
      `"${(lead.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      `"${(lead.callback_days || '').replace(/"/g, '""')}"`,
      lead.callback_time_from || '',
      lead.callback_time_to || '',
      lead.stage || 'New Lead',
      lead.callback_date || '',
      lead.created_at || '',
      lead.updated_at || ''
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads-export-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting leads:', error);
    res.status(500).json({ error: 'Failed to export leads' });
  }
});

module.exports = router;
