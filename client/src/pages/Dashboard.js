import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaPhoneAlt,
  FaClock,
  FaArrowRight,
  FaExchangeAlt,
  FaRegClock,
  FaEnvelope,
  FaChartLine,
  FaArrowUp,
  FaArrowDown,
  FaCalendarCheck,
  FaTimes
} from 'react-icons/fa';
import { leadsApi, emailApi } from '../services/api';
import { STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';
import QuickLogModal from '../components/QuickLogModal';
import ClickToCall from '../components/ClickToCall';

function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickLog, setQuickLog] = useState(null);
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [activityRange, setActivityRange] = useState('week');
  const [selectedCard, setSelectedCard] = useState(null);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];

  const fetchBriefing = useCallback(async () => {
    try {
      setLoading(true);
      const [briefRes, schedRes] = await Promise.all([
        leadsApi.getBriefing(activityRange),
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
  }, [activityRange]);

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

  const callsTrend = briefing ? getTrend(briefing.callsThisWeek, briefing.callsLastWeek) : null;
  const emailsTrend = briefing ? getTrend(briefing.emailsThisWeek, briefing.emailsLastWeek) : null;
  const dealsTrend = briefing ? getTrend(briefing.dealsMovedThisWeek, briefing.dealsMovedLastWeek) : null;

  return (
    <div className="dashboard">
      {/* Your Activity */}
      {briefing && (
        <div className="callbacks-section">
          <h2><FaChartLine /> Your Activity {activityRange === 'day' ? 'Today' : activityRange === 'month' ? 'This Month' : 'This Week'}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[
              { key: 'day', label: 'Day' },
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
            ].map((opt) => (
              <button
                key={opt.key}
                className="btn btn-sm"
                style={{
                  background: activityRange === opt.key ? '#2d5a27' : '#f8f9fa',
                  color: activityRange === opt.key ? '#fff' : '#495057',
                  border: activityRange === opt.key ? '1px solid #2d5a27' : '1px solid #dee2e6',
                  borderRadius: '6px',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => { setActivityRange(opt.key); setSelectedCard(null); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '0.5rem 0' }}>
            {[
              { key: 'calls', label: 'Calls', count: briefing.callsThisWeek, last: briefing.callsLastWeek, trend: callsTrend, icon: FaPhoneAlt },
              { key: 'emails', label: 'Emails', count: briefing.emailsThisWeek, last: briefing.emailsLastWeek, trend: emailsTrend, icon: FaEnvelope },
              { key: 'deals', label: 'Deals Moved', count: briefing.dealsMovedThisWeek, last: briefing.dealsMovedLastWeek, trend: dealsTrend, icon: FaExchangeAlt },
            ].map((stat) => {
              const TrendIcon = stat.trend?.icon || FaArrowRight;
              const isSelected = selectedCard === stat.key;
              const lastLabel = activityRange === 'day' ? 'yesterday' : activityRange === 'month' ? 'last month' : 'last week';
              return (
                <div
                  key={stat.key}
                  onClick={() => setSelectedCard(isSelected ? null : stat.key)}
                  style={{
                    background: isSelected ? '#eaf5e9' : '#f8f9fa',
                    borderRadius: '10px',
                    padding: '1rem',
                    textAlign: 'center',
                    border: isSelected ? '2px solid #2d5a27' : '1px solid #e9ecef',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 2px 8px rgba(45,90,39,0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <stat.icon style={{ color: '#2d5a27', marginBottom: '0.25rem' }} />
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#212529' }}>
                    {stat.count}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#6c757d', marginBottom: '0.25rem' }}>
                    {stat.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: stat.trend?.color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <TrendIcon size={10} />
                    {stat.last} {lastLabel}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Expandable lead list for selected activity card */}
          {selectedCard && (() => {
            const leadMap = { calls: briefing.callLeads, emails: briefing.emailLeads, deals: briefing.dealLeads };
            const titleMap = { calls: 'Leads Called', emails: 'Leads Emailed', deals: 'Leads with Stage Changes' };
            const leads = leadMap[selectedCard] || [];
            return (
              <div style={{ marginTop: '0.75rem', background: '#fff', border: '1px solid #e9ecef', borderRadius: '10px', padding: '0.75rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#495057' }}>
                  {titleMap[selectedCard]} ({leads.length})
                </h4>
                {leads.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6c757d' }}>No leads found for this period.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {leads.map((lead) => (
                      <Link
                        key={lead.id}
                        to={`/leads/${lead.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textDecoration: 'none',
                          color: 'inherit',
                          padding: '0.5rem 0.75rem',
                          background: '#f8f9fa',
                          borderRadius: '8px',
                          border: '1px solid #e9ecef',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, color: '#212529', fontSize: '0.875rem' }}>{lead.dispensary_name}</span>
                          <span
                            className="stage-badge"
                            style={{
                              background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
                              color: STAGE_COLORS[lead.stage || 'New Lead'],
                              fontSize: '0.65rem',
                              marginLeft: '0.5rem',
                            }}
                          >
                            {lead.stage || 'New Lead'}
                          </span>
                          {lead.manager_name && (
                            <span style={{ fontSize: '0.8rem', color: '#6c757d', marginLeft: '0.5rem' }}>{lead.manager_name}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {lead.deal_value > 0 && (
                            <span style={{ color: '#2e7d32', fontWeight: 600, fontSize: '0.8rem' }}>
                              ${Number(lead.deal_value).toLocaleString()}/mo
                            </span>
                          )}
                          <FaArrowRight size={10} style={{ color: '#adb5bd' }} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
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
