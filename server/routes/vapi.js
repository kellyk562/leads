const express = require('express');
const router = express.Router();
const { get, run, pool } = require('../database/init');
const emailService = require('../services/emailService');

// Stage ordering for regression guard
const STAGE_ORDER = [
  'New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed',
  'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'
];

function stageIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

// POST /api/vapi/tool-handler — handles in-call tool invocations from Vapi
router.post('/tool-handler', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.toolCalls || !Array.isArray(message.toolCalls)) {
      return res.status(400).json({ error: 'Invalid tool call payload' });
    }

    const metadata = message.call?.metadata || req.body.call?.metadata || {};
    const leadId = metadata.lead_id;
    const vapiCallId = message.call?.id || req.body.call?.id || null;

    const results = [];

    for (const toolCall of message.toolCalls) {
      const fnName = toolCall.function?.name;
      const args = toolCall.function?.arguments || {};

      if (fnName === 'save_contact_info') {
        await handleSaveContactInfo({ leadId, vapiCallId, args, toolCall, results, metadata });
      } else if (fnName === 'save_callback') {
        await handleSaveCallback({ leadId, vapiCallId, args, toolCall, results, metadata });
      } else if (fnName === 'schedule_demo') {
        await handleScheduleDemo({ leadId, vapiCallId, args, toolCall, results, metadata });
      } else {
        results.push({
          toolCallId: toolCall.id,
          result: `Unknown tool: ${fnName}`,
        });
      }
    }

    return res.json({ results });
  } catch (error) {
    console.error('Vapi tool-handler error:', error);
    return res.status(200).json({ results: [{ toolCallId: 'error', result: 'Internal error processing tool call' }] });
  }
});

async function handleSaveContactInfo({ leadId, vapiCallId, args, toolCall, results, metadata }) {
  try {
    const { owner_name, email, notes, dispensary_name } = args;

    // Update the lead record with collected contact info
    if (leadId) {
      const updates = [];
      const params = [];
      let paramIdx = 1;

      if (owner_name) { updates.push(`owner_name = $${paramIdx++}`); params.push(owner_name); }
      if (email) { updates.push(`contact_email = $${paramIdx++}`); params.push(email); }
      if (notes) { updates.push(`notes = $${paramIdx++}`); params.push(notes); }
      if (dispensary_name) { updates.push(`dispensary_name = $${paramIdx++}`); params.push(dispensary_name); }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(leadId);
        await run(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
      }

      await run(
        `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
         VALUES ($1, 'Phone', $2, $3)`,
        [leadId, `AI Call - Contact info saved. Owner: ${owner_name || 'N/A'}, Email: ${email || 'N/A'}`, 'Contact Info Collected']
      );
    }

    results.push({ toolCallId: toolCall.id, result: 'Contact info saved successfully' });
  } catch (error) {
    console.error('save_contact_info error:', error);
    results.push({ toolCallId: toolCall.id, result: `Error saving contact info: ${error.message}` });
  }
}

async function handleSaveCallback({ leadId, vapiCallId, args, toolCall, results, metadata }) {
  try {
    // Map Vapi dashboard params → DB columns
    const callbackName = args.owner_name || args.callback_name || null;
    const callbackReason = args.notes || args.callback_reason || null;
    const preferredTime = args.callback_time || args.preferred_time || null;
    const dispensaryName = args.dispensary_name || metadata.dispensary_name || null;

    await run(
      `INSERT INTO callbacks (lead_id, vapi_call_id, callback_name, callback_reason, preferred_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [leadId, vapiCallId, callbackName, callbackReason, preferredTime]
    );

    // Update lead record with owner name and callback info
    if (leadId) {
      const updates = [];
      const params = [];
      let idx = 1;

      if (callbackName) { updates.push(`owner_name = $${idx++}`); params.push(callbackName); }
      if (preferredTime) { updates.push(`callback_time_from = $${idx++}`); params.push(preferredTime); }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(leadId);
        await run(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${idx}`, params);
      }

      // Log to contact_history
      await run(
        `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
         VALUES ($1, 'Phone', $2, $3)`,
        [
          leadId,
          `AI Call - Callback requested by ${callbackName || 'contact'}. Reason: ${callbackReason || 'N/A'}. Preferred time: ${preferredTime || 'N/A'}`,
          'Callback Scheduled'
        ]
      );
    }

    results.push({
      toolCallId: toolCall.id,
      result: 'Callback saved successfully',
    });
  } catch (error) {
    console.error('save_callback error:', error);
    results.push({
      toolCallId: toolCall.id,
      result: `Error saving callback: ${error.message}`,
    });
  }
}

