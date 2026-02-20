import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, Legend
} from 'recharts';
import { leadsApi } from '../services/api';
import { STAGE_COLORS } from '../constants/stages';

const formatCurrency = (value) => {
  if (!value && value !== 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
};

const PIE_COLORS = ['#2d5a27', '#0d6efd', '#6f42c1', '#d63384', '#e65100', '#ffc107', '#198754', '#dc3545', '#6c757d', '#20c997'];

function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await leadsApi.getAnalytics();
        setData(response.data);
      } catch (error) {
        console.error('Error fetching analytics:', error);
        toast.error('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state">
        <h3>Failed to load analytics</h3>
      </div>
    );
  }

  // Merge weekly data
  const weeklyData = (() => {
    const map = {};
    (data.weeklyNewLeads || []).forEach(w => {
      const key = w.week;
      if (!map[key]) map[key] = { week: key, newLeads: 0, closedWon: 0 };
      map[key].newLeads = parseInt(w.count);
    });
    (data.weeklyClosedWon || []).forEach(w => {
      const key = w.week;
      if (!map[key]) map[key] = { week: key, newLeads: 0, closedWon: 0 };
      map[key].closedWon = parseInt(w.count);
    });
    return Object.values(map).sort((a, b) => a.week.localeCompare(b.week)).map(w => ({
      ...w,
      label: new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }));
  })();

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div style={{ background: 'white', border: '1px solid #dee2e6', borderRadius: '8px', padding: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <p style={{ margin: 0, fontWeight: 600, marginBottom: '0.25rem' }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ margin: 0, color: p.color, fontSize: '0.875rem' }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="analytics-page" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Analytics & Reporting</h2>

      {/* Conversion Funnel */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Conversion Funnel</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.funnel} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
              {(data.funnel || []).map((entry, i) => (
                <Cell key={i} fill={STAGE_COLORS[entry.stage] || '#6c757d'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Average Time in Stage */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Average Time in Stage (days)</h3>
        {data.avgTimeInStage && data.avgTimeInStage.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.avgTimeInStage} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="avg_days" name="Avg Days" fill="#0d6efd" radius={[4, 4, 0, 0]}>
                {(data.avgTimeInStage || []).map((entry, i) => (
                  <Cell key={i} fill={STAGE_COLORS[entry.stage] || '#0d6efd'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: '#6c757d', fontStyle: 'italic' }}>Not enough stage change data yet.</p>
        )}
      </div>

      {/* Breakdown Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* By Source */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Leads by Source</h3>
          {data.leadsBySource && data.leadsBySource.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.leadsBySource}
                  dataKey="count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={true}
                >
                  {data.leadsBySource.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No source data available.</p>
          )}
        </div>

        {/* By POS */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Leads by POS System</h3>
          {data.leadsByPOS && data.leadsByPOS.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.leadsByPOS}
                  dataKey="count"
                  nameKey="pos"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={true}
                >
                  {data.leadsByPOS.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No POS data available.</p>
          )}
        </div>

        {/* By State */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Leads by State (Top 10)</h3>
          {data.leadsByState && data.leadsByState.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.leadsByState} margin={{ left: 0, right: 10 }}>
                <XAxis dataKey="state" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Leads" fill="#2d5a27" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No state data available.</p>
          )}
        </div>
      </div>

      {/* Weekly Activity */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Weekly Activity (Last 12 Weeks)</h3>
        {weeklyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={weeklyData} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="newLeads" name="New Leads" stroke="#0d6efd" fill="#cfe2ff" strokeWidth={2} />
              <Area type="monotone" dataKey="closedWon" name="Closed Won" stroke="#198754" fill="#d1e7dd" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No weekly data yet.</p>
        )}
      </div>

      {/* Stale Leads */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>
          Stale Leads
          <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: '#6c757d', marginLeft: '0.5rem' }}>
            (14+ days inactive)
          </span>
        </h3>
        {data.staleLeads && data.staleLeads.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="leads-table" style={{ fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th>Dispensary</th>
                  <th>Stage</th>
                  <th>Days Inactive</th>
                  <th>Deal Value</th>
                </tr>
              </thead>
              <tbody>
                {data.staleLeads.map(lead => (
                  <tr key={lead.id}>
                    <td>
                      <Link to={`/leads/${lead.id}`} style={{ fontWeight: 600, color: '#2d5a27' }}>
                        {lead.dispensary_name}
                      </Link>
                    </td>
                    <td>
                      <span className="stage-badge" style={{
                        background: STAGE_COLORS[lead.stage] ? `${STAGE_COLORS[lead.stage]}20` : '#e9ecef',
                        color: STAGE_COLORS[lead.stage] || '#6c757d'
                      }}>
                        {lead.stage}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 600,
                        color: lead.days_inactive > 30 ? '#dc3545' : '#e65100'
                      }}>
                        {lead.days_inactive}d
                      </span>
                    </td>
                    <td style={{ color: lead.deal_value ? '#2e7d32' : '#6c757d', fontWeight: lead.deal_value ? 600 : 400 }}>
                      {lead.deal_value ? formatCurrency(lead.deal_value) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#198754', fontWeight: 500 }}>
            All leads are active! No stale leads found.
          </p>
        )}
      </div>
    </div>
  );
}

export default Analytics;
