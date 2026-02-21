import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaPhoneAlt,
  FaClock,
  FaArrowRight,
  FaTasks,
  FaExclamationTriangle,
  FaExchangeAlt,
  FaRegClock,
  FaEnvelope,
  FaChartLine,
  FaArrowUp,
  FaArrowDown,
  FaCalendarCheck,
  FaTimes
} from 'react-icons/fa';
import { leadsApi, tasksApi, emailApi } from '../services/api';
import { STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';
import QuickLogModal from '../components/QuickLogModal';
import ClickToCall from '../components/ClickToCall';

function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOverdue, setShowOverdue] = useState(true);
  const [quickLog, setQuickLog] = useState(null);
  const [scheduledEmails, setScheduledEmails] = useState([]);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];

  const fetchBriefing = useCallback(async () => {
    try {
      setLoading(true);
      const [briefRes, schedRes] = await Promise.all([
        leadsApi.getBriefing(),
        emailApi.getScheduled().catch(() => ({ data: [] }))
      ]);
      setBriefing(briefRes.data);
      setScheduledEmails(schedRes.data);
    } catch (error) {
      console.error('Error fetching briefing:', error);
      toast.error('Failed to load briefing');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCancelScheduled = async (id) => {
    try {
      await emailApi.cancelScheduled(id);
      toast.success('Scheduled email cancelled');
      setScheduledEmails(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('Error cancelling scheduled email:', error);
      toast.error('Failed to cancel scheduled email');
    }
  };

  const getTrend = (thisWeek, lastWeek) => {
    if (thisWeek > lastWeek) return { icon: FaArrowUp, color: '#198754', label: 'up' };
    if (thisWeek < lastWeek) return { icon: FaArrowDown, color: '#dc3545', label: 'down' };
    return { icon: FaArrowRight, color: '#6c757d', label: 'same' };
  };

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const handleToggleTask = async (taskId) => {
    try {
      await tasksApi.toggleComplete(taskId);
      fetchBriefing();
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error('Failed to update task');
    }
  };

  const formatTimeRange = (from, to) => {
    if (!from && !to) return '';
    if (from && to) return `${from} - ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return '';
  };

  const parseStageChange = (notes) => {
    const match = notes?.match(/Stage changed from "(.+?)" to "(.+?)"/);
    if (match) return { from: match[1], to: match[2] };
    return null;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const recurringCallbacks = (briefing?.todayCallbacks || []).filter(l => !l.callback_date);
  const allTasks = [
    ...(briefing?.overdueTasks || []).map(t => ({ ...t, _isOverdue: true })),
    ...(briefing?.todayTasks || [])
  ];
  const visibleTasks = showOverdue ? allTasks : (briefing?.todayTasks || []);
  const overdueCount = (briefing?.overdueTasks || []).length;
  const todayCount = (briefing?.todayTasks || []).length;

  const callsTrend = briefing ? getTrend(briefing.callsThisWeek, briefing.callsLastWeek) : null;
  const emailsTrend = briefing ? getTrend(briefing.emailsThisWeek, briefing.emailsLastWeek) : null;
  const dealsTrend = briefing ? getTrend(briefing.dealsMovedThisWeek, briefing.dealsMovedLastWeek) : null;

  return (
    <div className="dashboard">
      {/* Your Activity */}
      {briefing && (
        <div className="callbacks-section">
          <h2><FaChartLine /> Your Activity This Week</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '0.5rem 0' }}>
            {[
              { label: 'Calls', count: briefing.callsThisWeek, last: briefing.callsLastWeek, trend: callsTrend, icon: FaPhoneAlt },
              { label: 'Emails', count: briefing.emailsThisWeek, last: briefing.emailsLastWeek, trend: emailsTrend, icon: FaEnvelope },
              { label: 'Deals Moved', count: briefing.dealsMovedThisWeek, last: briefing.dealsMovedLastWeek, trend: dealsTrend, icon: FaExchangeAlt },
            ].map((stat) => {
              const TrendIcon = stat.trend?.icon || FaArrowRight;
              return (
                <div key={stat.label} style={{
                  background: '#f8f9fa',
                  borderRadius: '10px',
                  padding: '1rem',
                  textAlign: 'center',
                  border: '1px solid #e9ecef'
                }}>
                  <stat.icon style={{ color: '#2d5a27', marginBottom: '0.25rem' }} />
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#212529' }}>
                    {stat.count}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#6c757d', marginBottom: '0.25rem' }}>
                    {stat.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: stat.trend?.color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <TrendIcon size={10} />
                    {stat.last} last week
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scheduled Emails */}
      {scheduledEmails.length > 0 && (
        <div className="callbacks-section">
          <h2><FaCalendarCheck /> Scheduled Emails ({scheduledEmails.length})</h2>
          <div className="callback-list">
            {scheduledEmails.map((se) => (
              <div key={se.id} className="callback-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0 }}>{se.dispensary_name || `Lead #${se.lead_id}`}</h4>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#6c757d' }}>
                    {se.template_name || 'Template'} — {se.scheduled_for ? format(new Date(se.scheduled_for), 'MMM d, h:mm a') : 'Pending'}
                  </p>
                </div>
                {se.status === 'pending' && (
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ color: '#dc3545', borderColor: '#dc3545', marginLeft: '0.5rem' }}
                    onClick={() => handleCancelScheduled(se.id)}
                    title="Cancel"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Callbacks */}
      <div className="callbacks-section">
        <h2>
          <FaPhoneAlt />
          {todayDay}'s Callbacks ({recurringCallbacks.length})
        </h2>
        {recurringCallbacks.length > 0 ? (
          <div className="callback-list">
            {recurringCallbacks.map((lead) => (
              <div key={lead.id} className="callback-item" style={{ display: 'flex', alignItems: 'center' }}>
                <Link
                  to={`/leads/${lead.id}`}
                  style={{ flex: 1, textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div className="callback-info">
                    <h4>{lead.dispensary_name}</h4>
                    {lead.manager_name && <p>{lead.manager_name}</p>}
                    {lead.contact_number && (
                      <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                        <ClickToCall phone={lead.contact_number} leadId={lead.id} dispensaryName={lead.dispensary_name}>
                          <FaPhoneAlt size={10} /> {lead.contact_number}
                        </ClickToCall>
                      </p>
                    )}
                  </div>
                  <div className="callback-time">
                    <FaClock />
                    {formatTimeRange(lead.callback_time_from, lead.callback_time_to) || 'Any time'}
                  </div>
                </Link>
                <button
                  className="btn btn-sm btn-outline btn-icon"
                  title="Quick Log"
                  onClick={() => setQuickLog({ leadId: lead.id, name: lead.dispensary_name })}
                  style={{ marginLeft: '0.5rem', color: '#2d5a27' }}
                >
                  <FaPhoneAlt />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-callbacks">No callbacks scheduled for {todayDay}</p>
        )}
      </div>

      {/* Tasks (Overdue + Today) */}
      {allTasks.length > 0 && (
        <div className="callbacks-section">
          <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span><FaTasks /> Tasks ({allTasks.length})</span>
            {overdueCount > 0 && todayCount > 0 && (
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.75rem' }}
                onClick={() => setShowOverdue(!showOverdue)}
              >
                {showOverdue ? `Hide Overdue (${overdueCount})` : `Show Overdue (${overdueCount})`}
              </button>
            )}
          </h2>
          <div className="task-list">
            {visibleTasks.map(task => (
              <div
                key={task.id}
                className="task-item"
                style={{ borderLeftColor: task._isOverdue ? '#dc3545' : '#f5a623' }}
              >
                <input
                  type="checkbox"
                  className="task-checkbox"
                  checked={false}
                  onChange={() => handleToggleTask(task.id)}
                />
                <div className="task-content">
                  <span className="task-title">{task.title}</span>
                  <div className="task-meta">
                    <Link to={`/leads/${task.lead_id}`} style={{ color: '#2d5a27', textDecoration: 'none', fontSize: '0.8125rem' }}>
                      {task.dispensary_name}
                    </Link>
                    <span style={{ color: task._isOverdue ? '#dc3545' : '#6c757d', fontSize: '0.8125rem' }}>
                      {task._isOverdue && <FaExclamationTriangle size={10} style={{ marginRight: '0.25rem' }} />}
                      {task.due_date ? format(new Date(task.due_date.split('T')[0] + 'T00:00:00'), 'MMM d') : ''}
                      {task.due_time ? ` at ${task.due_time}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/tasks" className="btn btn-outline">
              View All Tasks <FaArrowRight />
            </Link>
          </div>
        </div>
      )}

      {/* Stale Leads */}
      {(briefing?.staleLeads || []).length > 0 && (
        <div className="callbacks-section">
          <h2>
            <FaRegClock />
            Stale Leads ({briefing.staleLeads.length})
          </h2>
          <div className="callback-list">
            {briefing.staleLeads.map((lead) => (
              <div key={lead.id} className="callback-item" style={{ display: 'flex', alignItems: 'center' }}>
                <Link
                  to={`/leads/${lead.id}`}
                  style={{ flex: 1, textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div className="callback-info">
                    <h4>{lead.dispensary_name}</h4>
                    <span
                      className="stage-badge"
                      style={{
                        background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
                        color: STAGE_COLORS[lead.stage || 'New Lead'],
                        fontSize: '0.7rem'
                      }}
                    >
                      {lead.stage || 'New Lead'}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                    <span style={{ color: '#dc3545', fontWeight: 600 }}>
                      {lead.days_inactive}d inactive
                    </span>
                    {lead.deal_value > 0 && (
                      <div style={{ color: '#2e7d32', fontWeight: 600, fontSize: '0.8rem' }}>
                        ${Number(lead.deal_value).toLocaleString()}/mo
                      </div>
                    )}
                  </div>
                </Link>
                <button
                  className="btn btn-sm btn-outline btn-icon"
                  title="Quick Log"
                  onClick={() => setQuickLog({ leadId: lead.id, name: lead.dispensary_name })}
                  style={{ marginLeft: '0.5rem', color: '#2d5a27' }}
                >
                  <FaPhoneAlt />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Pipeline Moves */}
      {(briefing?.recentMoves || []).length > 0 && (
        <div className="callbacks-section">
          <h2>
            <FaExchangeAlt />
            Recent Pipeline Moves
          </h2>
          <div className="callback-list">
            {briefing.recentMoves.map((move) => {
              const change = parseStageChange(move.notes);
              return (
                <Link
                  to={`/leads/${move.lead_id}`}
                  key={move.id}
                  className="callback-item"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="callback-info">
                    <h4>{move.dispensary_name}</h4>
                    {change && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                        <span
                          className="stage-badge"
                          style={{
                            background: STAGE_BG_COLORS[change.from] || '#e9ecef',
                            color: STAGE_COLORS[change.from] || '#6c757d',
                            fontSize: '0.7rem'
                          }}
                        >
                          {change.from}
                        </span>
                        <FaArrowRight size={10} style={{ margin: '0 0.4rem', color: '#6c757d' }} />
                        <span
                          className="stage-badge"
                          style={{
                            background: STAGE_BG_COLORS[change.to] || '#e9ecef',
                            color: STAGE_COLORS[change.to] || '#6c757d',
                            fontSize: '0.7rem'
                          }}
                        >
                          {change.to}
                        </span>
                      </p>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6c757d', whiteSpace: 'nowrap' }}>
                    {move.contact_date ? format(new Date(move.contact_date), 'MMM d, h:mm a') : ''}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Log Modal */}
      {quickLog && (
        <QuickLogModal
          leadId={quickLog.leadId}
          dispensaryName={quickLog.name}
          onClose={() => setQuickLog(null)}
          onSaved={() => { setQuickLog(null); fetchBriefing(); }}
        />
      )}
    </div>
  );
}

export default Dashboard;