async function handleScheduleDemo({ leadId, vapiCallId, args, toolCall, results, metadata }) {
  try {
    // Map Vapi dashboard params → DB columns
    const contactName = args.owner_name || args.contact_name || null;
    const contactEmail = args.owner_email || args.contact_email || null;
    const demoDate = args.preferred_date || args.demo_date || null;
    const demoTime = args.preferred_time || args.demo_time || null;
    const notes = args.notes || null;
    const dispensaryName = metadata.dispensary_name || args.dispensary_name || '';
    const zoomLink = process.env.DEFAULT_ZOOM_LINK || 'https://zoom.us/j/your-meeting-id';

    // Save demo record
    const demoResult = await run(
      `INSERT INTO demos (lead_id, vapi_call_id, contact_name, contact_email, dispensary_name, demo_date, demo_time, zoom_link, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [leadId, vapiCallId, contactName, contactEmail, dispensaryName, demoDate, demoTime, zoomLink, notes]
    );

    // Send confirmation email if we have an email address
    let confirmationSent = false;
    const emailTo = contactEmail || (leadId ? (await get('SELECT contact_email FROM leads WHERE id = $1', [leadId]))?.contact_email : null);

    if (emailTo && emailService.isConfigured()) {
      try {
        const htmlBody = buildDemoConfirmationHtml({
          contact_name: contactName || 'there',
          dispensary_name: dispensaryName,
          demo_date: demoDate || 'TBD',
          demo_time: demoTime || 'TBD',
          zoom_link: zoomLink,
        });

        await emailService.sendEmail({
          to: emailTo,
          subject: `Demo Confirmed - ${dispensaryName || 'Weedhurry POS'}`,
          text: `Hi ${contactName || 'there'}, your demo has been scheduled for ${demoDate || 'TBD'} at ${demoTime || 'TBD'}. Join here: ${zoomLink}`,
          html: htmlBody,
        });
        confirmationSent = true;

        // Update demo record
        await run('UPDATE demos SET confirmation_sent = true WHERE id = $1', [demoResult.lastInsertRowid]);
      } catch (emailError) {
        console.error('Demo confirmation email error:', emailError);
      }
    }

    // Update lead stage to "Demo Scheduled" (guard against regression)
    if (leadId) {
      const lead = await get('SELECT stage FROM leads WHERE id = $1', [leadId]);
      if (lead && stageIndex(lead.stage) < stageIndex('Demo Scheduled')) {
        await run('UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['Demo Scheduled', leadId]);
      }

      // Log to contact_history
      await run(
        `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
         VALUES ($1, 'Phone', $2, $3)`,
        [
          leadId,
          `AI Call - Demo scheduled for ${demoDate || 'TBD'} at ${demoTime || 'TBD'}. Contact: ${contactName || 'N/A'}. ${confirmationSent ? 'Confirmation email sent.' : 'No confirmation email sent.'}`,
          'Demo Scheduled'
        ]
      );
    }

    results.push({
      toolCallId: toolCall.id,
      result: `Demo scheduled successfully${confirmationSent ? ' and confirmation email sent' : ''}`,
    });
  } catch (error) {
    console.error('schedule_demo error:', error);
    results.push({
      toolCallId: toolCall.id,
      result: `Error scheduling demo: ${error.message}`,
    });
  }
}

function buildDemoConfirmationHtml({ contact_name, dispensary_name, demo_date, demo_time, zoom_link }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: linear-gradient(135deg, #2d5a27 0%, #4caf50 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Demo Confirmed!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Weedhurry POS System</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px;">Hi ${contact_name},</p>
    <p>Your demo for <strong>${dispensary_name}</strong> has been scheduled. Here are the details:</p>
    <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; font-weight: bold; color: #2d5a27;">Date:</td><td style="padding: 8px 0;">${demo_date}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold; color: #2d5a27;">Time:</td><td style="padding: 8px 0;">${demo_time}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold; color: #2d5a27;">Platform:</td><td style="padding: 8px 0;">Zoom</td></tr>
      </table>
    </div>
    <div style="text-align: center; margin: 25px 0;">
      <a href="${zoom_link}" style="display: inline-block; background: #2d5a27; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Join Zoom Meeting</a>
    </div>
    <p style="font-size: 14px; color: #666;">During the demo, we'll cover:</p>
    <ul style="color: #666; font-size: 14px;">
      <li>Live POS system walkthrough ($300/mo plan)</li>
      <li>Integration with your current workflow</li>
      <li>Compliance and reporting features</li>
      <li>Q&A session</li>
    </ul>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
    <p style="font-size: 13px; color: #999; text-align: center;">
      Need to reschedule? Reply to this email or call us directly.<br>
      &copy; Weedhurry POS | Powering Modern Dispensaries
    </p>
  </div>
</body>
</html>`;
}

// POST /api/vapi/call-status — end-of-call report webhook
router.post('/call-status', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.type !== 'end-of-call-report') {
      return res.status(200).json({ ok: true });
    }

    const vapiCallId = message.call?.id || null;
    const metadata = message.call?.metadata || {};
    const leadId = metadata.lead_id;

    const duration = message.durationSeconds || message.call?.duration || null;
    const summary = message.summary || null;
    const transcript = message.transcript ? JSON.stringify(message.transcript) : null;
    const recordingUrl = message.recordingUrl || null;
    const cost = message.cost || null;
    const endedReason = message.endedReason || message.call?.endedReason || null;
    const status = endedReason === 'customer-did-not-answer' ? 'no_answer'
      : endedReason === 'customer-busy' ? 'busy'
      : endedReason === 'voicemail' ? 'voicemail'
      : duration && duration > 0 ? 'completed'
      : 'failed';

    // Update call_logs
    if (vapiCallId) {
      const existingLog = await get('SELECT id FROM call_logs WHERE vapi_call_id = $1', [vapiCallId]);
      if (existingLog) {
        await run(
          `UPDATE call_logs SET status = $1, duration = $2, ended_at = CURRENT_TIMESTAMP,
           summary = $3, transcript = $4, recording_url = $5, cost = $6
           WHERE vapi_call_id = $7`,
          [status, duration, summary, transcript, recordingUrl, cost, vapiCallId]
        );
      } else {
        await run(
          `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, duration, ended_at, summary, transcript, recording_url, cost)
           VALUES ($1, $2, 'outbound', $3, $4, CURRENT_TIMESTAMP, $5, $6, $7, $8)`,
          [leadId, vapiCallId, status, duration, summary, transcript, recordingUrl, cost]
        );
      }
    }

    // Update lead record
    if (leadId) {
      await run(
        `UPDATE leads SET call_status = $1, call_duration = $2, call_summary = $3,
         last_called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [status, duration, summary, leadId]
      );

      // Log to contact_history
      const summaryText = summary ? summary.substring(0, 500) : `Call ${status}`;
      await run(
        `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
         VALUES ($1, 'Phone', $2, $3)`,
        [
          leadId,
          `AI Call Report - Duration: ${duration ? `${Math.round(duration)}s` : 'N/A'}. ${summaryText}`,
          `Call ${status}`
        ]
      );
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Vapi call-status webhook error:', error);
    // Always return 200 to prevent Vapi retries
    return res.status(200).json({ ok: true });
  }
});

module.exports = router;
