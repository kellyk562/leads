const express = require('express');
const router = express.Router();
const { get, run, all, pool } = require('../database/init');
const vapiService = require('../services/vapiService');

// Stage ordering for regression guard
const STAGE_ORDER = [
  'New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed',
  'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'
];

function stageIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

// Format phone to E.164
function formatE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('+')) return phone;
  return `+${digits}`;
}

// 48-hour cooldown between calls
const COOLDOWN_MS = 48 * 60 * 60 * 1000;

// Build dynamic firstMessage and variableValues for Vapi assistantOverrides
function buildAssistantOverrides(lead) {
  const ownerName = (lead.manager_name || '').trim();
  const firstMessage = ownerName
    ? `Hey there, this is Alex from Weedhurry. Is ${ownerName} available by any chance?`
    : `Hey there, this is Alex from Weedhurry. Is the owner available by any chance?`;

  return {
    firstMessage,
    variableValues: {
      ownerName: ownerName,
      currentPOS: lead.current_pos_system || '',
    },
  };
}

// In-memory batch tracking
const batches = new Map();

// GET /api/calls/status
router.get('/status', (req, res) => {
  res.json({ configured: vapiService.isConfigured() });
});

// ─── Call Lists CRUD ────────────────────────────────────────────────

// GET /api/calls/lists — all lists with lead_count + called_count
router.get('/lists', async (req, res) => {
  try {
    const lists = await all(`
      SELECT cl.*,
        COUNT(cli.id) AS lead_count,
        COUNT(cli.id) FILTER (WHERE cli.status = 'called') AS called_count
      FROM call_lists cl
      LEFT JOIN call_list_items cli ON cli.call_list_id = cl.id
      GROUP BY cl.id
      ORDER BY cl.created_at DESC
    `);
    res.json(lists);
  } catch (error) {
    console.error('Get call lists error:', error);
    res.status(500).json({ error: 'Failed to fetch call lists' });
  }
});

// POST /api/calls/lists — create list with { name, description, leadIds }
router.post('/lists', async (req, res) => {
  try {
    const { name, description, leadIds } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await pool.query(
      'INSERT INTO call_lists (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    const list = result.rows[0];

    if (leadIds && leadIds.length > 0) {
      const values = leadIds.map((lid, i) => `($1, $${i + 2}, ${i})`).join(', ');
      await pool.query(
        `INSERT INTO call_list_items (call_list_id, lead_id, position) VALUES ${values} ON CONFLICT DO NOTHING`,
        [list.id, ...leadIds]
      );
    }

    res.status(201).json(list);
  } catch (error) {
    console.error('Create call list error:', error);
    res.status(500).json({ error: 'Failed to create call list' });
  }
});

// GET /api/calls/lists/:id — single list with lead items joined to leads
router.get('/lists/:id', async (req, res) => {
  try {
    const list = await get('SELECT * FROM call_lists WHERE id = $1', [req.params.id]);
    if (!list) return res.status(404).json({ error: 'Call list not found' });

    const items = await all(`
      SELECT cli.*, l.dispensary_name, l.contact_name, l.dispensary_number, l.contact_number,
             l.stage, l.last_called_at, l.city, l.state
      FROM call_list_items cli
      JOIN leads l ON l.id = cli.lead_id
      WHERE cli.call_list_id = $1
      ORDER BY cli.position
    `, [req.params.id]);

    res.json({ ...list, items });
  } catch (error) {
    console.error('Get call list error:', error);
    res.status(500).json({ error: 'Failed to fetch call list' });
  }
});

// PUT /api/calls/lists/:id — update name/description
router.put('/lists/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'UPDATE call_lists SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Call list not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update call list error:', error);
    res.status(500).json({ error: 'Failed to update call list' });
  }
});

// DELETE /api/calls/lists/:id — delete list (cascades items)
router.delete('/lists/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM call_lists WHERE id = $1', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Call list not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete call list error:', error);
    res.status(500).json({ error: 'Failed to delete call list' });
  }
});

