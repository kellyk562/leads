import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  FaTimes,
  FaPlay,
  FaPause,
  FaBackward,
  FaForward,
  FaChevronDown,
  FaChevronUp,
  FaRobot
} from 'react-icons/fa';
import { leadsApi, emailApi, callsApi } from '../services/api';
import { STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';
import QuickLogModal from '../components/QuickLogModal';
import ClickToCall from '../components/ClickToCall';

// Outcome badge config
const OUTCOME_BADGES = {
  voicemail: { label: 'Voicemail', bg: '#fef3c7', color: '#92400e' },
  no_answer: { label: 'No Answer', bg: '#fff3e0', color: '#e65100' },
  busy: { label: 'Busy', bg: '#fff3e0', color: '#e65100' },
  ivr: { label: 'IVR', bg: '#fee2e2', color: '#991b1b' },
  completed: { label: 'Completed', bg: '#d1e7dd', color: '#198754' },
  demo_booked: { label: 'Demo Booked', bg: '#e8d5f5', color: '#6b21a8' },
  intro_email: { label: 'Intro Email Sent', bg: '#dbeafe', color: '#1e40af' },
  failed: { label: 'Failed', bg: '#f8d7da', color: '#dc3545' },
};

function getCallOutcomeBadges(lead) {
  const badges = [];
  const status = lead.log_status || lead.call_status;
  if (status === 'voicemail') badges.push('voicemail');
  else if (status === 'no_answer') badges.push('no_answer');
  else if (status === 'busy') badges.push('busy');
  else if (status === 'failed') badges.push('failed');
  else if (status === 'completed') badges.push('completed');
  if (lead.has_ivr) badges.push('ivr');
  if (lead.stage === 'Demo Scheduled') badges.push('demo_booked');
  return badges;
}

function getEmailOutcomeBadges(lead) {
  const badges = [];
  const outcome = (lead.email_outcome || '').toLowerCase();
  if (outcome.includes('intro')) badges.push('intro_email');
  return badges;
}

// Audio player with 15s skip controls
function CallPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const skip = (seconds) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + seconds));
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', background: '#f8f9fa', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />
      <button onClick={() => skip(-15)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#495057', padding: '0.25rem', fontSize: '0.75rem' }} title="Back 15s">
        <FaBackward size={12} />
      </button>
      <button onClick={toggle} style={{ background: '#2d5a27', border: 'none', cursor: 'pointer', color: 'white', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {playing ? <FaPause size={10} /> : <FaPlay size={10} style={{ marginLeft: '2px' }} />}
      </button>
      <button onClick={() => skip(15)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#495057', padding: '0.25rem', fontSize: '0.75rem' }} title="Forward 15s">
        <FaForward size={12} />
      </button>
      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          if (audioRef.current) audioRef.current.currentTime = pct * (audioRef.current.duration || 0);
        }}
        style={{ flex: 1, height: '6px', background: '#dee2e6', borderRadius: '3px', cursor: 'pointer', position: 'relative' }}
      >
        <div style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, height: '100%', background: '#2d5a27', borderRadius: '3px', transition: 'width 0.1s' }} />
      </div>
      <span style={{ fontSize: '0.6875rem', color: '#6c757d', whiteSpace: 'nowrap', minWidth: '70px', textAlign: 'right' }}>
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  );
}

