import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaPhone, FaHistory, FaCalendarAlt, FaList, FaTrash, FaTimes,
  FaCheck, FaBan, FaPlus, FaPlay, FaClock, FaSearch, FaExternalLinkAlt
} from 'react-icons/fa';
import { callsApi, leadsApi } from '../services/api';

// ─── Status Badge Colors ─────────────────────────────────────────
const CALL_STATUS_COLORS = {
  completed: { bg: '#d1e7dd', text: '#198754' },
  no_answer: { bg: '#fff3e0', text: '#e65100' },
  busy: { bg: '#fff9c4', text: '#f9a825' },
  voicemail: { bg: '#e2d9f3', text: '#6f42c1' },
  failed: { bg: '#f8d7da', text: '#dc3545' },
  queued: { bg: '#e9ecef', text: '#6c757d' },
};

const CALLBACK_STATUS_COLORS = {
  pending: { bg: '#fff3e0', text: '#e65100' },
  completed: { bg: '#d1e7dd', text: '#198754' },
  cancelled: { bg: '#e9ecef', text: '#6c757d' },
};

const DEMO_STATUS_COLORS = {
  scheduled: { bg: '#cfe2ff', text: '#0d6efd' },
  completed: { bg: '#d1e7dd', text: '#198754' },
  cancelled: { bg: '#e9ecef', text: '#6c757d' },
  no_show: { bg: '#f8d7da', text: '#dc3545' },
};

const SCHEDULE_STATUS_COLORS = {
  pending: { bg: '#fff3e0', text: '#e65100' },
  running: { bg: '#cfe2ff', text: '#0d6efd' },
  completed: { bg: '#d1e7dd', text: '#198754' },
  cancelled: { bg: '#e9ecef', text: '#6c757d' },
};

function StatusBadge({ status, colorMap }) {
  const colors = colorMap[status] || { bg: '#e9ecef', text: '#6c757d' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.text,
      textTransform: 'capitalize',
    }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Shared styles ───────────────────────────────────────────────
const styles = {
  page: { padding: '0' },
  tabBar: {
    display: 'flex', gap: '0', borderBottom: '2px solid #e9ecef',
    marginBottom: '1.5rem', overflowX: 'auto',
  },
  tab: (active) => ({
    padding: '0.75rem 1.25rem', border: 'none', background: 'none',
    cursor: 'pointer', fontSize: '0.875rem', fontWeight: active ? 700 : 400,
    color: active ? 'var(--primary-color)' : 'var(--text-secondary)',
    borderBottom: active ? '3px solid var(--primary-color)' : '3px solid transparent',
    marginBottom: '-2px', whiteSpace: 'nowrap', transition: 'all 0.15s',
  }),
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: {
    textAlign: 'left', padding: '0.625rem 0.75rem', borderBottom: '2px solid #e9ecef',
    fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px',
    color: 'var(--text-secondary)', fontWeight: 600,
  },
  td: {
    padding: '0.625rem 0.75rem', borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'middle',
  },
  btn: (variant = 'primary') => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
    padding: '0.375rem 0.75rem', borderRadius: '6px', border: 'none',
    fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
    backgroundColor: variant === 'primary' ? 'var(--primary-color)' : variant === 'danger' ? '#dc3545' : '#e9ecef',
    color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#fff' : '#333',
  }),
  btnSm: (variant = 'default') => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
    padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none',
    fontSize: '0.75rem', cursor: 'pointer',
    backgroundColor: variant === 'success' ? '#d1e7dd' : variant === 'danger' ? '#f8d7da' : '#e9ecef',
    color: variant === 'success' ? '#198754' : variant === 'danger' ? '#dc3545' : '#555',
  }),
  select: {
    padding: '0.375rem 0.75rem', borderRadius: '6px', border: '1px solid #ddd',
    fontSize: '0.8125rem', background: '#fff',
  },
  modal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modalContent: {
    background: '#fff', borderRadius: '12px', padding: '1.5rem',
    width: '90%', maxWidth: '600px', maxHeight: '80vh', overflow: 'auto',
  },
  input: {
    width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px',
    border: '1px solid #ddd', fontSize: '0.875rem', boxSizing: 'border-box',
  },
  empty: {
    textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)',
  },
  link: { color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 500 },
};

