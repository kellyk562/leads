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

// Default callback hour: 10 AM Pacific (UTC-8 = 18, UTC-7 DST = 17)
const DEFAULT_HOUR_PT = 10;

// Get current time in Pacific
function pacificNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

// Build a Date in Pacific time, returned as UTC for DB storage
function pacificDate(year, month, day, hour, min) {
  // Create an ISO string as if in Pacific, then let JS resolve offset
  const pad = (n) => String(n).padStart(2, '0');
  // Use a temp date to determine if DST is active
  const tempStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(min)}:00`;
  const opts = { timeZone: 'America/Los_Angeles', timeZoneName: 'short' };
  const ptNow = new Date(tempStr + 'Z'); // rough guess
  const formatted = ptNow.toLocaleString('en-US', opts);
  const isPDT = formatted.includes('PDT');
  const offsetHours = isPDT ? 7 : 8;
  return new Date(`${tempStr}+00:00`).getTime() + offsetHours * 3600000;
}

// Parse natural-language callback time into a Date (Pacific-aware, defaults to 10 AM PT)
function parseCallbackTime(timeStr) {
  if (!timeStr) return null;
  const lower = timeStr.toLowerCase().trim();

  const nowPT = pacificNow();
  const todayPT = new Date(nowPT.getFullYear(), nowPT.getMonth(), nowPT.getDate());

  // Helper: extract time from a string, default to 10 AM PT if none found
  function extractTime(str) {
    const m = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return { hour: DEFAULT_HOUR_PT, min: 0 };
    let hour = parseInt(m[1]);
    const min = parseInt(m[2] || '0');
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { hour, min };
  }

  // Try direct ISO/date parse — but force 10 AM PT if time component is midnight (no time given)
  const direct = new Date(timeStr);
  if (!isNaN(direct.getTime()) && direct > new Date(0)) {
    // Check if time was midnight (likely date-only input)
    if (direct.getUTCHours() === 0 && direct.getUTCMinutes() === 0) {
      const ts = pacificDate(direct.getUTCFullYear(), direct.getUTCMonth(), direct.getUTCDate(), DEFAULT_HOUR_PT, 0);
      const d = new Date(ts);
      if (d > new Date()) return d;
    } else if (direct > new Date()) {
      return direct;
    }
  }

  // Match patterns like "tomorrow at 2pm", "tomorrow 3:00 PM", "tomorrow afternoon"
  if (lower.includes('tomorrow')) {
    const tmrw = new Date(todayPT); tmrw.setDate(tmrw.getDate() + 1);
    let hour = DEFAULT_HOUR_PT, min = 0;
    if (lower.includes('morning')) hour = 9;
    else if (lower.includes('afternoon')) hour = 14;
    else if (lower.includes('evening')) hour = 17;
    else {
      const t = extractTime(lower);
      // Only use extracted time if there was an actual number match beyond "tomorrow"
      if (lower.match(/\d/)) { hour = t.hour; min = t.min; }
    }
    const ts = pacificDate(tmrw.getFullYear(), tmrw.getMonth(), tmrw.getDate(), hour, min);
    return new Date(ts);
  }

  // Match "in X hours/minutes"
  const inMatch = lower.match(/in\s+(\d+)\s*(hour|minute|min|hr)/);
  if (inMatch) {
    const val = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const d = new Date();
    if (unit.startsWith('hour') || unit.startsWith('hr')) d.setHours(d.getHours() + val);
    else d.setMinutes(d.getMinutes() + val);
    return d;
  }

  // Match time-only like "2pm", "3:30 PM", "14:00"
  const timeMatch = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (timeMatch) {
    const { hour, min } = extractTime(lower);
    // Schedule for today PT if time hasn't passed, otherwise tomorrow
    let ts = pacificDate(todayPT.getFullYear(), todayPT.getMonth(), todayPT.getDate(), hour, min);
    if (new Date(ts) <= new Date()) {
      const tmrw = new Date(todayPT); tmrw.setDate(tmrw.getDate() + 1);
      ts = pacificDate(tmrw.getFullYear(), tmrw.getMonth(), tmrw.getDate(), hour, min);
    }
    return new Date(ts);
  }

  // Match day names like "Monday at 2pm", "Monday", "next Wednesday"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      const { hour, min } = lower.match(/\d/) ? extractTime(lower) : { hour: DEFAULT_HOUR_PT, min: 0 };
      const d = new Date(todayPT);
      const diff = (i - d.getDay() + 7) % 7 || 7; // always next occurrence
      d.setDate(d.getDate() + diff);
      const ts = pacificDate(d.getFullYear(), d.getMonth(), d.getDate(), hour, min);
      return new Date(ts);
    }
  }

  // Fallback: if string has a date-like component, try parsing with default 10 AM PT
  const dateMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : todayPT.getFullYear();
    const { hour, min } = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i) ? extractTime(lower) : { hour: DEFAULT_HOUR_PT, min: 0 };
    const ts = pacificDate(year, month, day, hour, min);
    const d = new Date(ts);
    if (d > new Date()) return d;
  }

  return null;
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

      // Auto-schedule follow-up AI call if we got a callback time
      if (preferredTime && leadId) {
        try {
          const scheduledFor = parseCallbackTime(preferredTime);
          if (scheduledFor && scheduledFor > new Date()) {
            await pool.query(
              `INSERT INTO scheduled_call_batches (lead_ids, scheduled_for, delay_seconds, status)
               VALUES ($1, $2, 30, 'pending')`,
              [JSON.stringify([leadId]), scheduledFor]
            );
            console.log(`Auto-scheduled follow-up call for lead ${leadId} at ${scheduledFor.toISOString()}`);
          }
        } catch (schedErr) {
          console.error('Auto-schedule follow-up error:', schedErr);
        }
      }
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
    const transcript = message.transcript ? JSON.stringify(message.transcript) : null;
    const recordingUrl = message.recordingUrl || null;
    const cost = message.cost || null;
    const endedReason = message.endedReason || message.call?.endedReason || null;
    const status = endedReason === 'customer-did-not-answer' ? 'no_answer'
      : endedReason === 'customer-busy' ? 'busy'
      : endedReason === 'voicemail' ? 'voicemail'
      : duration && duration > 0 ? 'completed'
      : 'failed';

    // Extract structured analysis data from Vapi
    const analysis = message.analysis || {};
    let analysisSummary = null;
    let sentiment = null;
    let successEval = null;
    let appointmentBooked = null;

    for (const [, value] of Object.entries(analysis)) {
      if (value.name === 'Call Summary') analysisSummary = value.result;
      else if (value.name === 'Customer Sentiment') sentiment = value.result;
      else if (value.name === 'Success Evaluation - Descriptive') successEval = value.result;
      else if (value.name === 'Appointment Booked') appointmentBooked = value.result;
    }

    // Prefer analysis summary over generic summary
    const summary = analysisSummary || message.summary || null;

    // Merge analysis into metadata for storage
    const callMetadata = {
      ...metadata,
      ...(Object.keys(analysis).length > 0 ? { analysis: { sentiment, successEval, appointmentBooked } } : {}),
    };

    // Update call_logs
    if (vapiCallId) {
      const existingLog = await get('SELECT id FROM call_logs WHERE vapi_call_id = $1', [vapiCallId]);
      if (existingLog) {
        await run(
          `UPDATE call_logs SET status = $1, duration = $2, ended_at = CURRENT_TIMESTAMP,
           summary = $3, transcript = $4, recording_url = $5, cost = $6, metadata = $7
           WHERE vapi_call_id = $8`,
          [status, duration, summary, transcript, recordingUrl, cost, JSON.stringify(callMetadata), vapiCallId]
        );
      } else {
        await run(
          `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, duration, ended_at, summary, transcript, recording_url, cost, metadata)
           VALUES ($1, $2, 'outbound', $3, $4, CURRENT_TIMESTAMP, $5, $6, $7, $8, $9)`,
          [leadId, vapiCallId, status, duration, summary, transcript, recordingUrl, cost, JSON.stringify(callMetadata)]
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

      // Log to contact_history with rich analysis data
      const parts = [`AI Call Report - Duration: ${duration ? `${Math.round(duration)}s` : 'N/A'}`];
      if (sentiment) parts.push(`Sentiment: ${sentiment}`);
      if (successEval) parts.push(`Outcome: ${successEval}`);
      if (appointmentBooked) parts.push('Appointment booked!');
      if (summary) parts.push(summary.substring(0, 500));

      await run(
        `INSERT INTO contact_history (lead_id, contact_method, notes, outcome, recording_url)
         VALUES ($1, 'Phone', $2, $3, $4)`,
        [leadId, parts.join('. '), `Call ${status}`, recordingUrl]
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
