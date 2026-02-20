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
              <span
                className="pipeline-column-count"
                style={{ background: STAGE_BG_COLORS[stage], color: STAGE_COLORS[stage] }}
              >
                {groupedLeads[stage].length}
              </span>
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
                        {lead.contact_name && (
                          <div className="pipeline-card-contact">{lead.contact_name}</div>
                        )}
                        <div className="pipeline-card-meta">
                          {lead.priority && (
                            <span className={`priority-badge priority-${lead.priority.toLowerCase()}`}>
                              {lead.priority}
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
