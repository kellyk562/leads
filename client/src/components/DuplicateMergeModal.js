import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { leadsApi } from '../services/api';

const DISPLAY_FIELDS = [
  { key: 'dispensary_name', label: 'Dispensary Name' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'manager_name', label: 'Manager' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'contact_number', label: 'Phone' },
  { key: 'contact_email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip_code', label: 'Zip' },
  { key: 'website', label: 'Website' },
  { key: 'current_pos_system', label: 'Current POS' },
  { key: 'stage', label: 'Stage' },
  { key: 'deal_value', label: 'Deal Value' },
  { key: 'priority', label: 'Priority' },
  { key: 'notes', label: 'Notes' },
  { key: 'source', label: 'Source' },
  { key: 'callback_days', label: 'Callback Days' },
];

function DuplicateMergeModal({ onClose, onMerged }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null); // { keepId, mergeId }
  const [fieldsFromMerge, setFieldsFromMerge] = useState(new Set());
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const res = await leadsApi.getDuplicates();
      setGroups(res.data);
    } catch (error) {
      console.error('Error fetching duplicates:', error);
      toast.error('Failed to find duplicates');
    } finally {
      setLoading(false);
    }
  };

  const selectGroup = (group) => {
    setSelectedGroup(group);
    if (group.leads.length === 2) {
      setSelectedPair({ keepId: group.leads[0].id, mergeId: group.leads[1].id });
    } else {
      setSelectedPair(null);
    }
    setFieldsFromMerge(new Set());
    setStep(2);
  };

  const getKeepLead = () => selectedGroup?.leads.find(l => l.id === selectedPair?.keepId);
  const getMergeLead = () => selectedGroup?.leads.find(l => l.id === selectedPair?.mergeId);

  const toggleField = (fieldKey) => {
    setFieldsFromMerge(prev => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  const handleMerge = async () => {
    if (!selectedPair) return;
    setMerging(true);
    try {
      await leadsApi.mergeLeads(selectedPair.keepId, selectedPair.mergeId, [...fieldsFromMerge]);
      toast.success('Leads merged successfully');
      onMerged();
    } catch (error) {
      console.error('Error merging leads:', error);
      toast.error('Failed to merge leads');
      setMerging(false);
    }
  };

  const matchFieldLabel = (field) => {
    switch (field) {
      case 'name': return 'Matching Name';
      case 'phone': return 'Matching Phone';
      case 'email': return 'Matching Email';
      default: return 'Match';
    }
  };

  const formatValue = (val) => {
    if (val === null || val === undefined || val === '') return '-';
    return String(val);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>
            {step === 1 && 'Duplicate Leads Found'}
            {step === 2 && 'Compare & Merge'}
            {step === 3 && 'Confirm Merge'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {/* Step 1: Groups list */}
          {step === 1 && (
            <>
              {loading ? (
                <div className="loading"><div className="spinner"></div></div>
              ) : groups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <FaCheckCircle size={40} style={{ color: '#198754', marginBottom: '1rem' }} />
                  <h4>No duplicates found</h4>
                  <p style={{ color: '#6c757d' }}>All your leads appear to be unique.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {groups.map((group, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectGroup(group)}
                      style={{
                        border: '1px solid #dee2e6',
                        borderRadius: '8px',
                        padding: '1rem',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#2d5a27'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#dee2e6'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{
                          background: '#fff3cd', color: '#856404',
                          padding: '0.15rem 0.5rem', borderRadius: '50px',
                          fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase'
                        }}>
                          {matchFieldLabel(group.matchField)}
                        </span>
                        <span style={{ fontSize: '0.8125rem', color: '#6c757d' }}>
                          {group.leads.length} leads
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {group.leads.map(lead => (
                          <span key={lead.id} style={{
                            background: '#f8f9fa', padding: '0.25rem 0.75rem',
                            borderRadius: '4px', fontSize: '0.875rem'
                          }}>
                            {lead.dispensary_name} {lead.city ? `(${lead.city})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 2: Side-by-side comparison */}
          {step === 2 && selectedGroup && (
            <>
              {selectedGroup.leads.length > 2 && !selectedPair && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Select two leads to compare:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedGroup.leads.map(lead => (
                      <label key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPair?.keepId === lead.id || selectedPair?.mergeId === lead.id}
                          onChange={() => {
                            if (!selectedPair) {
                              setSelectedPair({ keepId: lead.id, mergeId: null });
                            } else if (!selectedPair.mergeId && selectedPair.keepId !== lead.id) {
                              setSelectedPair(prev => ({ ...prev, mergeId: lead.id }));
                            }
                          }}
                          style={{ accentColor: '#2d5a27' }}
                        />
                        {lead.dispensary_name} {lead.city ? `(${lead.city})` : ''}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {selectedPair?.keepId && selectedPair?.mergeId && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: '#d1e7dd', borderRadius: '6px', fontWeight: 600, color: '#198754' }}>
                      Keep (Primary)
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f8d7da', borderRadius: '6px', fontWeight: 600, color: '#dc3545' }}>
                      Merge (Will be deleted)
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setSelectedPair(prev => ({ keepId: prev.mergeId, mergeId: prev.keepId }))}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Swap Keep/Merge
                    </button>
                    <div />
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #dee2e6', width: '25%' }}>Field</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #dee2e6', width: '35%' }}>Keep</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #dee2e6', width: '5%' }}></th>
                        <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #dee2e6', width: '35%' }}>Merge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DISPLAY_FIELDS.map(({ key, label }) => {
                        const keepVal = formatValue(getKeepLead()?.[key]);
                        const mergeVal = formatValue(getMergeLead()?.[key]);
                        const isDiff = keepVal !== mergeVal;
                        const useFromMerge = fieldsFromMerge.has(key);
                        return (
                          <tr key={key} style={{ background: isDiff ? '#fffde7' : 'transparent' }}>
                            <td style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #f0f0f0', fontWeight: 500, color: '#495057' }}>{label}</td>
                            <td style={{
                              padding: '0.4rem 0.5rem', borderBottom: '1px solid #f0f0f0',
                              fontWeight: useFromMerge ? 400 : 600,
                              color: useFromMerge ? '#adb5bd' : '#212529',
                              textDecoration: useFromMerge ? 'line-through' : 'none',
                              maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>{keepVal}</td>
                            <td style={{ padding: '0.4rem', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                              {isDiff && (
                                <input
                                  type="checkbox"
                                  checked={useFromMerge}
                                  onChange={() => toggleField(key)}
                                  title="Use value from merge lead"
                                  style={{ accentColor: '#2d5a27', cursor: 'pointer' }}
                                />
                              )}
                            </td>
                            <td style={{
                              padding: '0.4rem 0.5rem', borderBottom: '1px solid #f0f0f0',
                              fontWeight: useFromMerge ? 600 : 400,
                              color: useFromMerge ? '#198754' : '#6c757d',
                              maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>{mergeVal}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#856404' }}>
                <FaExclamationTriangle />
                <strong>This action cannot be undone.</strong>
              </div>
              <p>
                <strong>Keeping:</strong> {getKeepLead()?.dispensary_name} (ID {selectedPair?.keepId})
              </p>
              <p>
                <strong>Deleting:</strong> {getMergeLead()?.dispensary_name} (ID {selectedPair?.mergeId})
              </p>
              {fieldsFromMerge.size > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Fields copied from merge lead:</p>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#495057' }}>
                    {[...fieldsFromMerge].map(f => {
                      const label = DISPLAY_FIELDS.find(df => df.key === f)?.label || f;
                      return <li key={f}>{label}: {formatValue(getMergeLead()?.[f])}</li>;
                    })}
                  </ul>
                </div>
              )}
              <p style={{ marginTop: '1rem', color: '#6c757d', fontSize: '0.875rem' }}>
                All contact history, tasks, and scheduled emails from the deleted lead will be reassigned to the kept lead.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 1 && (
            <button className="btn btn-outline" onClick={onClose}>Close</button>
          )}
          {step === 2 && (
            <>
              <button className="btn btn-outline" onClick={() => { setStep(1); setSelectedGroup(null); setSelectedPair(null); }}>Back</button>
              <button
                className="btn btn-primary"
                disabled={!selectedPair?.keepId || !selectedPair?.mergeId}
                onClick={() => setStep(3)}
              >
                Review Merge
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button className="btn btn-outline" onClick={() => setStep(2)} disabled={merging}>Back</button>
              <button className="btn btn-danger" onClick={handleMerge} disabled={merging}>
                {merging ? 'Merging...' : 'Confirm Merge'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DuplicateMergeModal;
