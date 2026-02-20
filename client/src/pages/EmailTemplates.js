import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FaPlus, FaEdit, FaTrash, FaEnvelope } from 'react-icons/fa';
import { emailTemplatesApi } from '../services/api';

const CATEGORIES = ['General', 'Intro', 'Follow-Up', 'Proposal', 'Demo'];

const CATEGORY_COLORS = {
  'General': { bg: '#e9ecef', color: '#495057' },
  'Intro': { bg: '#d4edda', color: '#155724' },
  'Follow-Up': { bg: '#fff3cd', color: '#856404' },
  'Proposal': { bg: '#cce5ff', color: '#004085' },
  'Demo': { bg: '#f3e5f5', color: '#7b1fa2' },
};

function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    category: 'General'
  });

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await emailTemplatesApi.getAll();
      setTemplates(response.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({ name: '', subject: '', body: '', category: 'General' });
    setShowModal(true);
  };

  const openEdit = (template) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category || 'General'
    });
    setShowModal(true);
  };

  const confirmDelete = (template) => {
    setDeleteTarget(template);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await emailTemplatesApi.delete(deleteTarget.id);
      toast.success('Template deleted');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingTemplate) {
        await emailTemplatesApi.update(editingTemplate.id, form);
        toast.success('Template updated');
      } else {
        await emailTemplatesApi.create(form);
        toast.success('Template created');
      }
      setShowModal(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="leads-container">
        <div className="leads-header">
          <h2><FaEnvelope style={{ marginRight: '0.5rem' }} /> Email Templates</h2>
          <button className="btn btn-primary" onClick={openCreate}>
            <FaPlus /> New Template
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {templates.length > 0 ? (
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {templates.map(template => (
                <div key={template.id} className="email-template-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 600 }}>{template.name}</h3>
                    <span
                      style={{
                        background: (CATEGORY_COLORS[template.category] || CATEGORY_COLORS['General']).bg,
                        color: (CATEGORY_COLORS[template.category] || CATEGORY_COLORS['General']).color,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '50px',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        flexShrink: 0
                      }}
                    >
                      {template.category || 'General'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#495057', margin: '0 0 0.5rem', fontWeight: 500 }}>
                    Subject: {template.subject}
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: '#6c757d', margin: '0 0 1rem', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {template.body}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid #dee2e6', paddingTop: '0.75rem' }}>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(template)}>
                      <FaEdit /> Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => confirmDelete(template)}>
                      <FaTrash /> Delete
                    </button>
                    {template.is_default && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#6c757d', alignSelf: 'center' }}>Default</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <FaEnvelope className="empty-state-icon" />
              <h3>No email templates yet</h3>
              <p>Create your first template to start sending emails faster.</p>
              <button className="btn btn-primary" onClick={openCreate}>
                <FaPlus /> New Template
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>{editingTemplate ? 'Edit Template' : 'New Template'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Name <span className="required">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Introduction Email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label>Subject <span className="required">*</span></label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="e.g., POS Solutions for {{dispensary_name}}"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label>Body <span className="required">*</span></label>
                  <textarea
                    value={form.body}
                    onChange={(e) => setForm(prev => ({ ...prev, body: e.target.value }))}
                    placeholder="Write your email template here..."
                    rows="10"
                    required
                  />
                </div>
                <div className="merge-field-help">
                  Available merge fields: <code>{'{{dispensary_name}}'}</code> <code>{'{{contact_name}}'}</code> (Reference) <code>{'{{manager_name}}'}</code> (Name) <code>{'{{contact_email}}'}</code> <code>{'{{dispensary_number}}'}</code> <code>{'{{contact_number}}'}</code> <code>{'{{current_pos_system}}'}</code> <code>{'{{address}}'}</code> <code>{'{{city}}'}</code> <code>{'{{state}}'}</code>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Create Template')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</p>
              <p>This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailTemplates;
