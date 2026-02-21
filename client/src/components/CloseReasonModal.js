import React, { useState } from 'react';
import { CLOSED_WON_REASONS, CLOSED_LOST_REASONS } from '../constants/stages';

function CloseReasonModal({ stage, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');

  const reasons = stage === 'Closed Won' ? CLOSED_WON_REASONS : CLOSED_LOST_REASONS;
  const title = stage === 'Closed Won' ? 'Why did this deal close?' : 'Why was this deal lost?';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Select a reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="" disabled>Choose a reason...</option>
              {reasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!reason}
            onClick={() => onConfirm(reason)}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default CloseReasonModal;
