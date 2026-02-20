const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const db = require('../database/init');

const router = express.Router();

// Get all tasks with optional filtering
router.get('/', async (req, res) => {
  try {
    const { status, priority, lead_id, period } = req.query;

    let sql = `
      SELECT t.*, l.dispensary_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
      sql += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (lead_id) {
      sql += ` AND t.lead_id = $${paramIndex}`;
      params.push(lead_id);
      paramIndex++;
    }

    if (period === 'overdue') {
      sql += ` AND t.due_date < CURRENT_DATE AND t.status = 'pending'`;
    } else if (period === 'today') {
      sql += ` AND t.due_date = CURRENT_DATE AND t.status = 'pending'`;
    } else if (period === 'upcoming') {
      sql += ` AND t.due_date > CURRENT_DATE AND t.status = 'pending'`;
    }

    sql += ` ORDER BY t.status ASC, t.due_date ASC, t.due_time ASC NULLS LAST`;

    const tasks = await db.all(sql, params);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task stats
router.get('/stats', async (req, res) => {
  try {
    const overdue = await db.get(`
      SELECT COUNT(*) as count FROM tasks
      WHERE due_date < CURRENT_DATE AND status = 'pending'
    `);
    const today = await db.get(`
      SELECT COUNT(*) as count FROM tasks
      WHERE due_date = CURRENT_DATE AND status = 'pending'
    `);
    const upcoming = await db.get(`
      SELECT COUNT(*) as count FROM tasks
      WHERE due_date > CURRENT_DATE AND status = 'pending'
    `);

    res.json({
      overdue: parseInt(overdue?.count || 0, 10),
      today: parseInt(today?.count || 0, 10),
      upcoming: parseInt(upcoming?.count || 0, 10)
    });
  } catch (error) {
    console.error('Error fetching task stats:', error);
    res.status(500).json({ error: 'Failed to fetch task stats' });
  }
});

// Get single task by ID
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const task = await db.get(`
      SELECT t.*, l.dispensary_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.id = $1
    `, [req.params.id]);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create task
router.post('/', [
  body('lead_id').isInt().withMessage('Lead ID is required'),
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('due_date').notEmpty().withMessage('Due date is required'),
  body('priority').optional().isIn(['Low', 'Medium', 'High']),
  body('due_time').optional({ values: 'falsy' }),
  body('description').optional({ values: 'falsy' }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { lead_id, title, description, due_date, due_time, priority = 'Medium' } = req.body;

    // Verify lead exists
    const lead = await db.get('SELECT id FROM leads WHERE id = $1', [lead_id]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const result = await db.run(`
      INSERT INTO tasks (lead_id, title, description, due_date, due_time, priority)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [lead_id, title, description || null, due_date, due_time || null, priority]);

    const newTask = await db.get(`
      SELECT t.*, l.dispensary_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.id = $1
    `, [result.lastInsertRowid]);

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:id', [
  param('id').isInt(),
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('due_date').notEmpty().withMessage('Due date is required'),
  body('priority').optional().isIn(['Low', 'Medium', 'High']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { title, description, due_date, due_time, priority } = req.body;

    await db.run(`
      UPDATE tasks SET
        title = $1,
        description = $2,
        due_date = $3,
        due_time = $4,
        priority = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [title, description || null, due_date, due_time || null, priority || 'Medium', req.params.id]);

    const updatedTask = await db.get(`
      SELECT t.*, l.dispensary_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.id = $1
    `, [req.params.id]);

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Toggle task completion
router.patch('/:id/complete', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newStatus = existing.status === 'pending' ? 'completed' : 'pending';
    const completedAt = newStatus === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL';

    await db.run(`
      UPDATE tasks SET
        status = $1,
        completed_at = ${completedAt},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newStatus, req.params.id]);

    const updatedTask = await db.get(`
      SELECT t.*, l.dispensary_name
      FROM tasks t
      JOIN leads l ON t.lead_id = l.id
      WHERE t.id = $1
    `, [req.params.id]);

    res.json(updatedTask);
  } catch (error) {
    console.error('Error toggling task:', error);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

// Delete task
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.run('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
