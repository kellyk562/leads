const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const db = require('../database/init');

const { processScheduledEmails } = require('./email');

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
      EXTRACT(DAY FROM NOW() - sub.last_contact_date)::INTEGER AS days_since_last_contact,
      (
        CASE l.stage
          WHEN 'New Lead' THEN 5 WHEN 'Contacted' THEN 10 WHEN 'Demo Scheduled' THEN 15
          WHEN 'Demo Completed' THEN 20 WHEN 'Proposal Sent' THEN 25 WHEN 'Negotiating' THEN 30
          WHEN 'Closed Won' THEN 30 WHEN 'Closed Lost' THEN 0 ELSE 5
        END
        + CASE
          WHEN EXTRACT(DAY FROM NOW() - sub.last_contact_date) <= 3 THEN 25
          WHEN EXTRACT(DAY FROM NOW() - sub.last_contact_date) <= 7 THEN 20
          WHEN EXTRACT(DAY FROM NOW() - sub.last_contact_date) <= 14 THEN 12
          WHEN EXTRACT(DAY FROM NOW() - sub.last_contact_date) <= 30 THEN 5
          ELSE 0
        END
        + CASE
          WHEN COALESCE(l.deal_value, 0) = 0 THEN 0
          WHEN l.deal_value <= 200 THEN 8
          WHEN l.deal_value <= 500 THEN 14
          ELSE 20
        END
        + CASE WHEN l.contact_email IS NOT NULL AND l.contact_email != '' THEN 5 ELSE 0 END
        + CASE WHEN l.contact_number IS NOT NULL AND l.contact_number != '' THEN 5 ELSE 0 END
        + CASE WHEN l.manager_name IS NOT NULL AND l.manager_name != '' THEN 5 ELSE 0 END
        + CASE WHEN l.callback_days IS NOT NULL AND l.callback_days != '' AND l.callback_days != '[]' THEN 5 ELSE 0 END
        + CASE WHEN l.callback_date IS NOT NULL THEN 5 ELSE 0 END
      ) AS lead_score
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

    const validSortColumns = ['contact_date', 'dispensary_name', 'created_at', 'updated_at', 'stage', 'deal_value', 'lead_score'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'updated_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const sortPrefix = sortColumn === 'lead_score' ? '' : 'l.';
    sql += ` ORDER BY ${sortPrefix}${sortColumn} ${sortOrder}`;

    const leads = await db.all(sql, params);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// Get daily briefing data (all-in-one dashboard endpoint)
router.get('/briefing', async (req, res) => {
  try {
    // Process any pending scheduled emails
    await processScheduledEmails().catch(err => console.error('processScheduledEmails error:', err));

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = req.query.day && days.includes(req.query.day) ? req.query.day : days[new Date().getDay()];
    const todayDate = new Date().toISOString().split('T')[0];

    const [todayCallbacks, overdueTasks, todayTasks, staleLeads, recentMoves,
           callsThisWeekRow, callsLastWeekRow, emailsThisWeekRow, emailsLastWeekRow,
           dealsMovedThisWeekRow, dealsMovedLastWeekRow] = await Promise.all([
      // Today's callbacks
      db.all(`
        SELECT * FROM leads
        WHERE callback_days ILIKE $1
        ORDER BY dispensary_name ASC
      `, [`%${todayDay}%`]),
      // Overdue tasks (due_date < today, pending)
      db.all(`
        SELECT t.*, l.dispensary_name
        FROM tasks t
        JOIN leads l ON l.id = t.lead_id
        WHERE t.due_date < $1 AND t.status = 'pending'
        ORDER BY t.due_date ASC
      `, [todayDate]),
      // Today's tasks (due_date = today, pending)
      db.all(`
        SELECT t.*, l.dispensary_name
        FROM tasks t
        JOIN leads l ON l.id = t.lead_id
        WHERE t.due_date = $1 AND t.status = 'pending'
        ORDER BY t.due_time ASC NULLS LAST
      `, [todayDate]),
      // Stale leads (no activity in 14+ days, not closed)
      db.all(`
        SELECT l.id, l.dispensary_name, l.stage, l.deal_value, l.contact_number, l.contact_email,
          EXTRACT(DAY FROM NOW() - COALESCE(MAX(ch.contact_date), l.created_at))::INTEGER AS days_inactive
        FROM leads l
        LEFT JOIN contact_history ch ON ch.lead_id = l.id
        WHERE l.stage NOT IN ('Closed Won', 'Closed Lost')
        GROUP BY l.id, l.dispensary_name, l.stage, l.deal_value, l.contact_number, l.contact_email, l.created_at
        HAVING COALESCE(MAX(ch.contact_date), l.created_at) < NOW() - INTERVAL '14 days'
        ORDER BY days_inactive DESC
        LIMIT 20
      `),
      // Recent pipeline moves (last 7 days, max 10)
      db.all(`
        SELECT ch.id, ch.lead_id, ch.notes, ch.contact_date, l.dispensary_name
        FROM contact_history ch
        JOIN leads l ON l.id = ch.lead_id
        WHERE ch.contact_method = 'Other'
          AND ch.notes LIKE 'Stage changed%'
          AND ch.contact_date >= NOW() - INTERVAL '7 days'
        ORDER BY ch.contact_date DESC
        LIMIT 10
      `),
      // Activity metrics: calls this week
      db.get(`
        SELECT COUNT(*) AS count FROM contact_history
        WHERE contact_method = 'Phone'
          AND contact_date >= DATE_TRUNC('week', CURRENT_DATE)
      `),
      // Activity metrics: calls last week
      db.get(`
        SELECT COUNT(*) AS count FROM contact_history
        WHERE contact_method = 'Phone'
          AND contact_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
          AND contact_date < DATE_TRUNC('week', CURRENT_DATE)
      `),
      // Activity metrics: emails this week
      db.get(`
        SELECT COUNT(*) AS count FROM contact_history
        WHERE contact_method = 'Email'
          AND contact_date >= DATE_TRUNC('week', CURRENT_DATE)
      `),
      // Activity metrics: emails last week
      db.get(`
        SELECT COUNT(*) AS count FROM contact_history
        WHERE contact_method = 'Email'
          AND contact_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
          AND contact_date < DATE_TRUNC('week', CURRENT_DATE)
      `),
      // Activity metrics: deals moved this week
      db.get(`
        SELECT COUNT(*) AS count FROM contact_history
        WHERE notes LIKE 'Stage changed%'
          AND contact_date >= DATE_TRUNC('week', CURRENT_DATE)
      `),
      // Activity metrics: deals moved last week
      db.get(`
        SELECT COUNT(*) AS count FROM contact_history
        WHERE notes LIKE 'Stage changed%'
          AND contact_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
          AND contact_date < DATE_TRUNC('week', CURRENT_DATE)
      `)
    ]);

    res.json({
      todayCallbacks, overdueTasks, todayTasks, staleLeads, recentMoves,
      callsThisWeek: parseInt(callsThisWeekRow?.count || 0),
      callsLastWeek: parseInt(callsLastWeekRow?.count || 0),
      emailsThisWeek: parseInt(emailsThisWeekRow?.count || 0),
      emailsLastWeek: parseInt(emailsLastWeekRow?.count || 0),
      dealsMovedThisWeek: parseInt(dealsMovedThisWeekRow?.count || 0),
      dealsMovedLastWeek: parseInt(dealsMovedLastWeekRow?.count || 0),
    });
  } catch (error) {
    console.error('Error fetching briefing:', error);
    res.status(500).json({ error: 'Failed to fetch briefing data' });
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
      staleLeads,
      winLossReasons
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
      `),
      // 9. Win/Loss reasons from contact_history outcomes
      db.all(`
        SELECT ch.outcome AS reason,
          CASE WHEN ch.notes LIKE '%"Closed Won"%' THEN 'won' ELSE 'lost' END AS type,
          COUNT(*) AS count
        FROM contact_history ch
        WHERE ch.contact_method = 'Other'
          AND ch.notes LIKE 'Stage changed%'
          AND (ch.notes LIKE '%"Closed Won"%' OR ch.notes LIKE '%"Closed Lost"%')
          AND ch.outcome IS NOT NULL
          AND ch.outcome NOT LIKE 'Stage:%'
        GROUP BY ch.outcome, type
        ORDER BY count DESC
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
      staleLeads,
      winLossReasons
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

// Find duplicate leads by name/phone/email
router.get('/duplicates', async (req, res) => {
  try {
    // Find groups that share normalized name, phone, or email
    const groups = [];

    // Duplicates by name
    const nameGroups = await db.all(`
      SELECT LOWER(TRIM(dispensary_name)) AS norm_name, ARRAY_AGG(id) AS ids
      FROM leads
      WHERE dispensary_name IS NOT NULL AND TRIM(dispensary_name) != ''
      GROUP BY LOWER(TRIM(dispensary_name))
      HAVING COUNT(*) > 1
    `);
    for (const g of nameGroups) {
      groups.push({ matchField: 'name', matchValue: g.norm_name, leadIds: g.ids });
    }

    // Duplicates by phone
    const phoneGroups = await db.all(`
      SELECT REGEXP_REPLACE(contact_number, '[^0-9]', '', 'g') AS norm_phone, ARRAY_AGG(id) AS ids
      FROM leads
      WHERE contact_number IS NOT NULL AND TRIM(contact_number) != ''
        AND LENGTH(REGEXP_REPLACE(contact_number, '[^0-9]', '', 'g')) >= 7
      GROUP BY REGEXP_REPLACE(contact_number, '[^0-9]', '', 'g')
      HAVING COUNT(*) > 1
    `);
    for (const g of phoneGroups) {
      groups.push({ matchField: 'phone', matchValue: g.norm_phone, leadIds: g.ids });
    }

    // Duplicates by email
    const emailGroups = await db.all(`
      SELECT LOWER(TRIM(contact_email)) AS norm_email, ARRAY_AGG(id) AS ids
      FROM leads
      WHERE contact_email IS NOT NULL AND TRIM(contact_email) != ''
      GROUP BY LOWER(TRIM(contact_email))
      HAVING COUNT(*) > 1
    `);
    for (const g of emailGroups) {
      groups.push({ matchField: 'email', matchValue: g.norm_email, leadIds: g.ids });
    }

    // Deduplicate groups - merge groups that share lead IDs
    const seen = new Set();
    const dedupedGroups = [];
    for (const g of groups) {
      const key = g.leadIds.sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        dedupedGroups.push(g);
      }
    }

    // Fetch full lead data for each group
    const result = [];
    for (const group of dedupedGroups) {
      const leads = await db.all(
        `SELECT * FROM leads WHERE id = ANY($1::int[])`,
        [group.leadIds]
      );
      result.push({ matchField: group.matchField, matchValue: group.matchValue, leads });
    }

    res.json(result);
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

// Merge two leads
router.post('/merge', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { keepId, mergeId, fieldsFromMerge } = req.body;

    if (!keepId || !mergeId || keepId === mergeId) {
      return res.status(400).json({ error: 'keepId and mergeId are required and must be different' });
    }

    const keepLead = await client.query('SELECT * FROM leads WHERE id = $1', [keepId]);
    const mergeLead = await client.query('SELECT * FROM leads WHERE id = $1', [mergeId]);

    if (!keepLead.rows[0] || !mergeLead.rows[0]) {
      return res.status(404).json({ error: 'One or both leads not found' });
    }

    await client.query('BEGIN');

    // Copy selected fields from merge lead to keep lead
    if (Array.isArray(fieldsFromMerge) && fieldsFromMerge.length > 0) {
      const allowedFields = [
        'dispensary_name', 'address', 'city', 'state', 'zip_code',
        'dispensary_number', 'contact_name', 'contact_position',
        'manager_name', 'owner_name', 'contact_number', 'contact_email',
        'website', 'license_number', 'current_pos_system', 'estimated_revenue',
        'number_of_locations', 'notes', 'callback_days', 'callback_time_slots',
        'callback_time_from', 'callback_time_to', 'priority', 'stage',
        'deal_value', 'callback_date', 'source'
      ];
      const validFields = fieldsFromMerge.filter(f => allowedFields.includes(f));
      if (validFields.length > 0) {
        const setClauses = validFields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        const values = validFields.map(f => mergeLead.rows[0][f]);
        await client.query(
          `UPDATE leads SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = $${validFields.length + 1}`,
          [...values, keepId]
        );
      }
    }

    // Reassign contact_history
    await client.query(
      'UPDATE contact_history SET lead_id = $1 WHERE lead_id = $2',
      [keepId, mergeId]
    );

    // Reassign tasks
    await client.query(
      'UPDATE tasks SET lead_id = $1 WHERE lead_id = $2',
      [keepId, mergeId]
    );

    // Reassign scheduled_emails
    await client.query(
      'UPDATE scheduled_emails SET lead_id = $1 WHERE lead_id = $2',
      [keepId, mergeId]
    );

    // Log merge event
    await client.query(`
      INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
      VALUES ($1, 'Other', $2, 'Merge completed')
    `, [keepId, `Merged with "${mergeLead.rows[0].dispensary_name}" (ID ${mergeId})`]);

    // Delete the merged lead
    await client.query('DELETE FROM leads WHERE id = $1', [mergeId]);

    await client.query('COMMIT');

    const updatedLead = await db.get('SELECT * FROM leads WHERE id = $1', [keepId]);
    res.json(updatedLead);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error merging leads:', error);
    res.status(500).json({ error: 'Failed to merge leads' });
  } finally {
    client.release();
  }
});

// Bulk update stage
router.patch('/bulk/stage', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { ids, stage, reason } = req.body;

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
    const isClosed = stage === 'Closed Won' || stage === 'Closed Lost';
    const outcome = (isClosed && reason) ? reason : `Stage: ${stage}`;
    for (const lead of currentLeads.rows) {
      const oldStage = lead.stage || 'New Lead';
      if (oldStage !== stage) {
        await client.query(
          `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
           VALUES ($1, 'Other', $2, $3)`,
          [lead.id, `Stage changed from "${oldStage}" to "${stage}"`, outcome]
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

    // Get contact history, days since last contact, completed tasks, and lead score in parallel
    const [history, lastContactRow, completedTasks, scoreRow] = await Promise.all([
      db.all(`SELECT * FROM contact_history WHERE lead_id = $1 ORDER BY contact_date DESC`, [req.params.id]),
      db.get(`
        SELECT EXTRACT(DAY FROM NOW() - MAX(contact_date))::INTEGER AS days_since_last_contact
        FROM contact_history
        WHERE lead_id = $1 AND NOT (contact_method = 'Other' AND notes LIKE 'Stage changed%')
      `, [req.params.id]),
      db.all(`SELECT * FROM tasks WHERE lead_id = $1 AND status = 'completed' ORDER BY completed_at DESC`, [req.params.id]),
      db.get(`
        SELECT (
          CASE l.stage
            WHEN 'New Lead' THEN 5 WHEN 'Contacted' THEN 10 WHEN 'Demo Scheduled' THEN 15
            WHEN 'Demo Completed' THEN 20 WHEN 'Proposal Sent' THEN 25 WHEN 'Negotiating' THEN 30
            WHEN 'Closed Won' THEN 30 WHEN 'Closed Lost' THEN 0 ELSE 5
          END
          + CASE
            WHEN sub.days <= 3 THEN 25 WHEN sub.days <= 7 THEN 20
            WHEN sub.days <= 14 THEN 12 WHEN sub.days <= 30 THEN 5 ELSE 0
          END
          + CASE
            WHEN COALESCE(l.deal_value, 0) = 0 THEN 0
            WHEN l.deal_value <= 200 THEN 8 WHEN l.deal_value <= 500 THEN 14 ELSE 20
          END
          + CASE WHEN l.contact_email IS NOT NULL AND l.contact_email != '' THEN 5 ELSE 0 END
          + CASE WHEN l.contact_number IS NOT NULL AND l.contact_number != '' THEN 5 ELSE 0 END
          + CASE WHEN l.manager_name IS NOT NULL AND l.manager_name != '' THEN 5 ELSE 0 END
          + CASE WHEN l.callback_days IS NOT NULL AND l.callback_days != '' AND l.callback_days != '[]' THEN 5 ELSE 0 END
          + CASE WHEN l.callback_date IS NOT NULL THEN 5 ELSE 0 END
        ) AS lead_score
        FROM leads l
        LEFT JOIN LATERAL (
          SELECT EXTRACT(DAY FROM NOW() - MAX(contact_date))::INTEGER AS days
          FROM contact_history
          WHERE lead_id = l.id AND NOT (contact_method = 'Other' AND notes LIKE 'Stage changed%')
        ) sub ON true
        WHERE l.id = $1
      `, [req.params.id])
    ]);

    res.json({
      ...lead,
      contact_history: history,
      days_since_last_contact: lastContactRow?.days_since_last_contact ?? null,
      completed_tasks: completedTasks,
      lead_score: scoreRow?.lead_score ?? 0
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

    const { stage, reason } = req.body;
    const oldStage = existing.stage || 'New Lead';

    await db.run(`UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [stage, req.params.id]);

    // Auto-log stage change to contact history
    const isClosed = stage === 'Closed Won' || stage === 'Closed Lost';
    const outcome = (isClosed && reason) ? reason : `Stage: ${stage}`;
    await db.run(`
      INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
      VALUES ($1, 'Other', $2, $3)
    `, [req.params.id, `Stage changed from "${oldStage}" to "${stage}"`, outcome]);

    const updatedLead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating stage:', error);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});

// Cadence step labels (keep in sync with client)
const CADENCE_LABELS = ['Not started', 'Intro sent', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Break-up email'];

// Update cadence step
router.patch('/:id/cadence-step', [
  param('id').isInt(),
  body('step').isInt({ min: 0, max: 5 }).withMessage('Step must be 0-5'),
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

    const { step } = req.body;
    const label = CADENCE_LABELS[step] || `Step ${step}`;

    await db.run(`UPDATE leads SET cadence_step = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [step, req.params.id]);

    // Auto-log to contact history
    await db.run(`
      INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
      VALUES ($1, 'Other', $2, $3)
    `, [req.params.id, `Cadence advanced to Step ${step}: ${label}`, `Cadence: ${label}`]);

    // Auto-schedule email if a template is mapped to this cadence step
    let scheduledEmail = null;
    const template = await db.get(
      `SELECT * FROM email_templates WHERE cadence_step = $1 LIMIT 1`,
      [step]
    );
    if (template) {
      const delayDays = template.delay_days || 0;
      const result = await db.run(`
        INSERT INTO scheduled_emails (lead_id, template_id, cadence_step, scheduled_for)
        VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)
        RETURNING id
      `, [req.params.id, template.id, step, delayDays]);
      scheduledEmail = await db.get('SELECT * FROM scheduled_emails WHERE id = $1', [result.lastInsertRowid]);
    }

    const updatedLead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    res.json({ ...updatedLead, scheduledEmail });
  } catch (error) {
    console.error('Error updating cadence step:', error);
    res.status(500).json({ error: 'Failed to update cadence step' });
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