// POST /api/calls/lists/:id/leads — add leads to list
router.post('/lists/:id/leads', async (req, res) => {
  try {
    const { leadIds } = req.body;
    if (!leadIds || !leadIds.length) return res.status(400).json({ error: 'leadIds required' });

    // Get current max position
    const maxPos = await get('SELECT COALESCE(MAX(position), -1) AS max_pos FROM call_list_items WHERE call_list_id = $1', [req.params.id]);
    let pos = (maxPos?.max_pos ?? -1) + 1;

    const values = leadIds.map((lid, i) => `($1, $${i + 2}, ${pos + i})`).join(', ');
    await pool.query(
      `INSERT INTO call_list_items (call_list_id, lead_id, position) VALUES ${values} ON CONFLICT DO NOTHING`,
      [parseInt(req.params.id), ...leadIds]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Add leads to list error:', error);
    res.status(500).json({ error: 'Failed to add leads' });
  }
});

// DELETE /api/calls/lists/:id/leads/:leadId — remove lead from list
router.delete('/lists/:id/leads/:leadId', async (req, res) => {
  try {
    await run('DELETE FROM call_list_items WHERE call_list_id = $1 AND lead_id = $2', [req.params.id, req.params.leadId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove lead from list error:', error);
    res.status(500).json({ error: 'Failed to remove lead' });
  }
});

// ─── Call History & Feedback ────────────────────────────────────────

// GET /api/calls/history — call_logs joined with leads
router.get('/history', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT cl.*, l.dispensary_name, l.contact_name, l.city, l.state
      FROM call_logs cl
      LEFT JOIN leads l ON l.id = cl.lead_id
    `;
    const params = [];
    if (status) {
      query += ' WHERE cl.status = $1';
      params.push(status);
    }
    query += ' ORDER BY cl.created_at DESC LIMIT 200';
    const logs = await all(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// GET /api/calls/history/:id — single call log with full transcript
router.get('/history/:id', async (req, res) => {
  try {
    const log = await get(`
      SELECT cl.*, l.dispensary_name, l.contact_name, l.city, l.state
      FROM call_logs cl
      LEFT JOIN leads l ON l.id = cl.lead_id
      WHERE cl.id = $1
    `, [req.params.id]);
    if (!log) return res.status(404).json({ error: 'Call log not found' });
    res.json(log);
  } catch (error) {
    console.error('Get call detail error:', error);
    res.status(500).json({ error: 'Failed to fetch call detail' });
  }
});

// GET /api/calls/callbacks — callbacks joined with leads
router.get('/callbacks', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT cb.*, l.dispensary_name, l.dispensary_number, l.contact_number, l.city, l.state
      FROM callbacks cb
      LEFT JOIN leads l ON l.id = cb.lead_id
    `;
    const params = [];
    if (status) {
      query += ' WHERE cb.status = $1';
      params.push(status);
    }
    query += ' ORDER BY cb.created_at DESC';
    const callbacks = await all(query, params);
    res.json(callbacks);
  } catch (error) {
    console.error('Get callbacks error:', error);
    res.status(500).json({ error: 'Failed to fetch callbacks' });
  }
});

// PATCH /api/calls/callbacks/:id — update callback status
router.patch('/callbacks/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(
      'UPDATE callbacks SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Callback not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update callback error:', error);
    res.status(500).json({ error: 'Failed to update callback' });
  }
});

