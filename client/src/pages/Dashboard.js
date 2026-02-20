import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaPhoneAlt,
  FaCalendarAlt,
  FaClock,
  FaArrowRight,
  FaUserPlus,
  FaTasks,
  FaExclamationTriangle
} from 'react-icons/fa';
import { leadsApi, tasksApi } from '../services/api';
import { STAGES, STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';

const formatCurrency = (value) => {
  if (!value && value !== 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
};

function Dashboard() {
  const [todayCallbacks, setTodayCallbacks] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [dashboardTasks, setDashboardTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [todayRes, leadsRes, statsRes, overdueTasksRes, todayTasksRes] = await Promise.all([
        leadsApi.getTodayCallbacks(),
        leadsApi.getAll({ status: '', sort: 'created_at', order: 'DESC' }),
        leadsApi.getStats(),
        tasksApi.getAll({ period: 'overdue' }),
        tasksApi.getAll({ period: 'today' })
      ]);
      setTodayCallbacks(todayRes.data);
      setAllLeads(leadsRes.data.slice(0, 5)); // Get 5 most recent leads
      setStats(statsRes.data);
      setDashboardTasks([
        ...overdueTasksRes.data.map(t => ({ ...t, _isOverdue: true })),
        ...todayTasksRes.data
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleToggleTask = async (taskId) => {
    try {
      await tasksApi.toggleComplete(taskId);
      fetchDashboardData();
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error('Failed to update task');
    }
  };

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
          {todayDay}'s Callbacks ({todayCallbacks.filter(lead => !lead.callback_date).length})
        </h2>
        {todayCallbacks.filter(lead => !lead.callback_date).length > 0 ? (
          <div className="callback-list">
            {todayCallbacks.filter(lead => !lead.callback_date).map((lead) => (
              <Link
                to={`/leads/${lead.id}`}
                key={lead.id}
                className="callback-item"
                style={{ textDecoration: 'none', color: 'inherit' }}
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

      {/* Tasks Section */}
      {dashboardTasks.length > 0 && (
        <div className="callbacks-section">
          <h2>
            <FaTasks />
            Tasks ({dashboardTasks.length})
          </h2>
          <div className="task-list">
            {dashboardTasks.map(task => (
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
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="callback-info">
                  <h4>{lead.dispensary_name}</h4>
                  {lead.manager_name && <p>{lead.manager_name}</p>}
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
                {stats.stageValues?.[stage] > 0 && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2e7d32', marginTop: '0.25rem' }}>
                    {formatCurrency(stats.stageValues[stage])}
                  </div>
                )}
              </div>
            ))}
          </div>
          {stats.totalPipelineValue > 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: '#e8f5e9',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontWeight: 600, color: '#2d5a27' }}>Total Pipeline Value</span>
              <span style={{ fontWeight: 700, fontSize: '1.25rem', color: '#2e7d32' }}>
                {formatCurrency(stats.totalPipelineValue)}
              </span>
            </div>
          )}
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
