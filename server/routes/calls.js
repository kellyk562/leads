const express = require('express');
const router = express.Router();
const { get, run, all } = require('../database/init');
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

// In-memory batch tracking
const batches = new Map();

// GET /api/calls/status
router.get('/status', (req, res) => {
  res.json({ configured: vapiService.isConfigured() });
});

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

    // Build assistant overrides with lead context
    const assistantOverrides = {
      variableValues: {
        dispensary_name: lead.dispensary_name || '',
        contact_name: lead.manager_name || lead.contact_name || '',
        current_pos: lead.current_pos_system || 'their current system',
        city: lead.city || '',
        lead_id: String(lead.id),
      },
    };

    const metadata = {
      lead_id: lead.id,
      dispensary_name: lead.dispensary_name,
      contact_name: lead.manager_name || lead.contact_name,
    };

    // Call Vapi
    const vapiCall = await vapiService.createOutboundCall({
      phoneNumber,
      assistantOverrides,
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

    res.json({
      success: true,
      vapiCallId,
      phoneNumber,
      leadId,
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

    const { leadIds, delaySeconds = 30 } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds array is required' });
    }

    if (leadIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 leads per batch' });
    }

    // Validate leads have phone numbers
    const leads = await all(
      `SELECT id, dispensary_name, dispensary_number, contact_number FROM leads WHERE id = ANY($1)`,
      [leadIds]
    );

    const validLeads = leads.filter(l => l.dispensary_number || l.contact_number);
    const skippedCount = leadIds.length - validLeads.length;

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

          const assistantOverrides = {
            variableValues: {
              dispensary_name: lead.dispensary_name || '',
              contact_name: lead.manager_name || lead.contact_name || '',
              current_pos: lead.current_pos_system || 'their current system',
              city: lead.city || '',
              lead_id: String(lead.id),
            },
          };

          const metadata = {
            lead_id: lead.id,
            dispensary_name: lead.dispensary_name,
          };

          const vapiCall = await vapiService.createOutboundCall({ phoneNumber, assistantOverrides, metadata });

          await run(
            `UPDATE leads SET vapi_call_id = $1, call_status = 'ringing', last_called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [vapiCall.id, lead.id]
          );

          await run(
            `INSERT INTO call_logs (lead_id, vapi_call_id, direction, status, started_at, metadata)
             VALUES ($1, $2, 'outbound', 'ringing', CURRENT_TIMESTAMP, $3)`,
            [lead.id, vapiCall.id, JSON.stringify(metadata)]
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

module.exports = router;
