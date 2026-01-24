import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaArrowLeft,
  FaEdit,
  FaTrash,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaPlus,
  FaHistory,
  FaComments,
  FaUser,
  FaCopy
} from 'react-icons/fa';
import { leadsApi } from '../services/api';

function LeadDetail() {
  const { id, username } = useParams();
  const navigate = useNavigate();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyForm, setHistoryForm] = useState({
    contact_method: 'Phone',
    contact_person: '',
    notes: '',
    outcome: '',
    next_callback: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchLead = useCallback(async () => {
    try {
      const response = await leadsApi.getById(id);
      setLead(response.data);
    } catch (error) {
      console.error('Error fetching lead:', error);
      toast.error('Failed to load lead');
      navigate(`/${username}/leads`);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, username]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const handleDelete = async () => {
    try {
      await leadsApi.delete(id);
      toast.success('Lead deleted successfully');
      navigate(`/${username}/leads`);
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.error('Failed to delete lead');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleAddHistory = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await leadsApi.addHistory(id, historyForm);
      toast.success('Contact history added');
      setShowHistoryModal(false);
      setHistoryForm({
        contact_method: 'Phone',
        contact_person: '',
        notes: '',
        outcome: '',
        next_callback: ''
      });
      fetchLead();
    } catch (error) {
      console.error('Error adding history:', error);
      toast.error('Failed to add contact history');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return '-';
    }
  };

  const formatCallbackDays = (callbackDays) => {
    if (!callbackDays) return 'Not set';
    try {
      const daysArray = typeof callbackDays === 'string' ? JSON.parse(callbackDays) : callbackDays;
      if (!Array.isArray(daysArray) || daysArray.length === 0) return 'Not set';
      if (daysArray.length === 7) return 'Every day';
      return daysArray.join(', ');
    } catch {
      return 'Not set';
    }
  };

  const formatTimeRange = (from, to) => {
    if (!from && !to) return 'Any time';
    if (from && to) return `${from} - ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return 'Any time';
  };

  const getMethodIcon = (method) => {
    const icons = {
      'Phone': <FaPhone />,
      'Email': <FaEnvelope />,
      'In-Person': <FaUser />,
      'Text': <FaComments />,
      'Other': <FaHistory />
    };
    return icons[method] || <FaHistory />;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="empty-state">
        <h3>Lead not found</h3>
        <Link to={`/${username}/leads`} className="btn btn-primary">
          Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="lead-detail-page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to={`/${username}/leads`} className="btn btn-outline">
          <FaArrowLeft /> Back to Leads
        </Link>
      </div>

      <div className="lead-detail">
        <div className="lead-detail-header">
          <div className="lead-detail-title">
            <h2>{lead.dispensary_name}</h2>
            {lead.address && (
              <p style={{ color: '#6c757d', margin: '0.25rem 0 0.5rem', fontSize: '0.95rem' }}>
                <FaMapMarkerAlt size={12} style={{ marginRight: '0.5rem' }} />
                {lead.address}
              </p>
            )}
            {lead.priority && (
              <span className={`priority-badge priority-${lead.priority.toLowerCase()}`}>
                {lead.priority} Priority
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowHistoryModal(true)}
            >
              <FaPlus /> Log Contact
            </button>
            <Link to={`/${username}/leads/${id}/edit`} className="btn btn-primary">
              <FaEdit /> Edit
            </Link>
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteModal(true)}
            >
              <FaTrash />
            </button>
          </div>
        </div>

        <div className="lead-detail-body">
          {/* Callback Info Alert */}
          {lead.callback_days && lead.callback_days !== '[]' && (
            <div
              style={{
                background: '#e8f5e9',
                border: '1px solid #4caf50',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <FaCalendarAlt style={{ color: '#2d5a27' }} />
                <strong>Callback Schedule</strong>
              </div>
              <div style={{ marginLeft: '1.75rem' }}>
                <div><strong>Days:</strong> {formatCallbackDays(lead.callback_days)}</div>
                {(lead.callback_time_from || lead.callback_time_to) && (
                  <div><strong>Time:</strong> {formatTimeRange(lead.callback_time_from, lead.callback_time_to)}</div>
                )}
              </div>
            </div>
          )}

          {/* Contact Information */}
          <div className="detail-section">
            <h3><FaUser /> Contact Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Primary Contact</label>
                <span>
                  {lead.contact_name || '-'}
                  {lead.contact_position && <span style={{ color: '#6c757d' }}> ({lead.contact_position})</span>}
                </span>
              </div>
              <div className="detail-item">
                <label>Recommended Contact</label>
                <span>
                  {lead.manager_name || '-'}
                  {lead.owner_name && <span style={{ color: '#6c757d' }}> ({lead.owner_name})</span>}
                </span>
              </div>
              <div className="detail-item">
                <label>Dispensary Phone</label>
                <span>
                  {lead.dispensary_number ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`tel:${lead.dispensary_number}`} style={{ color: '#2d5a27' }}>
                        <FaPhone size={12} /> {lead.dispensary_number}
                      </a>
                      <button
                        onClick={() => copyToClipboard(lead.dispensary_number)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', padding: '0.25rem' }}
                        title="Copy to clipboard"
                      >
                        <FaCopy size={14} />
                      </button>
                    </span>
                  ) : '-'}
                </span>
              </div>
              <div className="detail-item">
                <label>Recommended Contact Phone</label>
                <span>
                  {lead.contact_number ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`tel:${lead.contact_number}`} style={{ color: '#2d5a27' }}>
                        <FaPhone size={12} /> {lead.contact_number}
                      </a>
                      <button
                        onClick={() => copyToClipboard(lead.contact_number)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', padding: '0.25rem' }}
                        title="Copy to clipboard"
                      >
                        <FaCopy size={14} />
                      </button>
                    </span>
                  ) : '-'}
                </span>
              </div>
              <div className="detail-item">
                <label>Recommended Contact Email</label>
                <span>
                  {lead.contact_email ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`mailto:${lead.contact_email}`} style={{ color: '#2d5a27' }}>
                        <FaEnvelope size={12} /> {lead.contact_email}
                      </a>
                      <button
                        onClick={() => copyToClipboard(lead.contact_email)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', padding: '0.25rem' }}
                        title="Copy to clipboard"
                      >
                        <FaCopy size={14} />
                      </button>
                    </span>
                  ) : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="detail-section">
              <h3><FaComments /> Notes</h3>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {lead.notes}
              </div>
            </div>
          )}

          {/* Contact History */}
          <div className="detail-section">
            <h3><FaHistory /> Contact History</h3>
            {lead.contact_history && lead.contact_history.length > 0 ? (
              <div className="history-list">
                {lead.contact_history.map((history) => (
                  <div key={history.id} className="history-item">
                    <div className="history-icon">
                      {getMethodIcon(history.contact_method)}
                    </div>
                    <div className="history-content">
                      <h4>
                        {history.contact_method || 'Contact'}
                        {history.contact_person && ` with ${history.contact_person}`}
                      </h4>
                      {history.notes && <p>{history.notes}</p>}
                      {history.outcome && (
                        <p><strong>Outcome:</strong> {history.outcome}</p>
                      )}
                      {history.next_callback && (
                        <p><strong>Next callback:</strong> {formatDateTime(history.next_callback)}</p>
                      )}
                      <div className="history-meta">
                        {formatDateTime(history.contact_date)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                No contact history yet. Click "Log Contact" to add your first entry.
              </p>
            )}
          </div>

          {/* Metadata */}
          <div className="detail-section">
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created</label>
                <span>{formatDateTime(lead.created_at)}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated</label>
                <span>{formatDateTime(lead.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{lead.dispensary_name}</strong>?</p>
              <p>This will also delete all contact history. This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Log Contact</h3>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAddHistory}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Contact Method</label>
                  <select
                    value={historyForm.contact_method}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, contact_method: e.target.value }))}
                  >
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="In-Person">In-Person</option>
                    <option value="Text">Text</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Person Contacted</label>
                  <input
                    type="text"
                    value={historyForm.contact_person}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, contact_person: e.target.value }))}
                    placeholder="Who did you speak with?"
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={historyForm.notes}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="What was discussed?"
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Outcome</label>
                  <input
                    type="text"
                    value={historyForm.outcome}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, outcome: e.target.value }))}
                    placeholder="e.g., Scheduled demo, Sent proposal"
                  />
                </div>

                <div className="form-group">
                  <label>Schedule Next Callback</label>
                  <input
                    type="datetime-local"
                    value={historyForm.next_callback}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, next_callback: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowHistoryModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadDetail;