const TABS = [
  { key: 'lists', label: 'Call Lists', icon: FaList },
  { key: 'history', label: 'Call History', icon: FaHistory },
  { key: 'callbacks', label: 'Callbacks', icon: FaPhone },
  { key: 'demos', label: 'Demos', icon: FaCalendarAlt },
  { key: 'schedules', label: 'Schedules', icon: FaClock },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ═══════════════════════════════════════════════════════════════════
// Main Calls Component
// ═══════════════════════════════════════════════════════════════════
function Calls() {
  const [activeTab, setActiveTab] = useState('lists');

  return (
    <div style={styles.page}>
      <div style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.key} style={styles.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            <t.icon style={{ marginRight: '0.375rem', fontSize: '0.8125rem' }} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'lists' && <CallListsTab />}
      {activeTab === 'history' && <CallHistoryTab />}
      {activeTab === 'callbacks' && <CallbacksTab />}
      {activeTab === 'demos' && <DemosTab />}
      {activeTab === 'schedules' && <SchedulesTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1: Call Lists
// ═══════════════════════════════════════════════════════════════════
function CallListsTab() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedList, setExpandedList] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(null);

  const fetchLists = useCallback(async () => {
    try {
      const res = await callsApi.getLists();
      setLists(res.data);
    } catch (e) {
      toast.error('Failed to load call lists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const handleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); setExpandedList(null); return; }
    try {
      const res = await callsApi.getList(id);
      setExpandedList(res.data);
      setExpandedId(id);
    } catch { toast.error('Failed to load list details'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this call list?')) return;
    try {
      await callsApi.deleteList(id);
      toast.success('List deleted');
      fetchLists();
      if (expandedId === id) { setExpandedId(null); setExpandedList(null); }
    } catch { toast.error('Failed to delete list'); }
  };

  const handleBatchCall = async (list) => {
    if (!window.confirm(`Start batch call for ${list.lead_count} leads in "${list.name}"?`)) return;
    try {
      const detail = await callsApi.getList(list.id);
      const leadIds = detail.data.items.map(i => i.lead_id);
      const res = await callsApi.batchCall(leadIds, undefined, true);
      const parts = [`Batch started: ${res.data.total} calls queued (~${res.data.estimatedDuration})`];
      if (res.data.skipped > 0) parts.push(`${res.data.skipped} skipped (no phone)`);
      if (res.data.ivrSkipped > 0) parts.push(`${res.data.ivrSkipped} skipped (IVR)`);
      if (res.data.cooldownSkipped > 0) parts.push(`${res.data.cooldownSkipped} skipped (48h cooldown)`);
      toast.success(parts.join(', '));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to start batch call');
    }
  };

  const handleRemoveLead = async (listId, leadId) => {
    try {
      await callsApi.removeLeadFromList(listId, leadId);
      const res = await callsApi.getList(listId);
      setExpandedList(res.data);
      fetchLists();
    } catch { toast.error('Failed to remove lead'); }
  };

  if (loading) return <div style={styles.empty}>Loading...</div>;

  return (
    <div>
      <div style={styles.header}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Call Lists</h3>
        <button style={styles.btn('primary')} onClick={() => setShowNewModal(true)}>
          <FaPlus size={12} /> New List
        </button>
      </div>

      {lists.length === 0 ? (
        <div style={styles.empty}>No call lists yet. Create one to get started.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Leads</th>
              <th style={styles.th}>Called</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lists.map(list => (
              <React.Fragment key={list.id}>
                <tr>
                  <td style={styles.td}>
                    <button onClick={() => handleExpand(list.id)}
                      style={{ ...styles.link, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {list.name}
                    </button>
                  </td>
                  <td style={styles.td}>{list.lead_count}</td>
                  <td style={styles.td}>{list.called_count}</td>
                  <td style={styles.td}>{formatDate(list.created_at)}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      <button style={styles.btnSm('success')} onClick={() => handleBatchCall(list)}
                        title="Call Now"><FaPlay size={10} /> Call</button>
                      <button style={styles.btnSm()} onClick={() => setShowScheduleModal(list)}
                        title="Schedule"><FaClock size={10} /> Schedule</button>
                      <button style={styles.btnSm('danger')} onClick={() => handleDelete(list.id)}
                        title="Delete"><FaTrash size={10} /></button>
                    </div>
                  </td>
                </tr>
                {expandedId === list.id && expandedList && (
                  <tr>
                    <td colSpan={5} style={{ padding: '0.5rem 1rem 1rem', background: '#fafafa' }}>
                      {expandedList.items.length === 0 ? (
                        <div style={{ color: '#999', fontSize: '0.8125rem' }}>No leads in this list.</div>
                      ) : (
                        <table style={{ ...styles.table, fontSize: '0.8125rem' }}>
                          <thead>
                            <tr>
                              <th style={styles.th}>Dispensary</th>
                              <th style={styles.th}>Phone</th>
                              <th style={styles.th}>Stage</th>
                              <th style={styles.th}>Last Called</th>
                              <th style={styles.th}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {expandedList.items.map(item => (
                              <tr key={item.id}>
                                <td style={styles.td}>
                                  <Link to={`/leads/${item.lead_id}`} style={styles.link}>
                                    {item.dispensary_name}
                                  </Link>
                                </td>
                                <td style={styles.td}>{item.dispensary_number || item.contact_number || '—'}</td>
                                <td style={styles.td}>{item.stage}</td>
                                <td style={styles.td}>{formatDateTime(item.last_called_at)}</td>
                                <td style={styles.td}>
                                  <button style={styles.btnSm('danger')}
                                    onClick={() => handleRemoveLead(list.id, item.lead_id)}>
                                    <FaTimes size={10} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      {showNewModal && (
        <NewListModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); fetchLists(); }}
        />
      )}

      {showScheduleModal && (
        <ScheduleModal
          list={showScheduleModal}
          onClose={() => setShowScheduleModal(null)}
          onCreated={() => { setShowScheduleModal(null); toast.success('Schedule created'); }}
        />
      )}
    </div>
  );
}

// ─── New List Modal ──────────────────────────────────────────────
function NewListModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leads, setLeads] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await leadsApi.getAll();
        setLeads(res.data);
      } catch { toast.error('Failed to load leads'); }
      finally { setLoadingLeads(false); }
    })();
  }, []);

  const filtered = leads.filter(l => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (l.dispensary_name || '').toLowerCase().includes(s) ||
             (l.contact_name || '').toLowerCase().includes(s) ||
             (l.city || '').toLowerCase().includes(s) ||
             (l.state || '').toLowerCase().includes(s) ||
             (l.address || '').toLowerCase().includes(s) ||
             (l.zip_code || '').toLowerCase().includes(s);
    }
    return true;
  });

  const toggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await callsApi.createList({ name: name.trim(), description: description.trim(), leadIds: [...selectedIds] });
      toast.success('Call list created');
      onCreated();
    } catch { toast.error('Failed to create list'); }
    finally { setSaving(false); }
  };

  const stages = ['New Lead', 'Contacted', 'Demo Scheduled', 'Demo Completed', 'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'];

  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem' }}>New Call List</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}><FaTimes /></button>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>List Name *</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Colorado Dispensaries" />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Description</label>
          <input style={styles.input} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
        </div>

        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <FaSearch style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '0.75rem' }} />
            <input style={{ ...styles.input, paddingLeft: '2rem' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." />
          </div>
          <select style={styles.select} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
            <option value="">All Stages</option>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.375rem' }}>{selectedIds.size} selected</div>

        <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '6px' }}>
          {loadingLeads ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>Loading leads...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>No leads found</div>
          ) : filtered.map(lead => (
            <label key={lead.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
              borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: '0.8125rem',
              backgroundColor: selectedIds.has(lead.id) ? '#f0f7f0' : 'transparent',
            }}>
              <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggle(lead.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{lead.dispensary_name}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>
                  {lead.city}{lead.state ? `, ${lead.state}` : ''} · {lead.stage}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#999' }}>
                {lead.dispensary_number || lead.contact_number || 'No phone'}
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button style={styles.btn('default')} onClick={onClose}>Cancel</button>
          <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Creating...' : 'Create List'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Modal ──────────────────────────────────────────────
function ScheduleModal({ list, onClose, onCreated }) {
  const [scheduledFor, setScheduledFor] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!scheduledFor) { toast.error('Select a date/time'); return; }
    setSaving(true);
    try {
      await callsApi.createSchedule({
        callListId: list.id,
        scheduledFor: new Date(scheduledFor).toISOString(),
        delaySeconds,
        skipIvr: true,
      });
      onCreated();
    } catch { toast.error('Failed to create schedule'); }
    finally { setSaving(false); }
  };

  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={{ ...styles.modalContent, maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Schedule Calls</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}><FaTimes /></button>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#666', marginTop: 0 }}>
          Schedule batch calls for <strong>{list.name}</strong> ({list.lead_count} leads)
        </p>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Date & Time *</label>
          <input type="datetime-local" style={styles.input} value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Delay Between Calls (seconds)</label>
          <input type="number" style={styles.input} value={delaySeconds} onChange={e => setDelaySeconds(parseInt(e.target.value) || 30)} min={5} max={300} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button style={styles.btn('default')} onClick={onClose}>Cancel</button>
          <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2: Call History
// ═══════════════════════════════════════════════════════════════════
function CallHistoryTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await callsApi.getHistory(statusFilter || undefined);
      setLogs(res.data);
    } catch { toast.error('Failed to load call history'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { setLoading(true); fetchLogs(); }, [fetchLogs]);

  const handleRowClick = async (id) => {
    try {
      const res = await callsApi.getCallDetail(id);
      setSelectedLog(res.data);
    } catch { toast.error('Failed to load call details'); }
  };

  if (loading) return <div style={styles.empty}>Loading...</div>;

  return (
    <div>
      <div style={styles.header}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Call History</h3>
        <select style={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="no_answer">No Answer</option>
          <option value="busy">Busy</option>
          <option value="voicemail">Voicemail</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {logs.length === 0 ? (
        <div style={styles.empty}>No call history found.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Dispensary</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Duration</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Summary</th>
              <th style={styles.th}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} onClick={() => handleRowClick(log.id)}
                style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={styles.td}>
                  {log.lead_id ? (
                    <Link to={`/leads/${log.lead_id}`} style={styles.link}
                      onClick={e => e.stopPropagation()}>
                      {log.dispensary_name || 'Unknown'}
                    </Link>
                  ) : 'Unknown'}
                </td>
                <td style={styles.td}><StatusBadge status={log.status} colorMap={CALL_STATUS_COLORS} /></td>
                <td style={styles.td}>{formatDuration(log.duration)}</td>
                <td style={styles.td}>{formatDateTime(log.started_at || log.created_at)}</td>
                <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.summary || '—'}
                </td>
                <td style={styles.td}>{log.cost ? `$${parseFloat(log.cost).toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedLog && (
        <div style={styles.modal} onClick={() => setSelectedLog(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Call Details</h3>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}><FaTimes /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div><strong style={{ fontSize: '0.75rem', color: '#888' }}>Dispensary</strong><div>{selectedLog.dispensary_name || '—'}</div></div>
              <div><strong style={{ fontSize: '0.75rem', color: '#888' }}>Status</strong><div><StatusBadge status={selectedLog.status} colorMap={CALL_STATUS_COLORS} /></div></div>
              <div><strong style={{ fontSize: '0.75rem', color: '#888' }}>Duration</strong><div>{formatDuration(selectedLog.duration)}</div></div>
              <div><strong style={{ fontSize: '0.75rem', color: '#888' }}>Cost</strong><div>{selectedLog.cost ? `$${parseFloat(selectedLog.cost).toFixed(2)}` : '—'}</div></div>
              <div><strong style={{ fontSize: '0.75rem', color: '#888' }}>Started</strong><div>{formatDateTime(selectedLog.started_at)}</div></div>
              <div><strong style={{ fontSize: '0.75rem', color: '#888' }}>Ended</strong><div>{formatDateTime(selectedLog.ended_at)}</div></div>
            </div>
            {selectedLog.summary && (
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Summary</strong>
                <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>{selectedLog.summary}</p>
              </div>
            )}
            {selectedLog.recording_url && (
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.375rem' }}>Recording</strong>
                <audio controls src={selectedLog.recording_url} style={{ width: '100%', borderRadius: '8px' }} />
              </div>
            )}
            {selectedLog.transcript && (
              <div>
                <strong style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Transcript</strong>
                <div style={{
                  background: '#f8f9fa', borderRadius: '8px', padding: '1rem',
                  fontSize: '0.8125rem', lineHeight: 1.6, maxHeight: '300px', overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {selectedLog.transcript}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3: Callbacks
// ═══════════════════════════════════════════════════════════════════
function CallbacksTab() {
  const [callbacks, setCallbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchCallbacks = useCallback(async () => {
    try {
      const res = await callsApi.getCallbacks(statusFilter || undefined);
      setCallbacks(res.data);
    } catch { toast.error('Failed to load callbacks'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { setLoading(true); fetchCallbacks(); }, [fetchCallbacks]);

  const handleStatus = async (id, status) => {
    try {
      await callsApi.updateCallback(id, status);
      toast.success(`Callback marked ${status}`);
      fetchCallbacks();
    } catch { toast.error('Failed to update callback'); }
  };

  if (loading) return <div style={styles.empty}>Loading...</div>;

  return (
    <div>
      <div style={styles.header}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Callbacks</h3>
        <select style={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {callbacks.length === 0 ? (
        <div style={styles.empty}>No callbacks found.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Dispensary</th>
              <th style={styles.th}>Contact</th>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Reason</th>
              <th style={styles.th}>Preferred Time</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {callbacks.map(cb => (
              <tr key={cb.id}>
                <td style={styles.td}>
                  {cb.lead_id ? (
                    <Link to={`/leads/${cb.lead_id}`} style={styles.link}>{cb.dispensary_name || 'Unknown'}</Link>
                  ) : 'Unknown'}
                </td>
                <td style={styles.td}>{cb.callback_name || '—'}</td>
                <td style={styles.td}>{cb.callback_number || cb.dispensary_number || cb.contact_number || '—'}</td>
                <td style={styles.td}>{cb.callback_reason || '—'}</td>
                <td style={styles.td}>{cb.preferred_time || '—'}</td>
                <td style={styles.td}><StatusBadge status={cb.status} colorMap={CALLBACK_STATUS_COLORS} /></td>
                <td style={styles.td}>
                  {cb.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button style={styles.btnSm('success')} onClick={() => handleStatus(cb.id, 'completed')}>
                        <FaCheck size={10} /> Done
                      </button>
                      <button style={styles.btnSm('danger')} onClick={() => handleStatus(cb.id, 'cancelled')}>
                        <FaBan size={10} /> Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 4: Demos
// ═══════════════════════════════════════════════════════════════════
function DemosTab() {
  const [demos, setDemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchDemos = useCallback(async () => {
    try {
      const res = await callsApi.getDemos(statusFilter || undefined);
      setDemos(res.data);
    } catch { toast.error('Failed to load demos'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { setLoading(true); fetchDemos(); }, [fetchDemos]);

  const handleStatus = async (id, status) => {
    try {
      await callsApi.updateDemo(id, status);
      toast.success(`Demo marked ${status}`);
      fetchDemos();
    } catch { toast.error('Failed to update demo'); }
  };

  if (loading) return <div style={styles.empty}>Loading...</div>;

  return (
    <div>
      <div style={styles.header}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Demos</h3>
        <select style={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>
      </div>

      {demos.length === 0 ? (
        <div style={styles.empty}>No demos found.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Dispensary</th>
              <th style={styles.th}>Contact</th>
              <th style={styles.th}>Date/Time</th>
              <th style={styles.th}>Zoom Link</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Confirmed</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {demos.map(demo => (
              <tr key={demo.id}>
                <td style={styles.td}>
                  {demo.lead_id ? (
                    <Link to={`/leads/${demo.lead_id}`} style={styles.link}>
                      {demo.dispensary_name || demo.lead_dispensary_name || 'Unknown'}
                    </Link>
                  ) : (demo.dispensary_name || 'Unknown')}
                </td>
                <td style={styles.td}>{demo.contact_name || '—'}</td>
                <td style={styles.td}>
                  {demo.demo_date ? `${demo.demo_date}${demo.demo_time ? ` ${demo.demo_time}` : ''}` : '—'}
                </td>
                <td style={styles.td}>
                  {demo.zoom_link ? (
                    <a href={demo.zoom_link} target="_blank" rel="noopener noreferrer" style={styles.link}>
                      <FaExternalLinkAlt size={10} /> Join
                    </a>
                  ) : '—'}
                </td>
                <td style={styles.td}><StatusBadge status={demo.status} colorMap={DEMO_STATUS_COLORS} /></td>
                <td style={styles.td}>{demo.confirmation_sent ? 'Yes' : 'No'}</td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {demo.status === 'scheduled' && (
                      <>
                        <button style={styles.btnSm('success')} onClick={() => handleStatus(demo.id, 'completed')}>
                          <FaCheck size={10} /> Complete
                        </button>
                        <button style={styles.btnSm('danger')} onClick={() => handleStatus(demo.id, 'no_show')}>
                          No Show
                        </button>
                        <button style={styles.btnSm()} onClick={() => handleStatus(demo.id, 'cancelled')}>
                          Cancel
                        </button>
                      </>
                    )}
                    {demo.status === 'no_show' && (
                      <button style={styles.btnSm('success')} onClick={() => handleStatus(demo.id, 'completed')}>
                        <FaCheck size={10} /> Complete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 5: Schedules
// ═══════════════════════════════════════════════════════════════════
function SchedulesTab() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await callsApi.getSchedules();
      setSchedules(res.data);
    } catch { toast.error('Failed to load schedules'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this scheduled batch?')) return;
    try {
      await callsApi.cancelSchedule(id);
      toast.success('Schedule cancelled');
      fetchSchedules();
    } catch { toast.error('Failed to cancel schedule'); }
  };

  if (loading) return <div style={styles.empty}>Loading...</div>;

  return (
    <div>
      <div style={styles.header}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Scheduled Batches</h3>
      </div>

      {schedules.length === 0 ? (
        <div style={styles.empty}>No scheduled batches. Schedule one from a call list.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>List</th>
              <th style={styles.th}>Leads</th>
              <th style={styles.th}>Scheduled For</th>
              <th style={styles.th}>Source</th>
              <th style={styles.th}>Delay</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => {
              const leadCount = s.lead_ids ? (typeof s.lead_ids === 'string' ? JSON.parse(s.lead_ids) : s.lead_ids).length : 0;
              return (
                <tr key={s.id}>
                  <td style={styles.td}>{s.list_name || '—'}</td>
                  <td style={styles.td}>{leadCount}</td>
                  <td style={styles.td}>{formatDateTime(s.scheduled_for)}</td>
                  <td style={styles.td}>
                    {(() => {
                      const src = s.source || 'manual';
                      const sourceConfig = {
                        voicemail_retry: { label: 'Auto-retry', bg: '#e2d9f3', color: '#6f42c1' },
                        callback: { label: 'Callback', bg: '#fff3e0', color: '#e65100' },
                        manual: { label: 'Manual', bg: '#e9ecef', color: '#6c757d' },
                      };
                      const cfg = sourceConfig[src] || sourceConfig.manual;
                      return (
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                          fontSize: '0.75rem', fontWeight: 600, backgroundColor: cfg.bg, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={styles.td}>{s.delay_seconds}s</td>
                  <td style={styles.td}><StatusBadge status={s.status} colorMap={SCHEDULE_STATUS_COLORS} /></td>
                  <td style={styles.td}>
                    {s.status === 'pending' && (
                      <button style={styles.btnSm('danger')} onClick={() => handleCancel(s.id)}>
                        <FaBan size={10} /> Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Calls;
