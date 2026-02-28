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
    user: configured ? (process.env.EMAIL_FROM || process.env.GMAIL_USER) : null,
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
      return res.status(503).json({ error: 'Email is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER to your environment variables.' });
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
      return res.status(503).json({ error: 'Email is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER to your environment variables.' });
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

// --- Cadence helper ---

// Cadence step labels (keep in sync with leads.js & client)
const CADENCE_LABELS = ['Not started', 'Intro sent', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Break-up email'];

/**
 * Advance a lead's cadence to `toStep` and schedule the next email if a template is mapped.
 * Forward-only: skips if lead is already at or past `toStep`.
 * Returns { updated: boolean, scheduledEmail: object|null }
 */
async function advanceCadenceAndScheduleNext(leadId, toStep) {
  const lead = await db.get('SELECT id, cadence_step FROM leads WHERE id = $1', [leadId]);
  if (!lead) return { updated: false, scheduledEmail: null };

  // Forward-only guard
  if ((lead.cadence_step || 0) >= toStep) return { updated: false, scheduledEmail: null };

  const label = CADENCE_LABELS[toStep] || `Step ${toStep}`;

  await db.run('UPDATE leads SET cadence_step = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [toStep, leadId]);

  // Log to contact history
  await db.run(`
    INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
    VALUES ($1, 'Other', $2, $3)
  `, [leadId, `Cadence advanced to Step ${toStep}: ${label}`, `Cadence: ${label}`]);

  // Check for duplicate pending scheduled email
  let scheduledEmail = null;
  const existing = await db.get(
    `SELECT 1 FROM scheduled_emails WHERE lead_id = $1 AND cadence_step = $2 AND status = 'pending'`,
    [leadId, toStep]
  );

  if (!existing) {
    const template = await db.get('SELECT * FROM email_templates WHERE cadence_step = $1 LIMIT 1', [toStep]);
    if (template) {
      const delayDays = template.delay_days || 0;
      const result = await db.run(`
        INSERT INTO scheduled_emails (lead_id, template_id, cadence_step, scheduled_for)
        VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)
        RETURNING id
      `, [leadId, template.id, toStep, delayDays]);
      scheduledEmail = await db.get('SELECT * FROM scheduled_emails WHERE id = $1', [result.lastInsertRowid]);
    }
  }

  return { updated: true, scheduledEmail };
}

// --- Scheduled Emails ---

// Merge field replacer (shared with batch)
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

// Process pending scheduled emails (called from briefing endpoint trigger)
async function processScheduledEmails() {
  if (!emailService.isConfigured()) return { processed: 0 };

  const pending = await db.all(`
    SELECT se.*, et.subject AS tpl_subject, et.body AS tpl_body, et.name AS tpl_name
    FROM scheduled_emails se
    JOIN email_templates et ON et.id = se.template_id
    WHERE se.status = 'pending' AND se.scheduled_for <= NOW()
    ORDER BY se.scheduled_for ASC
    LIMIT 20
  `);

  let processed = 0;
  for (const se of pending) {
    const lead = await db.get('SELECT * FROM leads WHERE id = $1', [se.lead_id]);
    if (!lead || !lead.contact_email) {
      await db.run(`UPDATE scheduled_emails SET status = 'failed', error = $1 WHERE id = $2`,
        [!lead ? 'Lead not found' : 'No email address', se.id]);
      continue;
    }

    try {
      const subject = renderTemplate(se.tpl_subject, lead);
      const body = renderTemplate(se.tpl_body, lead);

      await emailService.sendEmail({ to: lead.contact_email, subject, text: body });

      await db.run(`UPDATE scheduled_emails SET status = 'sent', sent_at = NOW() WHERE id = $1`, [se.id]);

      // Log to contact history
      await db.run(`
        INSERT INTO contact_history (lead_id, contact_method, notes, outcome, email_subject, email_template_id)
        VALUES ($1, 'Email', $2, $3, $4, $5)
      `, [se.lead_id, body, `Auto-email sent (template: ${se.tpl_name})`, subject, se.template_id]);

      await db.run('UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [se.lead_id]);
      processed++;

      // Auto-advance cadence to next step (cascade: sending step N → schedule step N+1)
      const nextStep = (se.cadence_step || 0) + 1;
      if (nextStep <= 5) {
        await advanceCadenceAndScheduleNext(se.lead_id, nextStep).catch(err =>
          console.error(`advanceCadence error for lead ${se.lead_id}:`, err)
        );
      }
    } catch (err) {
      await db.run(`UPDATE scheduled_emails SET status = 'failed', error = $1 WHERE id = $2`,
        [err.message, se.id]);
    }
  }
  return { processed };
}

// GET /api/email/scheduled — list pending/recent scheduled emails
router.get('/scheduled', async (req, res) => {
  try {
    const emails = await db.all(`
      SELECT se.*, l.dispensary_name, et.name AS template_name
      FROM scheduled_emails se
      JOIN leads l ON l.id = se.lead_id
      JOIN email_templates et ON et.id = se.template_id
      WHERE se.status IN ('pending', 'sent')
      ORDER BY
        CASE WHEN se.status = 'pending' THEN 0 ELSE 1 END,
        se.scheduled_for ASC
      LIMIT 50
    `);
    res.json(emails);
  } catch (error) {
    console.error('Error fetching scheduled emails:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled emails' });
  }
});

// DELETE /api/email/scheduled/:id — cancel a pending scheduled email
router.delete('/scheduled/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await db.get('SELECT * FROM scheduled_emails WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Scheduled email not found' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending emails can be cancelled' });
    }
    await db.run(`UPDATE scheduled_emails SET status = 'cancelled' WHERE id = $1`, [id]);
    res.json({ message: 'Scheduled email cancelled' });
  } catch (error) {
    console.error('Error cancelling scheduled email:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled email' });
  }
});

module.exports = router;
module.exports.processScheduledEmails = processScheduledEmails;
module.exports.advanceCadenceAndScheduleNext = advanceCadenceAndScheduleNext;
