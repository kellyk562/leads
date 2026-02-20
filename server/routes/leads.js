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
  body('priority').optional().isIn(['Low', 'Medium', 'High']),
  body('stage').optional().isIn(VALID_STAGES),
  body('deal_value').optional({ values: 'falsy' }).isNumeric(),
];

// Get all leads with optional filtering
router.get('/', async (req, res) => {
  try {
    const { search, priority, stage, sort = 'updated_at', order = 'DESC' } = req.query;

    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (dispensary_name ILIKE $${paramIndex} OR contact_name ILIKE $${paramIndex} OR manager_name ILIKE $${paramIndex} OR owner_name ILIKE $${paramIndex} OR address ILIKE $${paramIndex} OR city ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
      sql += ` AND priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (stage && VALID_STAGES.includes(stage)) {
      sql += ` AND stage = $${paramIndex}`;
      params.push(stage);
      paramIndex++;
    }

    const validSortColumns = ['contact_date', 'dispensary_name', 'created_at', 'updated_at', 'priority', 'stage', 'deal_value'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'updated_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortColumn} ${sortOrder}`;

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
      ORDER BY priority DESC, dispensary_name ASC
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
      ORDER BY priority DESC, dispensary_name ASC
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

    // Get contact history
    const history = await db.all(`
      SELECT * FROM contact_history WHERE lead_id = $1 ORDER BY contact_date DESC
    `, [req.params.id]);

    res.json({ ...lead, contact_history: history });
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

    const { contact_method, contact_person, notes, outcome, next_callback } = req.body;

    // Convert empty strings to null for PostgreSQL
    const result = await db.run(`
      INSERT INTO contact_history (lead_id, contact_method, contact_person, notes, outcome, next_callback)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      req.params.id,
      contact_method || null,
      contact_person || null,
      notes || null,
      outcome || null,
      next_callback || null
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
      'Dispensary Phone', 'Primary Contact', 'Contact Position', 'Recommended Contact',
      'Recommended Position', 'Recommended Phone', 'Recommended Email', 'Website',
      'Current POS', 'Deal Value', 'Notes', 'Callback Days', 'Callback Time From', 'Callback Time To',
      'Priority', 'Stage', 'Callback Date', 'Created At', 'Updated At'
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
      lead.contact_position || '',
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
      lead.priority || '',
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
