import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { leadsApi } from '../services/api';
import { STAGES, STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';

function Pipeline() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    try {
      const response = await leadsApi.getAll({ sort: 'updated_at', order: 'DESC' });
      setLeads(response.data);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };

  const groupedLeads = useMemo(() => {
    const groups = {};
    STAGES.forEach(stage => { groups[stage] = []; });
    leads.forEach(lead => {
      const stage = lead.stage || 'New Lead';
      if (groups[stage]) {
        groups[stage].push(lead);
      } else {
        groups['New Lead'].push(lead);
      }
    });
    return groups;
  }, [leads]);

  const stageValues = useMemo(() => {
    const values = {};
    STAGES.forEach(stage => {
      values[stage] = (groupedLeads[stage] || []).reduce((sum, lead) => sum + (parseFloat(lead.deal_value) || 0), 0);
    });
    return values;
  }, [groupedLeads]);

  const handleStageChange = async (leadId, newStage) => {
    try {
      await leadsApi.updateStage(leadId, newStage);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));
      toast.success(`Moved to ${newStage}`);
    } catch (error) {
      console.error('Error updating stage:', error);
      toast.error('Failed to update stage');
    }
  };

  const getAdjacentStage = (currentStage, direction) => {
    const idx = STAGES.indexOf(currentStage || 'New Lead');
    if (idx === -1) return null;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= STAGES.length) return null;
    return STAGES[newIdx];
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="pipeline-page">
      <div className="pipeline-board">
        {STAGES.map(stage => (
          <div key={stage} className="pipeline-column">
            <div
              className="pipeline-column-header"
              style={{ borderTopColor: STAGE_COLORS[stage] }}
            >
              <span className="pipeline-column-title">{stage}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span
                  className="pipeline-column-count"
                  style={{ background: STAGE_BG_COLORS[stage], color: STAGE_COLORS[stage] }}
                >
                  {groupedLeads[stage].length}
                </span>
                {stageValues[stage] > 0 && (
                  <span style={{ fontSize: '0.6875rem', color: '#2e7d32', fontWeight: 600 }}>
                    {formatCurrency(stageValues[stage])}
                  </span>
                )}
              </div>
            </div>
            <div className="pipeline-column-body">
              {groupedLeads[stage].length === 0 ? (
                <div className="pipeline-empty">No leads</div>
              ) : (
                groupedLeads[stage].map(lead => {
                  const prevStage = getAdjacentStage(lead.stage || 'New Lead', -1);
                  const nextStage = getAdjacentStage(lead.stage || 'New Lead', 1);
                  return (
                    <div key={lead.id} className="pipeline-card">
                      <Link to={`/leads/${lead.id}`} className="pipeline-card-link">
                        <div className="pipeline-card-name">{lead.dispensary_name}</div>
                        {lead.manager_name && (
                          <div className="pipeline-card-contact">{lead.manager_name}</div>
                        )}
                        <div className="pipeline-card-meta">
                          {lead.deal_value && (
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#2e7d32' }}>
                              {formatCurrency(lead.deal_value)}
                            </span>
                          )}
                          {lead.days_since_last_contact !== null && lead.days_since_last_contact !== undefined ? (
                            <span style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '0.125rem 0.5rem',
                              borderRadius: '50px',
                              background: lead.days_since_last_contact <= 7 ? '#d1e7dd'
                                : lead.days_since_last_contact <= 14 ? '#fff3e0' : '#f8d7da',
                              color: lead.days_since_last_contact <= 7 ? '#198754'
                                : lead.days_since_last_contact <= 14 ? '#e65100' : '#dc3545'
                            }}>
                              {lead.days_since_last_contact}d
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '0.125rem 0.5rem',
                              borderRadius: '50px',
                              background: '#e9ecef',
                              color: '#6c757d'
                            }}>
                              New
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="pipeline-card-actions">
                        <button
                          className="pipeline-arrow-btn"
                          disabled={!prevStage}
                          onClick={() => prevStage && handleStageChange(lead.id, prevStage)}
                          title={prevStage ? `Move to ${prevStage}` : ''}
                        >
                          <FaChevronLeft />
                        </button>
                        <button
                          className="pipeline-arrow-btn"
                          disabled={!nextStage}
                          onClick={() => nextStage && handleStageChange(lead.id, nextStage)}
                          title={nextStage ? `Move to ${nextStage}` : ''}
                        >
                          <FaChevronRight />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Pipeline;
