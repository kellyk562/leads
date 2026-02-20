import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FaPhoneAlt,
  FaCalendarAlt,
  FaClock,
  FaArrowRight,
  FaUserPlus
} from 'react-icons/fa';
import { leadsApi } from '../services/api';
import { STAGES, STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';

function Dashboard() {
  const [todayCallbacks, setTodayCallbacks] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [todayRes, leadsRes, statsRes] = await Promise.all([
        leadsApi.getTodayCallbacks(),
        leadsApi.getAll({ status: '', sort: 'created_at', order: 'DESC' }),
        leadsApi.getStats()
      ]);
      setTodayCallbacks(todayRes.data);
      setAllLeads(leadsRes.data.slice(0, 5)); // Get 5 most recent leads
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCallbackDays = (callbackDays) => {
    if (!callbackDays) return 'Not set';
    try {
      const daysArray = typeof callbackDays === 'string' ? JSON.parse(callbackDays) : callbackDays;
      if (!Array.isArray(daysArray) || daysArray.length === 0) return 'Not set';
      if (daysArray.length === 7) return 'Every day';
      return daysArray.map(d => d.slice(0, 3)).join(', ');
    } catch {
      return 'Not set';
    }
  };

  const formatTimeRange = (from, to) => {
    if (!from && !to) return '';
    if (from && to) return `${from} - ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return '';
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return '#7b1fa2';
      case 'Medium': return '#e65100';
      case 'Low': return '#2e7d32';
      default: return '#e65100';
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
    <div className="dashboard">
      {/* Today's Callbacks Section */}
      <div className="callbacks-section">
        <h2>
          <FaPhoneAlt />
          {todayDay}'s Callbacks ({todayCallbacks.filter(lead => (lead.priority === 'Medium' || lead.priority === 'High') && !lead.callback_date).length})
        </h2>
        {todayCallbacks.filter(lead => (lead.priority === 'Medium' || lead.priority === 'High') && !lead.callback_date).length > 0 ? (
          <div className="callback-list">
            {todayCallbacks.filter(lead => (lead.priority === 'Medium' || lead.priority === 'High') && !lead.callback_date).map((lead) => (
              <Link
                to={`/leads/${lead.id}`}
                key={lead.id}
                className="callback-item"
                style={{ textDecoration: 'none', color: 'inherit', borderLeftColor: getPriorityColor(lead.priority) }}
              >
                <div className="callback-info">
                  <h4>{lead.dispensary_name}</h4>
                  {lead.manager_name && <p>{lead.manager_name}</p>}
                  <p style={{ color: '#6c757d', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                    {lead.address || 'No location'}
                  </p>
                </div>
                <div className="callback-time">
                  <FaClock />
                  {formatTimeRange(lead.callback_time_from, lead.callback_time_to) || 'Any time'}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="no-callbacks">No callbacks scheduled for {todayDay}</p>
        )}
      </div>

      {/* Recent Leads Section */}
      {allLeads.length > 0 && (
        <div className="callbacks-section">
          <h2>
            <FaCalendarAlt />
            Recent Leads
          </h2>
          <div className="callback-list">
            {allLeads.map((lead) => (
              <Link
                to={`/leads/${lead.id}`}
                key={lead.id}
                className="callback-item"
                style={{ textDecoration: 'none', color: 'inherit', borderLeftColor: getPriorityColor(lead.priority) }}
              >
                <div className="callback-info">
                  <h4>{lead.dispensary_name}</h4>
                  {lead.contact_name && <p>{lead.contact_name}</p>}
                  <p style={{ color: '#6c757d', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                    {lead.address || 'No location'}
                  </p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#6c757d' }}>
                  {formatCallbackDays(lead.callback_days)}
                </div>
              </Link>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/leads" className="btn btn-outline">
              View All Leads <FaArrowRight />
            </Link>
          </div>
        </div>
      )}

      {/* Pipeline Summary */}
      {stats?.stageCounts && (
        <div className="callbacks-section">
          <h2>
            <FaArrowRight />
            Pipeline Summary
          </h2>
          <div className="pipeline-summary">
            {STAGES.map(stage => (
              <div
                key={stage}
                className="pipeline-summary-card"
                style={{
                  borderTopColor: STAGE_COLORS[stage],
                  background: STAGE_BG_COLORS[stage],
                }}
              >
                <div className="pipeline-summary-count" style={{ color: STAGE_COLORS[stage] }}>
                  {stats.stageCounts[stage] || 0}
                </div>
                <div className="pipeline-summary-label" style={{ color: STAGE_COLORS[stage] }}>
                  {stage}
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/pipeline" className="btn btn-outline">
              View Pipeline <FaArrowRight />
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="callbacks-section">
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link to="/leads/new" className="btn btn-primary">
            <FaUserPlus /> Add New Lead
          </Link>
          <Link to="/leads" className="btn btn-outline">
            View All Leads
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
