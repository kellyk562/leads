const express = require('express');
const router = express.Router();
const { get, run, all, pool } = require('../database/init');
const emailService = require('../services/emailService');
const zoomService = require('../services/zoomService');

// Stage ordering for regression guard
const STAGE_ORDER = [
  'New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed',
  'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'
];

function stageIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

// Combine callback_day + callback_time_of_day into a parseable string
function buildScheduleInput(callbackDay, callbackTimeOfDay) {
  if (!callbackDay) return null;
  const day = callbackDay.toLowerCase().trim();
  const time = (callbackTimeOfDay && callbackTimeOfDay !== 'not specified') ? callbackTimeOfDay.trim() : '';

  // "today" with relative time like "in 20 minutes"
  if (day === 'today' && time.match(/^in\s+/i)) return time;
  // "today" with a period or specific time
  if (day === 'today' && time) return time;
  // "today" with no time
  if (day === 'today') return 'in 1 hour';
  // "tomorrow" with time
  if (day === 'tomorrow' && time) return `tomorrow ${time}`;
  if (day === 'tomorrow') return 'tomorrow';
  // Day name with time (e.g. "Thursday" + "after 2pm")
  if (time) return `${day} ${time}`;
  // Day name alone
  return day;
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

// Calculate retry time for voicemail/no-answer calls
// Before 4 PM PT → retry in 4 hours
// After 4 PM PT → next business day at 10 AM PT (skip weekends)
function calculateRetryTime() {
  const nowPT = pacificNow();
  if (nowPT.getHours() < 16) {
    // Before 4 PM PT — retry in 4 hours
    return new Date(Date.now() + 4 * 60 * 60 * 1000);
  }
  // After 4 PM PT — next business day at 10 AM PT
  const next = new Date(nowPT);
  next.setDate(next.getDate() + 1);
  // Skip Saturday (6) and Sunday (0)
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  const ts = pacificDate(next.getFullYear(), next.getMonth(), next.getDate(), 10, 0);
  return new Date(ts);
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

  // Match "after Xpm" patterns like "after 2pm", "around 3pm"
  const afterMatch = lower.match(/(?:after|around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (afterMatch) {
    let hour = parseInt(afterMatch[1]);
    const min = parseInt(afterMatch[2] || '0');
    const ampm = afterMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    let ts = pacificDate(todayPT.getFullYear(), todayPT.getMonth(), todayPT.getDate(), hour, min);
    if (new Date(ts) <= new Date()) {
      const tmrw = new Date(todayPT); tmrw.setDate(tmrw.getDate() + 1);
      ts = pacificDate(tmrw.getFullYear(), tmrw.getMonth(), tmrw.getDate(), hour, min);
    }
    return new Date(ts);
  }

  // Match standalone period words: "morning", "afternoon", "evening"
  if (/^(morning|afternoon|evening)$/.test(lower)) {
    const hour = lower === 'morning' ? 9 : lower === 'afternoon' ? 14 : 17;
    let ts = pacificDate(todayPT.getFullYear(), todayPT.getMonth(), todayPT.getDate(), hour, 0);
    if (new Date(ts) <= new Date()) {
      const tmrw = new Date(todayPT); tmrw.setDate(tmrw.getDate() + 1);
      ts = pacificDate(tmrw.getFullYear(), tmrw.getMonth(), tmrw.getDate(), hour, 0);
    }
    return new Date(ts);
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

// Combine demo date + time into an ISO string for the Zoom API
function buildZoomStartTime(demoDate, demoTime) {
  const input = buildScheduleInput(demoDate, demoTime);
  if (!input) return null;
  const parsed = parseCallbackTime(input);
  return parsed ? parsed.toISOString() : null;
}

// Fire-and-forget helper — runs async work in background, logs errors
function deferAsync(label, fn) {
  fn().catch(err => console.error(`[deferred] ${label} error:`, err));
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

    // Extract conversation transcript for email detection fallback
    // Vapi may send it as message.transcript, message.artifact.transcript,
    // or as an array of message objects in message.messages
    let transcript = '';
    if (message.transcript) {
      transcript = message.transcript;
    } else if (message.artifact?.transcript) {
      transcript = message.artifact.transcript;
    } else if (Array.isArray(message.messages)) {
      transcript = message.messages.map(m => m.content || m.text || '').join(' ');
    }
    transcript = transcript.toString().substring(0, 5000);
    if (!transcript) {
      // Log the top-level keys so we can find where the transcript lives
      console.log('Vapi tool-handler payload keys:', Object.keys(message));
      if (message.call) console.log('Vapi call keys:', Object.keys(message.call));
    }

    const results = [];

    for (const toolCall of message.toolCalls) {
      const fnName = toolCall.function?.name;
      const args = toolCall.function?.arguments || {};

      if (fnName === 'save_contact_info') {
        await handleSaveContactInfo({ leadId, vapiCallId, args, toolCall, results, metadata });
      } else if (fnName === 'save_callback') {
        await handleSaveCallback({ leadId, vapiCallId, args, toolCall, results, metadata, transcript });
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

// Merge field replacer for email templates
function renderTemplate(text, lead) {
  return text
    .replace(/\{\{dispensary_name\}\}/g, lead.dispensary_name || '')
    .replace(/\{\{contact_name\}\}/g, lead.contact_name || lead.manager_name || '')
    .replace(/\{\{manager_name\}\}/g, lead.manager_name || '')
    .replace(/\{\{contact_email\}\}/g, lead.contact_email || '')
    .replace(/\{\{current_pos_system\}\}/g, lead.current_pos_system || '')
    .replace(/\{\{city\}\}/g, lead.city || '')
    .replace(/\{\{state\}\}/g, lead.state || '')
    .replace(/\{\{stage\}\}/g, lead.stage || '');
}

// Track intro emails already sent per call to prevent duplicates
const introEmailSent = new Set();

async function handleSaveContactInfo({ leadId, vapiCallId, args, toolCall, results, metadata }) {
  try {
    const { owner_name, email, notes, dispensary_name } = args;

    // Deduplicate: if we already processed save_contact_info for this call, just respond OK
    const dedupeKey = vapiCallId ? `${vapiCallId}:contact_info` : null;
    if (dedupeKey && introEmailSent.has(dedupeKey)) {
      results.push({ toolCallId: toolCall.id, result: 'Contact info already saved for this call' });
      return;
    }
    if (dedupeKey) introEmailSent.add(dedupeKey);

    // Critical path: update the lead record (fast, ~20-50ms)
    if (leadId) {
      const updates = [];
      const params = [];
      let paramIdx = 1;

      if (owner_name) { updates.push(`manager_name = $${paramIdx++}`); params.push(owner_name); }
      if (email) { updates.push(`contact_email = $${paramIdx++}`); params.push(email); }
      if (notes) { updates.push(`notes = $${paramIdx++}`); params.push(notes); }
      if (dispensary_name) { updates.push(`dispensary_name = $${paramIdx++}`); params.push(dispensary_name); }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(leadId);
        await run(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
      }
    }

    // Respond to Vapi immediately
    results.push({ toolCallId: toolCall.id, result: 'Contact info saved successfully' });

    // Deferred: log to contact_history + send intro email if requested
    if (leadId) {
      deferAsync('save_contact_info:history+intro', async () => {
        await run(
          `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
           VALUES ($1, 'Phone', $2, $3)`,
          [leadId, `AI Call - Contact info saved. Owner: ${owner_name || 'N/A'}, Email: ${email || 'N/A'}`, 'Contact Info Collected']
        );

        // Save intro email draft for manual approval (instead of auto-sending)
        if (email) {
          try {
            const template = await get(
              `SELECT * FROM email_templates WHERE category = 'Intro' LIMIT 1`
            );
            if (template) {
              const lead = await get('SELECT * FROM leads WHERE id = $1', [leadId]);
              if (lead) {
                const subject = renderTemplate(template.subject, lead);
                const body = renderTemplate(template.body, lead);

                const pendingEmail = {
                  to: email,
                  subject,
                  body,
                  templateId: template.id,
                  templateName: template.name,
                  capturedAt: new Date().toISOString()
                };

                await run(
                  `UPDATE leads SET pending_intro_email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                  [JSON.stringify(pendingEmail), leadId]
                );

                await run(
                  `INSERT INTO contact_history (lead_id, contact_method, notes, outcome, email_subject, email_template_id)
                   VALUES ($1, 'Email', $2, $3, $4, $5)`,
                  [leadId, body, `Intro email pending approval (template: ${template.name})`, subject, template.id]
                );
                console.log(`Intro email draft saved for lead ${leadId} (pending approval)`);
              }
            } else {
              console.error('No Intro email template found in email_templates');
            }
          } catch (emailErr) {
            console.error('Intro email draft save error:', emailErr);
          }
        }

        // Clean up dedup key after 5 minutes
        if (dedupeKey) setTimeout(() => introEmailSent.delete(dedupeKey), 5 * 60 * 1000);
      });
    }
  } catch (error) {
    console.error('save_contact_info error:', error);
    results.push({ toolCallId: toolCall.id, result: `Error saving contact info: ${error.message}` });
  }
}

async function handleSaveCallback({ leadId, vapiCallId, args, toolCall, results, metadata, transcript }) {
  try {
    // Log all args for debugging
    console.log(`save_callback args for lead ${leadId}:`, JSON.stringify(args));
    if (transcript) console.log(`save_callback transcript snippet (last 500):`, transcript.slice(-500));

    // ── Email fallback: if an email address appears anywhere — in tool args
    //    OR in the conversation transcript — redirect to save_contact_info
    //    to save the email and auto-send the intro email.
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    // 1. Check explicit email fields in args
    let possibleEmail = args.email || args.owner_email || args.contact_email || null;

    // 2. Scan all text fields in args
    if (!possibleEmail) {
      const textToScan = Object.values(args).filter(v => typeof v === 'string').join(' ');
      const emailMatch = textToScan.match(emailRegex);
      if (emailMatch) possibleEmail = emailMatch[0];
    }

    // 3. Last resort: scan conversation transcript for email addresses
    if (!possibleEmail && transcript) {
      const emailMatch = transcript.match(emailRegex);
      if (emailMatch) possibleEmail = emailMatch[0];
    }

    if (possibleEmail) {
      console.log(`save_callback detected email "${possibleEmail}" — redirecting to save_contact_info for intro email`);
      return handleSaveContactInfo({
        leadId, vapiCallId, args: {
          owner_name: args.owner_name || args.callback_name || null,
          email: possibleEmail,
          notes: args.notes || args.callback_reason || null,
        }, toolCall, results, metadata
      });
    }

    // Map Vapi dashboard params → DB columns
    const callbackName = args.owner_name || args.callback_name || null;
    const callbackDay = args.callback_day || null;
    const callbackTimeOfDay = args.callback_time_of_day || null;
    const callbackReason = args.notes || args.callback_reason || null;

    // Build a human-readable preferred_time string from day + time_of_day
    const timeParts = [];
    if (callbackDay) timeParts.push(callbackDay);
    if (callbackTimeOfDay && callbackTimeOfDay !== 'not specified') timeParts.push(callbackTimeOfDay);
    const preferredTime = timeParts.length > 0 ? timeParts.join(' — ') : (args.callback_time || args.preferred_time || null);

    // Detect IVR from notes
    const isIvr = !!(callbackReason && /ivr|automated|press \d|phone (tree|system|menu)/i.test(callbackReason));

    // Deduplicate: skip if callback already saved for this call
    if (vapiCallId) {
      const existing = await get('SELECT id FROM callbacks WHERE vapi_call_id = $1', [vapiCallId]);
      if (existing) {
        results.push({ toolCallId: toolCall.id, result: 'Callback already saved for this call' });
        return;
      }
    }

    // Critical path: insert callback + update lead (~40-100ms)
    await run(
      `INSERT INTO callbacks (lead_id, vapi_call_id, callback_name, callback_reason, preferred_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [leadId, vapiCallId, callbackName, callbackReason, preferredTime]
    );

    if (leadId) {
      const updates = [];
      const params = [];
      let idx = 1;

      if (callbackName) { updates.push(`manager_name = $${idx++}`); params.push(callbackName); }
      if (preferredTime) { updates.push(`callback_time_from = $${idx++}`); params.push(preferredTime); }
      if (isIvr) { updates.push(`has_ivr = $${idx++}`); params.push(true); }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(leadId);
        await run(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${idx}`, params);
      }
    }

    // Respond to Vapi immediately
    results.push({
      toolCallId: toolCall.id,
      result: 'Callback saved successfully',
    });

    // Deferred: contact_history + auto-schedule follow-up
    if (leadId) {
      deferAsync('save_callback:history+schedule', async () => {
        await run(
          `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
           VALUES ($1, 'Phone', $2, $3)`,
          [
            leadId,
            `AI Call - Callback requested by ${callbackName || 'contact'}. Day: ${callbackDay || 'N/A'}. Time: ${callbackTimeOfDay || 'N/A'}. Notes: ${callbackReason || 'N/A'}`,
            'Callback Scheduled'
          ]
        );

        const timeInput = buildScheduleInput(callbackDay, callbackTimeOfDay);
        if (timeInput) {
          const scheduledFor = parseCallbackTime(timeInput);
          if (scheduledFor && scheduledFor > new Date()) {
            await pool.query(
              `INSERT INTO scheduled_call_batches (lead_ids, scheduled_for, delay_seconds, status, source)
               VALUES ($1, $2, 30, 'pending', 'callback')`,
              [JSON.stringify([leadId]), scheduledFor]
            );
            console.log(`Auto-scheduled follow-up call for lead ${leadId} at ${scheduledFor.toISOString()} (from: ${timeInput})`);
          }
        }
      });
    }
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
    const defaultZoomLink = process.env.DEFAULT_ZOOM_LINK || 'https://zoom.us/j/your-meeting-id';

    // Deduplicate: skip if demo already saved for this call
    if (vapiCallId) {
      const existing = await get('SELECT id FROM demos WHERE vapi_call_id = $1', [vapiCallId]);
      if (existing) {
        results.push({ toolCallId: toolCall.id, result: 'Demo already scheduled for this call' });
        return;
      }
    }

    // Critical path: save demo record with default zoom link (~20-50ms)
    const demoResult = await run(
      `INSERT INTO demos (lead_id, vapi_call_id, contact_name, contact_email, dispensary_name, demo_date, demo_time, zoom_link, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [leadId, vapiCallId, contactName, contactEmail, dispensaryName, demoDate, demoTime, defaultZoomLink, notes]
    );

    const demoId = demoResult.lastInsertRowid;

    // Respond to Vapi immediately — no dead air
    results.push({
      toolCallId: toolCall.id,
      result: 'Demo scheduled successfully and confirmation email will be sent shortly',
    });

    // Deferred: Zoom meeting creation + email + stage update + history logging
    deferAsync('schedule_demo:zoom+email+history', async () => {
      let zoomLink = defaultZoomLink;

      // Create unique Zoom meeting (~500-1000ms)
      if (zoomService.isConfigured()) {
        try {
          const startTime = buildZoomStartTime(demoDate, demoTime);
          const meeting = await zoomService.createMeeting({
            topic: `Weedhurry POS Demo – ${dispensaryName || contactName || 'Prospect'}`,
            startTime,
            duration: 30,
          });
          zoomLink = meeting.joinUrl;
          await run('UPDATE demos SET zoom_link = $1 WHERE id = $2', [zoomLink, demoId]);
        } catch (zoomErr) {
          console.error('Zoom meeting creation failed, using default link:', zoomErr.message);
        }
      }

      // Send confirmation email (~500-1500ms)
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
          await run('UPDATE demos SET confirmation_sent = true WHERE id = $1', [demoId]);
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
    // Log raw payload for debugging (top-level, before any guards)
    console.log(`[call-status] RAW BODY keys: ${Object.keys(req.body).join(',')}, type=${req.body.type || req.body.message?.type || 'none'}`);

    // Vapi may send payload wrapped in `message` or directly in body
    const message = req.body.message || (req.body.type ? req.body : null);

    if (!message || message.type !== 'end-of-call-report') {
      return res.status(200).json({ ok: true });
    }

    const vapiCallId = message.call?.id || null;
    const metadata = message.call?.metadata || {};
    const leadId = metadata.lead_id;

    // Debug: log key webhook fields to diagnose voicemail detection
    console.log(`[call-status] lead=${leadId} endedReason=${message.endedReason || message.call?.endedReason} duration=${message.durationSeconds || message.call?.duration}`);
    console.log(`[call-status] transcript keys: message.transcript=${!!message.transcript}, artifact.transcript=${!!message.artifact?.transcript}, artifact.messages=${!!message.artifact?.messages}, messages=${!!message.messages}`);
    console.log(`[call-status] analysis type=${typeof message.analysis}, isArray=${Array.isArray(message.analysis)}, keys=${message.analysis ? Object.keys(message.analysis).join(',') : 'null'}`);
    if (message.analysis) console.log(`[call-status] analysis raw:`, JSON.stringify(message.analysis).substring(0, 500));
    console.log(`[call-status] summary=${message.summary ? message.summary.substring(0, 200) : 'null'}`);

    const duration = message.durationSeconds || message.call?.duration || null;
    // Build transcript from all possible Vapi sources
    let transcript = null;
    if (message.transcript) {
      transcript = typeof message.transcript === 'string' ? message.transcript : JSON.stringify(message.transcript);
    } else if (message.artifact?.transcript) {
      transcript = typeof message.artifact.transcript === 'string' ? message.artifact.transcript : JSON.stringify(message.artifact.transcript);
    } else if (Array.isArray(message.artifact?.messages)) {
      transcript = message.artifact.messages.map(m => m.content || m.text || m.message || '').join(' ');
    } else if (Array.isArray(message.messages)) {
      transcript = message.messages.map(m => m.content || m.text || m.message || '').join(' ');
    }
    const recordingUrl = message.recordingUrl || message.artifact?.recordingUrl || null;
    const cost = message.cost || null;
    const endedReason = message.endedReason || message.call?.endedReason || null;
    let status = endedReason === 'customer-did-not-answer' ? 'no_answer'
      : endedReason === 'customer-busy' ? 'busy'
      : endedReason === 'voicemail' ? 'voicemail'
      : duration && duration > 0 ? 'completed'
      : 'failed';

    // Override status to voicemail if transcript indicates call was forwarded to voicemail
    // (Vapi often reports these as normal completed calls since the line connected)
    if (status === 'completed' && transcript && /your call has been forwarded to voicemail|at the tone.{0,20}record your message|not available.{0,30}leave.{0,10}message|please leave a message|record.{0,10}message.{0,20}(after|at) the (tone|beep)/i.test(transcript)) {
      status = 'voicemail';
    }

    // Extract structured analysis data from Vapi
    // Vapi sends analysis as either an object with indexed keys or an array
    const analysisRaw = message.analysis || message.artifact?.analysis || {};
    const analysisItems = Array.isArray(analysisRaw)
      ? analysisRaw
      : Object.values(analysisRaw);
    let analysisSummary = null;
    let sentiment = null;
    let successEval = null;
    let appointmentBooked = null;

    for (const value of analysisItems) {
      if (!value || typeof value !== 'object') continue;
      if (value.name === 'Call Summary') analysisSummary = value.result;
      else if (value.name === 'Customer Sentiment') sentiment = value.result;
      else if (value.name === 'Success Evaluation - Descriptive') successEval = value.result;
      else if (value.name === 'Appointment Booked') appointmentBooked = value.result;
    }

    // Prefer analysis summary over generic summary
    const summary = analysisSummary || message.summary || message.artifact?.summary || null;
    console.log(`[call-status] resolved summary=${summary ? summary.substring(0, 200) : 'null'}, analysisSummary=${analysisSummary ? 'yes' : 'no'}`);

    // Override status to voicemail if Call Summary indicates voicemail
    // (most reliable detection — Vapi's AI analysis correctly identifies voicemail even when
    // endedReason and transcript fields don't)
    if (status === 'completed' && summary && /forwarded.{0,20}voicemail|sent to voicemail|went to voicemail|reached.{0,20}voicemail|no live person|voicemail.{0,20}no.{0,20}conversation/i.test(summary)) {
      status = 'voicemail';
    }

    console.log(`[call-status] FINAL status=${status} for lead=${leadId}`);

    // Merge analysis into metadata for storage
    const callMetadata = {
      ...metadata,
      ...(Object.keys(analysisRaw).length > 0 ? { analysis: { sentiment, successEval, appointmentBooked } } : {}),
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

    // Detect IVR/voicemail systems from transcript content
    const ivrFromTranscript = transcript && /press (?:one|two|three|pound|zero|\d)|at the tone|leave (?:a |your )?message|phone tree|automated (?:system|attendant|menu)|main menu|dial (?:by name|extension)|para espa/i.test(transcript);

    // Update lead record
    if (leadId) {
      const leadUpdates = [
        'call_status = $1', 'call_duration = $2', 'call_summary = $3',
        'last_called_at = CURRENT_TIMESTAMP', 'updated_at = CURRENT_TIMESTAMP'
      ];
      const leadParams = [status, duration, summary];
      let leadParamIdx = 4;

      if (ivrFromTranscript) {
        leadUpdates.push(`has_ivr = $${leadParamIdx++}`);
        leadParams.push(true);
      }

      leadParams.push(leadId);
      await run(
        `UPDATE leads SET ${leadUpdates.join(', ')} WHERE id = $${leadParamIdx}`,
        leadParams
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

      // Auto-retry for voicemail/no_answer (max 2 retries)
      if (status === 'voicemail' || status === 'no_answer') {
        deferAsync('voicemail_retry:schedule', async () => {
          const lead = await get('SELECT voicemail_retry_count FROM leads WHERE id = $1', [leadId]);
          const retryCount = lead?.voicemail_retry_count || 0;
          if (retryCount >= 2) {
            console.log(`Voicemail retry skipped for lead ${leadId}: already retried ${retryCount} times (max 2)`);
            return;
          }
          // Increment retry counter
          await run('UPDATE leads SET voicemail_retry_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [retryCount + 1, leadId]);
          // Schedule retry
          const retryAt = calculateRetryTime();
          await pool.query(
            `INSERT INTO scheduled_call_batches (lead_ids, scheduled_for, delay_seconds, status, source)
             VALUES ($1, $2, 30, 'pending', 'voicemail_retry')`,
            [JSON.stringify([leadId]), retryAt]
          );
          console.log(`Auto-retry #${retryCount + 1} scheduled for lead ${leadId} at ${retryAt.toISOString()} (${status})`);
        });
      }

      // Reset voicemail retry counter on successful call
      if (status === 'completed') {
        deferAsync('voicemail_retry:reset', async () => {
          await run('UPDATE leads SET voicemail_retry_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [leadId]);
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Vapi call-status webhook error:', error);
    // Always return 200 to prevent Vapi retries
    return res.status(200).json({ ok: true });
  }
});

// POST /api/vapi/backfill — retroactively fetch Vapi call data and update DB
router.post('/backfill', async (req, res) => {
  try {
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'VAPI_API_KEY not configured' });

    // Fetch all calls from Vapi (cursor-based using createdAtLt)
    const vapiCalls = [];
    let cursor = null;
    while (true) {
      const url = cursor
        ? `https://api.vapi.ai/call?limit=100&createdAtLt=${encodeURIComponent(cursor)}`
        : `https://api.vapi.ai/call?limit=100`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(502).json({ error: `Vapi API error: ${errText}` });
      }
      const data = await resp.json();
      const items = Array.isArray(data) ? data : (data.results || []);
      if (items.length === 0) break;
      vapiCalls.push(...items);
      if (items.length < 100) break;
      // Use the oldest call's createdAt as cursor for next page
      const oldest = items.reduce((min, c) => c.createdAt < min ? c.createdAt : min, items[0].createdAt);
      cursor = oldest;
    }

    let updated = 0;
    let skipped = 0;
    let noLead = 0;

    const errors = [];
    for (const call of vapiCalls) {
      try {
      const leadId = call.metadata?.lead_id;
      if (!leadId) { noLead++; continue; }

      // Verify lead exists in DB
      const leadExists = await get('SELECT id FROM leads WHERE id = $1', [leadId]);
      if (!leadExists) { noLead++; continue; }

      const vapiCallId = call.id;
      const endedReason = call.endedReason || null;
      const duration = call.duration || null;
      const transcript = call.transcript || null;
      const recordingUrl = call.recordingUrl || call.artifact?.recordingUrl || null;
      const cost = call.cost || null;

      // Determine status using same logic as webhook
      let status = endedReason === 'customer-did-not-answer' ? 'no_answer'
        : endedReason === 'customer-busy' ? 'busy'
        : endedReason === 'voicemail' ? 'voicemail'
        : (endedReason === 'silence-timed-out' || endedReason === 'customer-ended-call') && duration && duration > 0 ? 'completed'
        : endedReason?.startsWith('call.start.error') ? 'failed'
        : duration && duration > 0 ? 'completed'
        : 'failed';

      // Override from transcript
      if (status === 'completed' && transcript && /your call has been forwarded to voicemail|at the tone.{0,20}record your message|not available.{0,30}leave.{0,10}message|please leave a message|record.{0,10}message.{0,20}(after|at) the (tone|beep)/i.test(transcript)) {
        status = 'voicemail';
      }

      // Extract analysis
      const analysis = call.analysis || {};
      const summary = analysis.summary || call.summary || null;
      const successEval = analysis.successEvaluation || null;

      // Override from summary
      if (status === 'completed' && summary && /forwarded.{0,20}voicemail|sent to voicemail|went to voicemail|reached.{0,20}voicemail|no live person|voicemail.{0,20}no.{0,20}conversation/i.test(summary)) {
        status = 'voicemail';
      }

      // Check if call_logs already has a finalized entry (skip if it has real data)
      const existing = await get('SELECT id, summary, recording_url FROM call_logs WHERE vapi_call_id = $1', [vapiCallId]);
      if (existing && (existing.summary || existing.recording_url)) {
        skipped++;
        continue;
      }

      const callMetadata = {
        ...call.metadata,
        ...(Object.keys(analysis).length > 0 ? { analysis: { successEval } } : {}),
        backfilled: true,
      };

      // Upsert call_logs
      if (existing) {
        await run(
          `UPDATE call_logs SET status = $1, duration = $2, ended_at = $3,
           summary = $4, transcript = $5, recording_url = $6, cost = $7, metadata = $8
           WHERE vapi_call_id = $9`,
          [status, duration, call.endedAt || null, summary, transcript, recordingUrl, cost, JSON.stringify(callMetadata), vapiCallId]
        );
      } else {
        await run(
          `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, duration, started_at, ended_at, summary, transcript, recording_url, cost, metadata)
           VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [leadId, vapiCallId, status, duration, call.createdAt || null, call.endedAt || null, summary, transcript, recordingUrl, cost, JSON.stringify(callMetadata)]
        );
      }

      // Add contact_history entry (check for duplicates by looking for existing "AI Call Report" near this call's time)
      const callTime = call.endedAt || call.createdAt;
      if (callTime) {
        const existingHistory = await get(
          `SELECT id FROM contact_history WHERE lead_id = $1 AND notes LIKE 'AI Call Report%' AND contact_date BETWEEN $2::timestamp - interval '5 minutes' AND $2::timestamp + interval '5 minutes'`,
          [leadId, callTime]
        );
        if (!existingHistory) {
          const parts = [`AI Call Report - Duration: ${duration ? `${Math.round(duration)}s` : 'N/A'}`];
          if (summary) parts.push(summary.substring(0, 500));
          await run(
            `INSERT INTO contact_history (lead_id, contact_method, notes, outcome, recording_url, contact_date)
             VALUES ($1, 'Phone', $2, $3, $4, $5)`,
            [leadId, parts.join('. '), `Call ${status}`, recordingUrl, callTime]
          );
        }
      }

      // Detect IVR from transcript
      if (transcript && /press (?:one|two|three|pound|zero|\d)|phone tree|automated (?:system|attendant|menu)|main menu|dial (?:by name|extension)|para espa/i.test(transcript)) {
        await run('UPDATE leads SET has_ivr = true WHERE id = $1 AND (has_ivr IS NULL OR has_ivr = false)', [leadId]);
      }

      updated++;
      } catch (callErr) {
        errors.push({ callId: call.id, leadId: call.metadata?.lead_id, error: callErr.message });
      }
    }

    // Update each lead's call_status/call_summary with their most recent call
    const leadIds = [...new Set(vapiCalls.filter(c => c.metadata?.lead_id).map(c => c.metadata.lead_id))];
    let leadsUpdated = 0;
    for (const lid of leadIds) {
      const latest = await get(
        `SELECT status, duration, summary FROM call_logs WHERE lead_id = $1 ORDER BY COALESCE(ended_at, started_at) DESC LIMIT 1`,
        [lid]
      );
      if (latest) {
        await run(
          `UPDATE leads SET call_status = $1, call_duration = $2, call_summary = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
          [latest.status, latest.duration, latest.summary, lid]
        );
        leadsUpdated++;
      }
    }

    res.json({
      totalVapiCalls: vapiCalls.length,
      updated,
      skipped,
      noLeadId: noLead,
      leadsUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Vapi backfill error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