// GET /api/calls/demos — demos joined with leads
router.get('/demos', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT d.*, l.dispensary_name AS lead_dispensary_name, l.city, l.state
      FROM demos d
      LEFT JOIN leads l ON l.id = d.lead_id
    `;
    const params = [];
    if (status) {
      query += ' WHERE d.status = $1';
      params.push(status);
    }
    query += ' ORDER BY d.created_at DESC';
    const demos = await all(query, params);
    res.json(demos);
  } catch (error) {
    console.error('Get demos error:', error);
    res.status(500).json({ error: 'Failed to fetch demos' });
  }
});

// PATCH /api/calls/demos/:id — update demo status
router.patch('/demos/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['scheduled', 'completed', 'cancelled', 'no_show'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(
      'UPDATE demos SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Demo not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update demo error:', error);
    res.status(500).json({ error: 'Failed to update demo' });
  }
});

// ─── Schedules ──────────────────────────────────────────────────────

// GET /api/calls/schedules — all scheduled batches
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await all(`
      SELECT scb.*, cl.name AS list_name,
        (SELECT json_agg(json_build_object('id', l.id, 'dispensary_name', l.dispensary_name) ORDER BY l.dispensary_name)
         FROM leads l
         WHERE l.id IN (SELECT (jsonb_array_elements_text(scb.lead_ids))::int)
        ) AS leads_info
      FROM scheduled_call_batches scb
      LEFT JOIN call_lists cl ON cl.id = scb.call_list_id
      ORDER BY scb.scheduled_for DESC
    `);
    res.json(schedules);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// POST /api/calls/schedules — create scheduled batch
router.post('/schedules', async (req, res) => {
  try {
    const { callListId, leadIds, scheduledFor, delaySeconds = 30 } = req.body;
    if (!scheduledFor) return res.status(400).json({ error: 'scheduledFor is required' });

    // Get lead IDs from call list if callListId provided
    let resolvedLeadIds = leadIds || [];
    if (callListId && (!resolvedLeadIds || resolvedLeadIds.length === 0)) {
      const items = await all('SELECT lead_id FROM call_list_items WHERE call_list_id = $1 ORDER BY position', [callListId]);
      resolvedLeadIds = items.map(i => i.lead_id);
    }

    if (!resolvedLeadIds || resolvedLeadIds.length === 0) {
      return res.status(400).json({ error: 'No leads to schedule' });
    }

    const result = await pool.query(
      `INSERT INTO scheduled_call_batches (call_list_id, lead_ids, scheduled_for, delay_seconds, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [callListId || null, JSON.stringify(resolvedLeadIds), scheduledFor, delaySeconds]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// DELETE /api/calls/schedules/:id — cancel a pending schedule
router.delete('/schedules/:id', async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE scheduled_call_batches SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Schedule not found or not pending' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Cancel schedule error:', error);
    res.status(500).json({ error: 'Failed to cancel schedule' });
  }
});

// ─── Existing endpoints ─────────────────────────────────────────────

