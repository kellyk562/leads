const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/init');
const emailService = require('../services/emailService');

const router = express.Router();

// GET /api/email/status — check if email sending is configured
router.get('/status', (req, res) => {
  const configured = emailService.isConfigured();
  res.json({
    configured,
    user: configured ? (process.env.EMAIL_FROM || 'Resend configured') : null,
  });
});

// POST /api/email/test — verify email connection works
router.post('/test', async (req, res) => {
  if (!emailService.isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Email is not configured' });
  }
  try {
    await emailService.verifyConnection();
    res.json({ ok: true });
  } catch (error) {
    console.error('Email verification failed:', error);
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
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({ error: 'Email is not configured. Add RESEND_API_KEY to your environment variables.' });
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

    const info = await emailService.sendEmail({ to, subject, text: emailBody });

    // Auto-log to contact history
    const outcome = templateName
      ? `Email sent (template: ${templateName})`
      : 'Email sent';

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
    res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
});

// POST /api/email/batch — send a template email to multiple leads
router.post('/batch', [
  body('leadIds').isArray({ min: 1 }).withMessage('leadIds array is required'),
  body('templateId').isInt().withMessage('templateId is required'),
], async (req, res) => {
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({ error: 'Email is not configured. Add RESEND_API_KEY to your environment variables.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { leadIds, templateId } = req.body;

    // Fetch template
    const template = await db.get('SELECT * FROM email_templates WHERE id = $1', [templateId]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Fetch all leads by IDs
    const leads = await db.all(
      `SELECT * FROM leads WHERE id = ANY($1::int[])`,
      [leadIds]
    );

    let sent = 0;
    let skipped = 0;
    const sendErrors = [];

    // Merge field replacer
    const renderTemplate = (text, lead) => {
      return text
        .replace(/\{\{dispensary_name\}\}/g, lead.dispensary_name || '')
        .replace(/\{\{contact_name\}\}/g, lead.contact_name || lead.manager_name || '')
        .replace(/\{\{manager_name\}\}/g, lead.manager_name || '')
        .replace(/\{\{contact_email\}\}/g, lead.contact_email || '')
        .replace(/\{\{current_pos_system\}\}/g, lead.current_pos_system || '')
        .replace(/\{\{city\}\}/g, lead.city || '')
        .replace(/\{\{state\}\}/g, lead.state || '')
        .replace(/\{\{stage\}\}/g, lead.stage || '');
    };

    for (const lead of leads) {
      if (!lead.contact_email) {
        skipped++;
        continue;
      }

      try {
        const subject = renderTemplate(template.subject, lead);
        const body = renderTemplate(template.body, lead);

        await emailService.sendEmail({ to: lead.contact_email, subject, text: body });

        // Log to contact history
        await db.run(`
          INSERT INTO contact_history (lead_id, contact_method, notes, outcome, email_subject, email_template_id)
          VALUES ($1, 'Email', $2, $3, $4, $5)
        `, [
          lead.id,
          body,
          `Email sent (template: ${template.name})`,
          subject,
          templateId,
        ]);

        // Update lead's updated_at
        await db.run('UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [lead.id]);
        sent++;
      } catch (err) {
        sendErrors.push(`${lead.dispensary_name}: ${err.message}`);
      }
    }

    res.json({ sent, skipped, errors: sendErrors });
  } catch (error) {
    console.error('Batch email failed:', error);
    res.status(500).json({ error: `Batch email failed: ${error.message}` });
  }
});

module.exports = router;