function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickLog, setQuickLog] = useState(null);
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [activityRange, setActivityRange] = useState('day');
  const [selectedCard, setSelectedCard] = useState(null);
  const [expandedLeadId, setExpandedLeadId] = useState(null);
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editOriginal, setEditOriginal] = useState({});
  const [saving, setSaving] = useState(false);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];

  const fetchBriefing = useCallback(async () => {
    try {
      setLoading(true);
      const [briefRes, schedRes, callSchedRes] = await Promise.all([
        leadsApi.getBriefing(activityRange),
        emailApi.getScheduled().catch(() => ({ data: [] })),
        callsApi.getSchedules().catch(() => ({ data: [] }))
      ]);
      setBriefing(briefRes.data);
      setScheduledEmails(schedRes.data);
      setScheduledCalls((callSchedRes.data || []).filter(s => s.status === 'pending'));
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

  const handleCancelScheduledCall = async (id) => {
    try {
      await callsApi.cancelSchedule(id);
      toast.success('Scheduled call cancelled');
      setScheduledCalls(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error cancelling scheduled call:', error);
      toast.error('Failed to cancel scheduled call');
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

  const startEditing = (lead) => {
    const fields = {
      manager_name: lead.manager_name || '',
      contact_email: lead.contact_email || '',
      dispensary_number: lead.dispensary_number || '',
      contact_number: lead.contact_number || '',
      current_pos_system: lead.current_pos_system || '',
      notes: lead.notes || '',
    };
    setEditingLeadId(lead.id);
    setEditForm(fields);
    setEditOriginal(fields);
  };

  const cancelEditing = () => {
    setEditingLeadId(null);
    setEditForm({});
    setEditOriginal({});
  };

  const hasEdits = editingLeadId && Object.keys(editForm).some(k => editForm[k] !== editOriginal[k]);

  const saveEdits = async (leadId) => {
    const changed = {};
    for (const k of Object.keys(editForm)) {
      if (editForm[k] !== editOriginal[k]) changed[k] = editForm[k];
    }
    if (Object.keys(changed).length === 0) return;
    try {
      setSaving(true);
      await leadsApi.patchLead(leadId, changed);
      // Update local briefing state
      setBriefing(prev => ({
        ...prev,
        callLeads: prev.callLeads.map(l => l.id === leadId ? { ...l, ...changed } : l),
      }));
      toast.success('Lead updated');
      setEditingLeadId(null);
      setEditForm({});
      setEditOriginal({});
    } catch (err) {
      console.error('Error saving lead:', err);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
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

  // Render outcome badges for a lead
  const renderBadges = (badgeKeys) => {
    if (!badgeKeys || badgeKeys.length === 0) return null;
    return (
      <span style={{ display: 'inline-flex', gap: '0.25rem', marginLeft: '0.5rem', flexWrap: 'wrap' }}>
        {badgeKeys.map(key => {
          const badge = OUTCOME_BADGES[key];
          if (!badge) return null;
          return (
            <span key={key} style={{
              fontSize: '0.625rem', fontWeight: 700, padding: '0.125rem 0.5rem',
              borderRadius: '50px', background: badge.bg, color: badge.color, whiteSpace: 'nowrap'
            }}>
              {badge.label}
            </span>
          );
        })}
      </span>
    );
  };

  // Render expandable lead row for calls
  const renderCallLead = (lead) => {
    const isExpanded = expandedLeadId === lead.id;
    const badges = getCallOutcomeBadges(lead);
    const summary = lead.log_summary || lead.call_summary;
    const dur = lead.log_duration;

    return (
      <div key={lead.id} style={{ background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', overflow: 'hidden' }}>
        <div
          onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.5rem 0.75rem', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <Link to={`/leads/${lead.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, color: '#212529', fontSize: '0.875rem', textDecoration: 'none' }}>
              {lead.dispensary_name}
            </Link>
            <span className="stage-badge" style={{
              background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
              color: STAGE_COLORS[lead.stage || 'New Lead'],
              fontSize: '0.6rem',
            }}>
              {lead.stage || 'New Lead'}
            </span>
            {renderBadges(badges)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {lead.deal_value > 0 && (
              <span style={{ color: '#2e7d32', fontWeight: 600, fontSize: '0.8rem' }}>
                ${Number(lead.deal_value).toLocaleString()}/mo
              </span>
            )}
            {(summary || lead.recording_url) ? (
              isExpanded ? <FaChevronUp size={10} style={{ color: '#adb5bd' }} /> : <FaChevronDown size={10} style={{ color: '#adb5bd' }} />
            ) : (
              <FaArrowRight size={10} style={{ color: '#adb5bd' }} />
            )}
          </div>
        </div>
        {isExpanded && (
          <div style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid #e9ecef' }}>
            {/* Call info bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {lead.log_ended_at && (
                <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                  Called {format(new Date(lead.log_ended_at), 'MMM d')} at {format(new Date(lead.log_ended_at), 'h:mm a')}
                </span>
              )}
              {dur != null && (
                <span style={{
                  fontSize: '0.625rem', fontWeight: 700, padding: '0.125rem 0.5rem',
                  borderRadius: '50px', background: '#e9ecef', color: '#495057'
                }}>
                  {Math.round(dur)}s
                </span>
              )}
              {summary && (
                <span style={{ fontSize: '0.75rem', color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {summary.split(/[.!?]/)[0]?.substring(0, 120)}
                </span>
              )}
            </div>

            {/* Editable fields */}
            {(() => {
              const isEditing = editingLeadId === lead.id;
              const fields = [
                { key: 'manager_name', label: 'Contact Name' },
                { key: 'contact_email', label: 'Email' },
                { key: 'dispensary_number', label: 'Dispensary Phone' },
                { key: 'contact_number', label: 'Direct Phone' },
                { key: 'current_pos_system', label: 'Current POS' },
              ];
              const inputStyle = {
                width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.8125rem',
                border: '1px solid #dee2e6', borderRadius: '4px', background: '#fff',
              };
              const labelStyle = { fontSize: '0.6875rem', color: '#6c757d', marginBottom: '0.125rem' };

              return (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {fields.map(f => (
                      <div key={f.key}>
                        <div style={labelStyle}>{f.label}</div>
                        {isEditing ? (
                          <input
                            style={inputStyle}
                            value={editForm[f.key] || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          />
                        ) : (
                          <div
                            style={{ fontSize: '0.8125rem', color: lead[f.key] ? '#212529' : '#adb5bd', padding: '0.3rem 0', cursor: 'pointer', minHeight: '1.5rem' }}
                            onClick={() => startEditing(lead)}
                          >
                            {lead[f.key] || '---'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Notes — full width */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={labelStyle}>Notes</div>
                    {isEditing ? (
                      <textarea
                        style={{ ...inputStyle, minHeight: '3rem', resize: 'vertical' }}
                        value={editForm.notes || ''}
                        onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      />
                    ) : (
                      <div
                        style={{ fontSize: '0.8125rem', color: lead.notes ? '#212529' : '#adb5bd', padding: '0.3rem 0', cursor: 'pointer', whiteSpace: 'pre-wrap', minHeight: '1.5rem' }}
                        onClick={() => startEditing(lead)}
                      >
                        {lead.notes || '---'}
                      </div>
                    )}
                  </div>
                  {/* Save / Cancel */}
                  {isEditing && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {hasEdits && (
                        <button
                          onClick={() => saveEdits(lead.id)}
                          disabled={saving}
                          style={{
                            padding: '0.3rem 1rem', fontSize: '0.8125rem', fontWeight: 600,
                            background: '#2d5a27', color: '#fff', border: 'none', borderRadius: '6px',
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                          }}
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      )}
                      <button
                        onClick={cancelEditing}
                        style={{
                          padding: '0.3rem 1rem', fontSize: '0.8125rem',
                          background: '#f8f9fa', color: '#495057', border: '1px solid #dee2e6',
                          borderRadius: '6px', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Audio player */}
            {lead.recording_url && <CallPlayer src={lead.recording_url} />}
            {!summary && !lead.recording_url && (
              <p style={{ fontSize: '0.8125rem', color: '#6c757d', margin: '0.5rem 0 0', fontStyle: 'italic' }}>
                No recording or summary available.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render lead row for emails
  const renderEmailLead = (lead) => {
    const badges = getEmailOutcomeBadges(lead);
    return (
      <Link
        key={lead.id}
        to={`/leads/${lead.id}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          textDecoration: 'none', color: 'inherit',
          padding: '0.5rem 0.75rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
          <span style={{ fontWeight: 600, color: '#212529', fontSize: '0.875rem' }}>{lead.dispensary_name}</span>
          <span className="stage-badge" style={{
            background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
            color: STAGE_COLORS[lead.stage || 'New Lead'],
            fontSize: '0.6rem',
          }}>
            {lead.stage || 'New Lead'}
          </span>
          {renderBadges(badges)}
          {lead.email_subject && (
            <span style={{ fontSize: '0.75rem', color: '#6c757d', marginLeft: '0.25rem' }}>{lead.email_subject}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {lead.deal_value > 0 && (
            <span style={{ color: '#2e7d32', fontWeight: 600, fontSize: '0.8rem' }}>
              ${Number(lead.deal_value).toLocaleString()}/mo
            </span>
          )}
          <FaArrowRight size={10} style={{ color: '#adb5bd' }} />
        </div>
      </Link>
    );
  };

  // Render lead row for deals (same as before)
  const renderDealLead = (lead) => (
    <Link
      key={lead.id}
      to={`/leads/${lead.id}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        textDecoration: 'none', color: 'inherit',
        padding: '0.5rem 0.75rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef',
      }}
    >
      <div>
        <span style={{ fontWeight: 600, color: '#212529', fontSize: '0.875rem' }}>{lead.dispensary_name}</span>
        <span className="stage-badge" style={{
          background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
          color: STAGE_COLORS[lead.stage || 'New Lead'],
          fontSize: '0.65rem', marginLeft: '0.5rem',
        }}>
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
  );

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
                onClick={() => { setActivityRange(opt.key); setSelectedCard(null); setExpandedLeadId(null); }}
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
                  onClick={() => { setSelectedCard(isSelected ? null : stat.key); setExpandedLeadId(null); }}
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
            const rendererMap = { calls: renderCallLead, emails: renderEmailLead, deals: renderDealLead };
            const leads = leadMap[selectedCard] || [];
            const renderLead = rendererMap[selectedCard];
            return (
              <div style={{ marginTop: '0.75rem', background: '#fff', border: '1px solid #e9ecef', borderRadius: '10px', padding: '0.75rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#495057' }}>
                  {titleMap[selectedCard]} ({leads.length})
                </h4>
                {leads.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6c757d' }}>No leads found for this period.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {leads.map(renderLead)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Scheduled AI Calls */}
      {scheduledCalls.length > 0 && (
        <div className="callbacks-section">
          <h2><FaRobot /> Scheduled AI Calls ({scheduledCalls.length})</h2>
          <div className="callback-list">
            {scheduledCalls.map((sc) => {
              const leads = sc.leads_info || [];
              return (
                <div key={sc.id} className="callback-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                      {sc.list_name && <span style={{ marginRight: '0.25rem' }}>{sc.list_name} —</span>}
                      {leads.length > 0 ? leads.map((l, i) => (
                        <span key={l.id}>
                          <Link to={`/leads/${l.id}`} style={{ color: '#2d5a27', textDecoration: 'none', fontWeight: 600 }}>
                            {l.dispensary_name}
                          </Link>
                          {i < leads.length - 1 && <span style={{ color: '#6c757d' }}>, </span>}
                        </span>
                      )) : (
                        <span style={{ color: '#6c757d' }}>No leads</span>
                      )}
                    </h4>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#6c757d' }}>
                      {sc.scheduled_for ? format(new Date(sc.scheduled_for), 'MMM d, h:mm a') : 'Pending'}
                      {sc.delay_seconds ? ` · ${sc.delay_seconds}s delay` : ''}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ color: '#dc3545', borderColor: '#dc3545', marginLeft: '0.5rem' }}
                    onClick={() => handleCancelScheduledCall(sc.id)}
                    title="Cancel"
                  >
                    <FaTimes />
                  </button>
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
                  <h4 style={{ margin: 0 }}>
                    <Link to={`/leads/${se.lead_id}`} style={{ color: '#2d5a27', textDecoration: 'none' }}>
                      {se.dispensary_name || `Lead #${se.lead_id}`}
                    </Link>
                  </h4>
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