// POST /api/calls/outbound — initiate single call
router.post('/outbound', async (req, res) => {
  try {
    if (!vapiService.isConfigured()) {
      return res.status(503).json({ error: 'Vapi is not configured' });
    }

    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    const lead = await get('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Use dispensary_number or contact_number
    const rawPhone = lead.dispensary_number || lead.contact_number;
    if (!rawPhone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    const phoneNumber = formatE164(rawPhone);
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const metadata = {
      lead_id: lead.id,
      dispensary_name: lead.dispensary_name || '',
      contact_name: lead.manager_name || lead.contact_name || '',
      current_pos: lead.current_pos_system || '',
      city: lead.city || '',
    };

    const vapiCall = await vapiService.createOutboundCall({
      phoneNumber,
      assistantOverrides: buildAssistantOverrides(lead),
      metadata,
    });

    const vapiCallId = vapiCall.id;

    // Update lead record
    await run(
      `UPDATE leads SET vapi_call_id = $1, call_status = 'ringing', last_called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [vapiCallId, leadId]
    );

    // Update stage from New Lead → Contacted (guard against regression)
    if (lead.stage === 'New Lead') {
      await run('UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['Contacted', leadId]);
    }

    // Log to call_logs
    await run(
      `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, started_at, metadata)
       VALUES ($1, $2, 'outbound', 'ringing', CURRENT_TIMESTAMP, $3)`,
      [leadId, vapiCallId, JSON.stringify(metadata)]
    );

    // Log to contact_history
    await run(
      `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
       VALUES ($1, 'Phone', $2, $3)`,
      [leadId, `AI outbound call initiated to ${phoneNumber}`, 'Call Initiated']
    );

    // Check cooldown for informational warning (does not block)
    const cooldownWarning = lead.last_called_at && (Date.now() - new Date(lead.last_called_at).getTime()) < COOLDOWN_MS;

    res.json({
      success: true,
      vapiCallId,
      phoneNumber,
      leadId,
      cooldownWarning,
      lastCalledAt: lead.last_called_at || null,
    });
  } catch (error) {
    console.error('Outbound call error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate call' });
  }
});

// POST /api/calls/batch — batch call multiple leads
router.post('/batch', async (req, res) => {
  try {
    if (!vapiService.isConfigured()) {
      return res.status(503).json({ error: 'Vapi is not configured' });
    }

    const { leadIds, delaySeconds = 30, skipIvr = true } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds array is required' });
    }

    if (leadIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 leads per batch' });
    }

    // Validate leads have phone numbers and optionally skip IVR
    const leads = await all(
      `SELECT id, dispensary_name, dispensary_number, contact_number, manager_name, contact_name, current_pos_system, city, stage, has_ivr, last_called_at FROM leads WHERE id = ANY($1)`,
      [leadIds]
    );

    const leadsWithPhone = leads.filter(l => l.dispensary_number || l.contact_number);

    // Filter out leads called within 48-hour cooldown
    const now = Date.now();
    const cooldownFiltered = leadsWithPhone.filter(l => !l.last_called_at || (now - new Date(l.last_called_at).getTime()) >= COOLDOWN_MS);
    const cooldownSkipped = leadsWithPhone.length - cooldownFiltered.length;

    const ivrSkipped = skipIvr ? cooldownFiltered.filter(l => l.has_ivr).length : 0;
    const validLeads = skipIvr ? cooldownFiltered.filter(l => !l.has_ivr) : cooldownFiltered;
    const skippedCount = leadIds.length - leadsWithPhone.length;

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const batchState = {
      id: batchId,
      total: validLeads.length,
      completed: 0,
      failed: 0,
      skipped: skippedCount,
      results: [],
      status: 'in_progress',
      createdAt: new Date().toISOString(),
    };
    batches.set(batchId, batchState);

    // Queue calls with delays
    validLeads.forEach((lead, index) => {
      setTimeout(async () => {
        try {
          const rawPhone = lead.dispensary_number || lead.contact_number;
          const phoneNumber = formatE164(rawPhone);

          const metadata = {
            lead_id: lead.id,
            dispensary_name: lead.dispensary_name || '',
            contact_name: lead.manager_name || lead.contact_name || '',
            current_pos: lead.current_pos_system || '',
            city: lead.city || '',
          };

          const vapiCall = await vapiService.createOutboundCall({ phoneNumber, assistantOverrides: buildAssistantOverrides(lead), metadata });

          await run(
            `UPDATE leads SET vapi_call_id = $1, call_status = 'ringing', last_called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [vapiCall.id, lead.id]
          );

          // Update stage from New Lead → Contacted (guard against regression)
          if (lead.stage === 'New Lead' || !lead.stage) {
            await run('UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['Contacted', lead.id]);
          }

          await run(
            `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, started_at, metadata)
             VALUES ($1, $2, 'outbound', 'ringing', CURRENT_TIMESTAMP, $3)`,
            [lead.id, vapiCall.id, JSON.stringify(metadata)]
          );

          // Log to contact_history
          await run(
            `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
             VALUES ($1, 'Phone', $2, $3)`,
            [lead.id, `AI outbound call initiated to ${phoneNumber} (batch)`, 'Call Initiated']
          );

          batchState.completed++;
          batchState.results.push({ leadId: lead.id, success: true, vapiCallId: vapiCall.id });
        } catch (error) {
          console.error(`Batch call error for lead ${lead.id}:`, error);
          batchState.failed++;
          batchState.results.push({ leadId: lead.id, success: false, error: error.message });
        }

        if (batchState.completed + batchState.failed >= batchState.total) {
          batchState.status = 'completed';
        }
      }, index * delaySeconds * 1000);
    });

    res.json({
      batchId,
      total: validLeads.length,
      skipped: skippedCount,
      ivrSkipped,
      cooldownSkipped,
      estimatedDuration: `${Math.round(validLeads.length * delaySeconds / 60)} minutes`,
    });
  } catch (error) {
    console.error('Batch call error:', error);
    res.status(500).json({ error: error.message || 'Failed to start batch calls' });
  }
});

// GET /api/calls/batch/:batchId — check batch progress
router.get('/batch/:batchId', (req, res) => {
  const batch = batches.get(req.params.batchId);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(batch);
});

// ─── Schedule Executor ──────────────────────────────────────────────

