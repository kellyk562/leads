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
  FaEnvelope,
  FaMapMarkerAlt,
  FaDownload,
  FaUpload,
  FaTimes
} from 'react-icons/fa';
import { leadsApi } from '../services/api';
import { STAGES, STAGE_COLORS, STAGE_BG_COLORS, getScoreColor, getScoreBg, getScoreLabel } from '../constants/stages';
import CloseReasonModal from '../components/CloseReasonModal';

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
                      <div style={{ fontSize: '0.875rem' }}>
                        {lead.manager_name && (
                          <div>
                            <strong>{lead.manager_name}</strong>
                            {lead.owner_name && <span style={{ color: '#6c757d' }}> ({lead.owner_name})</span>}
                          </div>
                        )}
                        {lead.contact_number && (
                          <div style={{ color: '#6c757d' }}>
                            <FaPhone size={10} /> {lead.contact_number}
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
    </div>
  );
}

export default LeadsList;
