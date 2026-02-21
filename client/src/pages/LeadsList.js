import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaPlus,
  FaEye,
  FaEdit,
  FaTrash,
  FaSearch,
  FaFilter,
  FaSort,
  FaPhone,
  FaPhoneAlt,
  FaEnvelope,
  FaMapMarkerAlt,
  FaDownload,
  FaUpload,
  FaTimes,
  FaExclamationTriangle,
  FaCopy
} from 'react-icons/fa';
import { leadsApi, emailApi, emailTemplatesApi } from '../services/api';
import { STAGES, STAGE_COLORS, STAGE_BG_COLORS, getScoreColor, getScoreBg, getScoreLabel, getCadenceLabel } from '../constants/stages';
import CloseReasonModal from '../components/CloseReasonModal';
import QuickLogModal from '../components/QuickLogModal';
import ClickToCall from '../components/ClickToCall';
import DuplicateMergeModal from '../components/DuplicateMergeModal';

function LeadsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [stageFilter, setStageFilter] = useState(searchParams.get('stage') || '');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [pendingBulkClose, setPendingBulkClose] = useState(null);
  const [quickLog, setQuickLog] = useState(null);
  const [batchEmailOpen, setBatchEmailOpen] = useState(false);
  const [batchTemplates, setBatchTemplates] = useState([]);
  const [batchSelectedTemplate, setBatchSelectedTemplate] = useState(null);
  const [batchStep, setBatchStep] = useState(1);
  const [batchSending, setBatchSending] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        sort: sortBy,
        order: sortOrder,
      };
      if (search) params.search = search;
      if (stageFilter) params.stage = stageFilter;

      const response = await leadsApi.getAll(params);
      setLeads(response.data);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, stageFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (stageFilter) params.set('stage', stageFilter);
    setSearchParams(params);
  }, [search, stageFilter, setSearchParams]);

  // Clear selection on filter change
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [search, stageFilter, sortBy, sortOrder]);

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
      setSelectAll(true);
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAll(false);
  };

  const initiateBulkStage = (stage) => {
    if (stage === 'Closed Won' || stage === 'Closed Lost') {
      setPendingBulkClose(stage);
    } else {
      handleBulkStage(stage);
    }
  };

  const handleBulkStage = async (stage, reason) => {
    const ids = [...selectedIds];
    try {
      await leadsApi.bulkUpdateStage(ids, stage, reason);
      toast.success(`Updated ${ids.length} leads to "${stage}"`);
      setSelectedIds(new Set());
      setSelectAll(false);
      fetchLeads();
    } catch (error) {
      console.error('Error bulk updating stage:', error);
      toast.error('Failed to update stages');
    }
  };

  const handleDelete = async (id) => {
    try {
      await leadsApi.delete(id);
      toast.success('Lead deleted successfully');
      setDeleteConfirm(null);
      fetchLeads();
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.error('Failed to delete lead');
    }
  };

  const handleExport = () => {
    const baseUrl = process.env.REACT_APP_API_URL ||
      (window.location.port === '3000' ? 'http://localhost:5001/api' : '/api');
    window.location.href = `${baseUrl}/leads/export/csv`;
  };

  const handleExportSelected = () => {
    const selected = leads.filter(l => selectedIds.has(l.id));
    if (selected.length === 0) return;

    const headers = [
      'ID', 'Contact Date', 'Dispensary Name', 'Address', 'City', 'State', 'Zip Code',
      'Dispensary Phone', 'Contact Name', 'Manager Name', 'Owner Name',
      'Phone', 'Email', 'Website', 'Current POS', 'Deal Value', 'Stage',
      'Priority', 'Notes', 'Callback Days', 'Callback Time From', 'Callback Time To',
      'Callback Date', 'Source'
    ];

    const esc = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""').replace(/\n/g, ' ');
      return str.includes(',') || str.includes('"') ? `"${str}"` : str;
    };

    const rows = selected.map(l => [
      l.id, l.contact_date || '', esc(l.dispensary_name), esc(l.address),
      l.city || '', l.state || '', l.zip_code || '', l.dispensary_number || '',
      esc(l.contact_name), esc(l.manager_name), l.owner_name || '',
      l.contact_number || '', l.contact_email || '', l.website || '',
      l.current_pos_system || '', l.deal_value || '', l.stage || 'New Lead',
      l.priority || 'Medium', esc(l.notes), esc(l.callback_days),
      l.callback_time_from || '', l.callback_time_to || '',
      l.callback_date || '', l.source || ''
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${selected.length}-selected-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} lead${selected.length !== 1 ? 's' : ''}`);
  };

  const openBatchEmail = async () => {
    try {
      const res = await emailTemplatesApi.getAll();
      setBatchTemplates(res.data);
      setBatchSelectedTemplate(null);
      setBatchStep(1);
      setBatchEmailOpen(true);
    } catch (error) {
      toast.error('Failed to load templates');
    }
  };

  const handleBatchSend = async () => {
    if (!batchSelectedTemplate) return;
    setBatchSending(true);
    try {
      const res = await emailApi.sendBatch([...selectedIds], batchSelectedTemplate);
      const { sent, skipped, errors } = res.data;
      toast.success(`Sent to ${sent} lead${sent !== 1 ? 's' : ''}${skipped ? `, ${skipped} skipped (no email)` : ''}`);
      if (errors?.length > 0) {
        toast.warn(`${errors.length} error${errors.length !== 1 ? 's' : ''}: ${errors[0]}`);
      }
      setBatchEmailOpen(false);
      setSelectedIds(new Set());
      setSelectAll(false);
      fetchLeads();
    } catch (error) {
      console.error('Batch email error:', error);
      toast.error('Failed to send batch email');
    } finally {
      setBatchSending(false);
    }
  };

  const batchLeadsWithEmail = leads.filter(l => selectedIds.has(l.id) && l.contact_email).length;
  const batchLeadsWithoutEmail = selectedIds.size - batchLeadsWithEmail;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return '-';
    }
  };

  const formatCallbackDays = (callbackDays) => {
    if (!callbackDays) return '-';
    try {
      const daysArray = typeof callbackDays === 'string' ? JSON.parse(callbackDays) : callbackDays;
      if (!Array.isArray(daysArray) || daysArray.length === 0) return '-';
      if (daysArray.length === 7) return 'Every day';
      return daysArray.map(d => d.slice(0, 3)).join(', ');
    } catch {
      return '-';
    }
  };

  const formatTimeRange = (from, to) => {
    if (!from && !to) return '';
    if (from && to) return `${from} - ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return '';
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const getDaysColor = (days) => {
    if (days === null || days === undefined) return '#6c757d';
    if (days <= 7) return '#198754';
    if (days <= 14) return '#e65100';
    return '#dc3545';
  };

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  return (
    <div className="leads-list-page">
      <div className="leads-container">
        <div className="leads-header">
          <h2>Sales Leads</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowDuplicateModal(true)} className="btn btn-outline">
              <FaCopy /> Find Duplicates
            </button>
            <Link to="/import" className="btn btn-outline">
              <FaUpload /> Import
            </Link>
            <button onClick={handleExport} className="btn btn-outline">
              <FaDownload /> Export
            </button>
            <Link to="/leads/new" className="btn btn-primary">
              <FaPlus /> Add New Lead
            </Link>
          </div>
        </div>

        <div className="filters-bar">
          <div className="search-wrapper" style={{ position: 'relative', flex: 1 }}>
            <FaSearch style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#6c757d'
            }} />
            <input
              type="text"
              className="search-input"
              placeholder="Search dispensaries, contacts, addresses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          <select
            className="filter-select"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value="">All Stages</option>
            {STAGES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [col, ord] = e.target.value.split('-');
              setSortBy(col);
              setSortOrder(ord);
            }}
          >
            <option value="updated_at-DESC">Recently Updated</option>
            <option value="created_at-DESC">Newest First</option>
            <option value="created_at-ASC">Oldest First</option>
            <option value="dispensary_name-ASC">Name A-Z</option>
            <option value="dispensary_name-DESC">Name Z-A</option>
            <option value="deal_value-DESC">Highest Value</option>
            <option value="lead_score-DESC">Highest Score</option>
          </select>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FaFilter />
            </div>
            <h3>No leads found</h3>
            <p>
              {search
                ? 'Try adjusting your search terms'
                : 'Get started by adding your first sales lead'}
            </p>
            {!search && (
              <Link to="/leads/new" className="btn btn-primary">
                <FaPlus /> Add First Lead
              </Link>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={toggleSelectAll}
                      style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                    />
                  </th>
                  <th onClick={() => toggleSort('dispensary_name')} style={{ cursor: 'pointer' }}>
                    Dispensary <FaSort />
                  </th>
                  <th>Stage</th>
                  <th>Score</th>
                  <th>Cadence</th>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Deal Value</th>
                  <th>
                    Callback Days
                  </th>
                  <th>Last Contact</th>
                  <th onClick={() => toggleSort('contact_date')} style={{ cursor: 'pointer' }}>
                    Contact Date <FaSort />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} style={selectedIds.has(lead.id) ? { background: '#e8f5e9' } : {}}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelectOne(lead.id)}
                        style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                      />
                    </td>
                    <td>
                      <Link to={`/leads/${lead.id}`} style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                        {lead.dispensary_name}
                      </Link>
                    </td>
                    <td>
                      <span
                        className="stage-badge"
                        style={{
                          background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
                          color: STAGE_COLORS[lead.stage || 'New Lead'],
                        }}
                      >
                        {lead.stage || 'New Lead'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '50px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: getScoreBg(lead.lead_score || 0),
                        color: getScoreColor(lead.lead_score || 0)
                      }}>
                        {lead.lead_score || 0} {getScoreLabel(lead.lead_score || 0)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '50px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: (lead.cadence_step || 0) > 0 ? '#f3e5f5' : '#e9ecef',
                        color: (lead.cadence_step || 0) > 0 ? '#7b1fa2' : '#6c757d'
                      }}>
                        {getCadenceLabel(lead.cadence_step || 0)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.875rem' }}>
                        {lead.manager_name && (
                          <div>
                            <strong>{lead.manager_name}</strong>
                            {lead.owner_name && <span style={{ color: '#6c757d' }}> ({lead.owner_name})</span>}
                          </div>
                        )}
                        {lead.contact_number && (
                          <div>
                            <ClickToCall phone={lead.contact_number} leadId={lead.id} dispensaryName={lead.dispensary_name}>
                              <FaPhone size={10} /> {lead.contact_number}
                            </ClickToCall>
                          </div>
                        )}
                        {lead.contact_email && (
                          <div style={{ color: '#6c757d' }}>
                            <FaEnvelope size={10} /> {lead.contact_email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {lead.address && (
                        <div style={{ color: '#6c757d', fontSize: '0.875rem' }}>
                          <FaMapMarkerAlt size={10} /> {lead.address}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem', fontWeight: lead.deal_value ? 600 : 400, color: lead.deal_value ? '#2e7d32' : '#6c757d' }}>
                      {lead.deal_value ? `${formatCurrency(lead.deal_value)}/mo` : '-'}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      <div>{formatCallbackDays(lead.callback_days)}</div>
                      {formatTimeRange(lead.callback_time_from, lead.callback_time_to) && (
                        <div style={{ color: '#6c757d', fontSize: '0.75rem' }}>
                          {formatTimeRange(lead.callback_time_from, lead.callback_time_to)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem', fontWeight: 600, color: getDaysColor(lead.days_since_last_contact) }}>
                      {lead.days_since_last_contact !== null && lead.days_since_last_contact !== undefined
                        ? `${lead.days_since_last_contact}d ago`
                        : <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#6c757d' }}>Never</span>}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {formatDate(lead.contact_date)}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-sm btn-outline btn-icon"
                          title="Quick Log"
                          onClick={() => setQuickLog({ leadId: lead.id, name: lead.dispensary_name })}
                          style={{ color: '#2d5a27' }}
                        >
                          <FaPhoneAlt />
                        </button>
                        <Link
                          to={`/leads/${lead.id}`}
                          className="btn btn-sm btn-outline btn-icon"
                          title="View"
                        >
                          <FaEye />
                        </Link>
                        <Link
                          to={`/leads/${lead.id}/edit`}
                          className="btn btn-sm btn-outline btn-icon"
                          title="Edit"
                        >
                          <FaEdit />
                        </Link>
                        <button
                          className="btn btn-sm btn-outline btn-icon"
                          title="Delete"
                          onClick={() => setDeleteConfirm(lead.id)}
                          style={{ color: '#dc3545' }}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span style={{ fontWeight: 600 }}>{selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) initiateBulkStage(e.target.value); e.target.value = ''; }}
              style={{ padding: '0.375rem 0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: '0.875rem' }}
            >
              <option value="" disabled>Change Stage...</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={openBatchEmail}
            >
              <FaEnvelope /> Send Email
            </button>
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={handleExportSelected}
            >
              <FaDownload /> Export
            </button>
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}
            >
              <FaTimes /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Close Reason Modal */}
      {pendingBulkClose && (
        <CloseReasonModal
          stage={pendingBulkClose}
          onConfirm={(reason) => {
            handleBulkStage(pendingBulkClose, reason);
            setPendingBulkClose(null);
          }}
          onCancel={() => setPendingBulkClose(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this lead? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Log Modal */}
      {quickLog && (
        <QuickLogModal
          leadId={quickLog.leadId}
          dispensaryName={quickLog.name}
          onClose={() => setQuickLog(null)}
          onSaved={() => { setQuickLog(null); fetchLeads(); }}
        />
      )}

      {/* Duplicate Merge Modal */}
      {showDuplicateModal && (
        <DuplicateMergeModal
          onClose={() => setShowDuplicateModal(false)}
          onMerged={() => { setShowDuplicateModal(false); fetchLeads(); }}
        />
      )}

      {/* Batch Email Modal */}
      {batchEmailOpen && (
        <div className="modal-overlay" onClick={() => setBatchEmailOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Send Batch Email</h3>
              <button className="modal-close" onClick={() => setBatchEmailOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {batchStep === 1 && (
                <div>
                  <div className="form-group">
                    <label>Select Template</label>
                    {batchTemplates.length === 0 ? (
                      <p style={{ color: '#6c757d' }}>No email templates found. Create one first.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {batchTemplates.map(t => (
                          <label
                            key={t.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.75rem',
                              border: batchSelectedTemplate === t.id ? '2px solid #2d5a27' : '1px solid #dee2e6',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: batchSelectedTemplate === t.id ? '#e8f5e9' : 'white'
                            }}
                          >
                            <input
                              type="radio"
                              name="batchTemplate"
                              checked={batchSelectedTemplate === t.id}
                              onChange={() => setBatchSelectedTemplate(t.id)}
                              style={{ accentColor: '#2d5a27' }}
                            />
                            <div>
                              <div style={{ fontWeight: 600 }}>{t.name}</div>
                              <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>{t.subject}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {batchStep === 2 && (
                <div>
                  <p style={{ marginBottom: '1rem' }}>
                    <strong>{batchLeadsWithEmail}</strong> lead{batchLeadsWithEmail !== 1 ? 's' : ''} will receive this email.
                  </p>
                  {batchLeadsWithoutEmail > 0 && (
                    <p style={{ color: '#e65100', marginBottom: '1rem' }}>
                      <FaExclamationTriangle style={{ marginRight: '0.25rem' }} />
                      {batchLeadsWithoutEmail} lead{batchLeadsWithoutEmail !== 1 ? 's' : ''} will be skipped (no email address).
                    </p>
                  )}
                  <p style={{ color: '#6c757d', fontSize: '0.875rem' }}>
                    Template: <strong>{batchTemplates.find(t => t.id === batchSelectedTemplate)?.name}</strong>
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {batchStep === 1 ? (
                <>
                  <button className="btn btn-outline" onClick={() => setBatchEmailOpen(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    disabled={!batchSelectedTemplate}
                    onClick={() => setBatchStep(2)}
                  >
                    Next
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={() => setBatchStep(1)}>Back</button>
                  <button
                    className="btn btn-primary"
                    disabled={batchSending || batchLeadsWithEmail === 0}
                    onClick={handleBatchSend}
                  >
                    {batchSending ? 'Sending...' : `Send to ${batchLeadsWithEmail} Lead${batchLeadsWithEmail !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadsList;
