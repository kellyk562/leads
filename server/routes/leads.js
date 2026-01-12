const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const db = require('../database/init');

const router = express.Router();

// Validation middleware
const validateLead = [
  body('dispensary_name').notEmpty().trim().withMessage('Dispensary name is required'),
  body('contact_date').notEmpty().withMessage('Contact date is required'),
  body('contact_email').optional({ values: 'falsy' }).isEmail().withMessage('Invalid email format'),
  body('priority').optional().isIn(['Low', 'Medium', 'High']),
];

// Get all leads with optional filtering
router.get('/', (req, res) => {
  try {
    const { search, priority, sort = 'updated_at', order = 'DESC' } = req.query;

    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (search) {
      sql += ` AND (dispensary_name LIKE ? OR contact_name LIKE ? OR manager_name LIKE ? OR owner_name LIKE ? OR address LIKE ? OR city LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
      sql += ` AND priority = ?`;
      params.push(priority);
    }

    const validSortColumns = ['contact_date', 'dispensary_name', 'created_at', 'updated_at', 'priority'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'updated_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortColumn} ${sortOrder}`;

    const leads = db.all(sql, params);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// Get today's callbacks (leads scheduled for today's day of week)
router.get('/callbacks/today', (req, res) => {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];

    const sql = `
      SELECT * FROM leads
      WHERE callback_days LIKE ?
      ORDER BY priority DESC, dispensary_name ASC
    `;

    const leads = db.all(sql, [`%${todayDay}%`]);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching today callbacks:', error);
    res.status(500).json({ error: 'Failed to fetch callbacks' });
  }
});

// Get all leads with callback days set (for upcoming section)
router.get('/callbacks/upcoming', (req, res) => {
  try {
    const sql = `
      SELECT * FROM leads
      WHERE callback_days IS NOT NULL AND callback_days != '[]' AND callback_days != ''
      ORDER BY priority DESC, dispensary_name ASC
    `;

    const leads = db.all(sql);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching upcoming callbacks:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming callbacks' });
  }
});

// Get dashboard statistics
router.get('/stats', (req, res) => {
  try {
    const stats = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];

    // Total leads
    stats.total = db.get('SELECT COUNT(*) as count FROM leads')?.count || 0;

    // Today's callbacks count (leads scheduled for today's day of week)
    stats.todayCallbacks = db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE callback_days LIKE ?
    `, [`%${todayDay}%`])?.count || 0;

    // Leads with callbacks scheduled
    stats.scheduledCallbacks = db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE callback_days IS NOT NULL AND callback_days != '[]' AND callback_days != ''
    `)?.count || 0;

    // This week's new leads
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    stats.newThisWeek = db.get(`
      SELECT COUNT(*) as count FROM leads WHERE DATE(created_at) >= DATE(?)
    `, [weekAgo])?.count || 0;

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get single lead by ID
router.get('/:id', param('id').isInt(), (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const lead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get contact history
    const history = db.all(`
      SELECT * FROM contact_history WHERE lead_id = ? ORDER BY contact_date DESC
    `, [req.params.id]);

    res.json({ ...lead, contact_history: history });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// Create new lead
router.post('/', validateLead, (req, res) => {
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
      callback_date
    } = req.body;

    // Convert arrays to JSON strings
    const callbackDaysJson = Array.isArray(callback_days) ? JSON.stringify(callback_days) : callback_days;
    const callbackTimeSlotsJson = Array.isArray(callback_time_slots) ? JSON.stringify(callback_time_slots) : callback_time_slots;

    const sql = `
      INSERT INTO leads (
        contact_date, dispensary_name, address, city, state, zip_code,
        dispensary_number, contact_name, contact_position, manager_name, owner_name,
        contact_number, contact_email, website, current_pos_system,
        notes, callback_days, callback_time_slots, callback_time_from, callback_time_to, priority, callback_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = db.run(sql, [
      contact_date, dispensary_name, address, city, state, zip_code,
      dispensary_number, contact_name, contact_position, manager_name, owner_name,
      contact_number, contact_email, website, current_pos_system,
      notes, callbackDaysJson, callbackTimeSlotsJson, callback_time_from, callback_time_to, priority, callback_date || null
    ]);

    const newLead = db.get('SELECT * FROM leads WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(newLead);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// Update lead
router.put('/:id', [param('id').isInt(), ...validateLead], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
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
      callback_date
    } = req.body;

    // Convert arrays to JSON strings
    const callbackDaysJson = Array.isArray(callback_days) ? JSON.stringify(callback_days) : callback_days;
    const callbackTimeSlotsJson = Array.isArray(callback_time_slots) ? JSON.stringify(callback_time_slots) : callback_time_slots;

    const sql = `
      UPDATE leads SET
        contact_date = ?,
        dispensary_name = ?,
        address = ?,
        city = ?,
        state = ?,
        zip_code = ?,
        dispensary_number = ?,
        contact_name = ?,
        contact_position = ?,
        manager_name = ?,
        owner_name = ?,
        contact_number = ?,
        contact_email = ?,
        website = ?,
        current_pos_system = ?,
        notes = ?,
        callback_days = ?,
        callback_time_slots = ?,
        callback_time_from = ?,
        callback_time_to = ?,
        priority = ?,
        callback_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [
      contact_date, dispensary_name, address, city, state, zip_code,
      dispensary_number, contact_name, contact_position, manager_name, owner_name,
      contact_number, contact_email, website, current_pos_system,
      notes, callbackDaysJson, callbackTimeSlotsJson, callback_time_from, callback_time_to, priority,
      callback_date || null,
      req.params.id
    ]);

    const updatedLead = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// Add contact history entry
router.post('/:id/history', [
  param('id').isInt(),
  body('contact_method').optional().isIn(['Phone', 'Email', 'In-Person', 'Text', 'Other']),
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { contact_method, contact_person, notes, outcome, next_callback } = req.body;

    const result = db.run(`
      INSERT INTO contact_history (lead_id, contact_method, contact_person, notes, outcome, next_callback)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.params.id, contact_method, contact_person, notes, outcome, next_callback]);

    // Update lead's callback_datetime if next_callback is provided
    if (next_callback) {
      db.run(`
        UPDATE leads SET callback_datetime = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [next_callback, req.params.id]);
    }

    // Update lead's updated_at
    db.run(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);

    const newHistory = db.get('SELECT * FROM contact_history WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(newHistory);
  } catch (error) {
    console.error('Error adding contact history:', error);
    res.status(500).json({ error: 'Failed to add contact history' });
  }
});

// Get contact history for a lead
router.get('/:id/history', param('id').isInt(), (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const history = db.all(`
      SELECT * FROM contact_history WHERE lead_id = ? ORDER BY contact_date DESC
    `, [req.params.id]);

    res.json(history);
  } catch (error) {
    console.error('Error fetching contact history:', error);
    res.status(500).json({ error: 'Failed to fetch contact history' });
  }
});

// Delete lead
router.delete('/:id', param('id').isInt(), (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Delete contact history first (cascade not automatically handled in sql.js)
    db.run('DELETE FROM contact_history WHERE lead_id = ?', [req.params.id]);
    db.run('DELETE FROM leads WHERE id = ?', [req.params.id]);

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

module.exports = router;