function startScheduleExecutor() {
  setInterval(async () => {
    try {
      // Find due scheduled batches
      const dueBatches = await all(
        "SELECT *, COALESCE(source, 'manual') AS source FROM scheduled_call_batches WHERE status = 'pending' AND scheduled_for <= NOW()"
      );

      for (const batch of dueBatches) {
        // Mark as running
        await pool.query("UPDATE scheduled_call_batches SET status = 'running', batch_id = $1 WHERE id = $2", [
          `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          batch.id
        ]);

        const leadIds = typeof batch.lead_ids === 'string' ? JSON.parse(batch.lead_ids) : batch.lead_ids;
        if (!leadIds || leadIds.length === 0) {
          await pool.query("UPDATE scheduled_call_batches SET status = 'completed', results = $1 WHERE id = $2", [
            JSON.stringify({ error: 'No leads' }), batch.id
          ]);
          continue;
        }

        // Trigger batch call logic
        const leads = await all(
          'SELECT id, dispensary_name, dispensary_number, contact_number, manager_name, contact_name, current_pos_system, city, stage, has_ivr, last_called_at FROM leads WHERE id = ANY($1)',
          [leadIds]
        );

        const leadsWithPhone = leads.filter(l => l.dispensary_number || l.contact_number);

        // Voicemail retry batches bypass cooldown since they're intentionally within the 48h window
        const bypassCooldown = batch.source === 'voicemail_retry';
        const afterCooldown = bypassCooldown ? leadsWithPhone : leadsWithPhone.filter(l => !l.last_called_at || (Date.now() - new Date(l.last_called_at).getTime()) >= COOLDOWN_MS);
        const validLeads = afterCooldown.filter(l => !l.has_ivr);
        const results = [];

        for (let i = 0; i < validLeads.length; i++) {
          const lead = validLeads[i];
          if (i > 0) await new Promise(r => setTimeout(r, (batch.delay_seconds || 30) * 1000));

          try {
            if (!vapiService.isConfigured()) throw new Error('Vapi not configured');
            const rawPhone = lead.dispensary_number || lead.contact_number;
            const phoneNumber = formatE164(rawPhone);
            const metadata = {
              lead_id: lead.id,
              dispensary_name: lead.dispensary_name || '',
              contact_name: lead.manager_name || lead.contact_name || '',
              current_pos: lead.current_pos_system || '',
              city: lead.city || '',
            };

            const vapiCall = await vapiService.createOutboundCall({ phoneNumber, assistantOverrides: buildAssistantOverrides(lead), metadata });
            await run(
              `UPDATE leads SET vapi_call_id = $1, call_status = 'ringing', last_called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [vapiCall.id, lead.id]
            );

            // Update stage from New Lead → Contacted (guard against regression)
            if (lead.stage === 'New Lead' || !lead.stage) {
              await run('UPDATE leads SET stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['Contacted', lead.id]);
            }

            await run(
              `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, started_at, metadata) VALUES ($1, $2, 'outbound', 'ringing', CURRENT_TIMESTAMP, $3)`,
              [lead.id, vapiCall.id, JSON.stringify(metadata)]
            );

            // Log to contact_history
            await run(
              `INSERT INTO contact_history (lead_id, contact_method, notes, outcome)
               VALUES ($1, 'Phone', $2, $3)`,
              [lead.id, `AI outbound call initiated to ${phoneNumber} (scheduled batch)`, 'Call Initiated']
            );

            results.push({ leadId: lead.id, success: true, vapiCallId: vapiCall.id });
          } catch (err) {
            console.error(`Scheduled call error for lead ${lead.id}:`, err.message);
            results.push({ leadId: lead.id, success: false, error: err.message });
          }
        }

        await pool.query("UPDATE scheduled_call_batches SET status = 'completed', results = $1 WHERE id = $2", [
          JSON.stringify(results), batch.id
        ]);
      }
    } catch (error) {
      console.error('Schedule executor error:', error);
    }
  }, 60000); // Check every 60 seconds
  console.log('Schedule executor started (60s interval)');
}

module.exports = router;
module.exports.startScheduleExecutor = startScheduleExecutor;
