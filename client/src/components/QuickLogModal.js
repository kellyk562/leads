import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { leadsApi } from '../services/api';

function QuickLogModal({ leadId, dispensaryName, onClose, onSaved }) {
  const [contactMethod, setContactMethod] = useState('Phone');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await leadsApi.addHistory(leadId, {
        contact_method: contactMethod,
        notes,
        outcome: outcome || undefined,
      });
      toast.success(`Logged ${contactMethod.toLowerCase()} for ${dispensaryName}`);
      onSaved();
    } catch (error) {
      console.error('Error logging contact:', error);
      toast.error('Failed to log contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3>Quick Log — {dispensaryName}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Contact Method</label>
              <select
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="Phone">Phone</option>
                <option value="Email">Email</option>
                <option value="In-Person">In-Person</option>
                <option value="Text">Text</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What happened?"
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group">
              <label>Outcome</label>
              <input
                type="text"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="e.g. Left voicemail, Scheduled demo"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Log Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuickLogModal;
