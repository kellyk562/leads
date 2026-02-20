const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/init');

const router = express.Router();

// Get all email templates
router.get('/', async (req, res) => {
  try {
    const templates = await db.all(
      'SELECT * FROM email_templates ORDER BY is_default DESC, name ASC'
    );
    res.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// Get single email template
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const template = await db.get('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

// Create email template
router.post('/', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('subject').notEmpty().trim().withMessage('Subject is required'),
  body('body').notEmpty().trim().withMessage('Body is required'),
  body('category').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, subject, body: templateBody, category } = req.body;

    const result = await db.run(
      `INSERT INTO email_templates (name, subject, body, category)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, subject, templateBody, category || 'General']
    );

    const newTemplate = await db.get('SELECT * FROM email_templates WHERE id = $1', [result.lastInsertRowid]);
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('Error creating email template:', error);
    res.status(500).json({ error: 'Failed to create email template' });
  }
});

// Update email template
router.put('/:id', [
  param('id').isInt(),
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('subject').notEmpty().trim().withMessage('Subject is required'),
  body('body').notEmpty().trim().withMessage('Body is required'),
  body('category').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { name, subject, body: templateBody, category } = req.body;

    await db.run(
      `UPDATE email_templates SET name = $1, subject = $2, body = $3, category = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [name, subject, templateBody, category || 'General', req.params.id]
    );

    const updated = await db.get('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

// Delete email template
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await db.get('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await db.run('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ error: 'Failed to delete email template' });
  }
});

module.exports = router;
