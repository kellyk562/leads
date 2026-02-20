const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/init');
const emailService = require('../services/emailService');

const router = express.Router();

// GET /api/email/status — check if Gmail SMTP is configured
router.get('/status', (req, res) => {
  const configured = emailService.isConfigured();
  res.json({
    configured,
    user: configured ? process.env.GMAIL_USER : null,
  });
});

// POST /api/email/test — verify SMTP connection works
router.post('/test', async (req, res) => {
  if (!emailService.isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Gmail SMTP is not configured' });
  }
  try {
    await emailService.verifyConnection();
    res.json({ ok: true });
  } catch (error) {
    console.error('SMTP verification failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/email/send — send an email and auto-log to contact history
router.post('/send', [
  body('leadId').isInt().withMessage('leadId is required'),
  body('to').isEmail().withMessage('Valid email address is required'),
  body('subject').notEmpty().trim().withMessage('Subject is required'),
  body('body').notEmpty().withMessage('Body is required'),
], async (req, res) => {
  if (!emailService.isConfigured()) {
    return res.status(503).json({ error: 'Gmail SMTP is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { leadId, to, subject, body: emailBody, templateId, templateName } = req.body;

  // Verify lead exists
  const lead = await db.get('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  try {
    const info = await emailService.sendEmail({ to, subject, text: emailBody });

    // Auto-log to contact history
    const outcome = templateName
      ? `Email sent via Gmail (template: ${templateName})`
      : 'Email sent via Gmail';

    const historyResult = await db.run(`
      INSERT INTO contact_history (lead_id, contact_method, notes, outcome, email_subject, email_template_id)
      VALUES ($1, 'Email', $2, $3, $4, $5)
      RETURNING id
    `, [
      leadId,
      emailBody,
      outcome,
      subject,
      templateId || null,
    ]);

    // Update lead's updated_at
    await db.run('UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [leadId]);

    const historyEntry = await db.get('SELECT * FROM contact_history WHERE id = $1', [historyResult.lastInsertRowid]);

    res.json({
      success: true,
      messageId: info.messageId,
      historyEntry,
    });
  } catch (error) {
    console.error('Email send failed:', error);
    if (error.code === 'EAUTH') {
      return res.status(401).json({ error: 'Gmail authentication failed. Check your App Password.' });
    }
    res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
});

module.exports = router;
