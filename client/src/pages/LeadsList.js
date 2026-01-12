import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaPlus,
  FaEye,
  FaEdit,
  FaTrash,
  FaSearch,
  FaFilter,
  FaSort,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaDownload
} from 'react-icons/fa';
import { leadsApi } from '../services/api';

function LeadsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        sort: sortBy,
        order: sortOrder,
      };
      if (search) params.search = search;
      if (priorityFilter) params.priority = priorityFilter;

      const response = await leadsApi.getAll(params);
      setLeads(response.data);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, priorityFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (priorityFilter) params.set('priority', priorityFilter);
    setSearchParams(params);
  }, [search, priorityFilter, setSearchParams]);

  const handleDelete = async (id) => {
    try {
      await leadsApi.delete(id);
      toast.success('Lead deleted successfully');
      setDeleteConfirm(null);
      fetchLeads();
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.error('Failed to delete lead');
    }
  };

  const handleExport = () => {
    const baseUrl = process.env.REACT_APP_API_URL ||
      (window.location.port === '3000' ? 'http://localhost:5001/api' : '/api');
    window.location.href = `${baseUrl}/leads/export/csv`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return '-';
    }
  };

  const formatCallbackDays = (callbackDays) => {
    if (!callbackDays) return '-';
    try {
      const daysArray = typeof callbackDays === 'string' ? JSON.parse(callbackDays) : callbackDays;
      if (!Array.isArray(daysArray) || daysArray.length === 0) return '-';
      if (daysArray.length === 7) return 'Every day';
      return daysArray.map(d => d.slice(0, 3)).join(', ');
    } catch {
      return '-';
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

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  return (
    <div className="leads-list-page">
      <div className="leads-container">
        <div className="leads-header">
          <h2>Sales Leads</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-outline">
              <FaDownload /> Export
            </button>
            <Link to="/leads/new" className="btn btn-primary">
              <FaPlus /> Add New Lead
            </Link>
          </div>
        </div>

        <div className="filters-bar">
          <div className="search-wrapper" style={{ position: 'relative', flex: 1 }}>
            <FaSearch style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#6c757d'
            }} />
            <input
              type="text"
              className="search-input"
              placeholder="Search dispensaries, contacts, addresses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>

          <select
            className="filter-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [col, ord] = e.target.value.split('-');
              setSortBy(col);
              setSortOrder(ord);
            }}
          >
            <option value="updated_at-DESC">Recently Updated</option>
            <option value="created_at-DESC">Newest First</option>
            <option value="created_at-ASC">Oldest First</option>
            <option value="dispensary_name-ASC">Name A-Z</option>
            <option value="dispensary_name-DESC">Name Z-A</option>
            <option value="priority-DESC">Priority (High to Low)</option>
          </select>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FaFilter />
            </div>
            <h3>No leads found</h3>
            <p>
              {search
                ? 'Try adjusting your search terms'
                : 'Get started by adding your first sales lead'}
            </p>
            {!search && (
              <Link to="/leads/new" className="btn btn-primary">
                <FaPlus /> Add First Lead
              </Link>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="leads-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('dispensary_name')} style={{ cursor: 'pointer' }}>
                    Dispensary <FaSort />
                  </th>
                  <th>Recommended Contact</th>
                  <th>Location</th>
                  <th>
                    Callback Days
                  </th>
                  <th onClick={() => toggleSort('contact_date')} style={{ cursor: 'pointer' }}>
                    Contact Date <FaSort />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link to={`/leads/${lead.id}`} style={{ fontWeight: 600, color: getPriorityColor(lead.priority) }}>
                        {lead.dispensary_name}
                      </Link>
                      <span className={`priority-badge priority-${lead.priority?.toLowerCase()}`} style={{ marginLeft: '0.5rem' }}>
                        {lead.priority || 'Medium'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.875rem' }}>
                        {lead.manager_name && (
                          <div>
                            <strong>{lead.manager_name}</strong>
                            {lead.owner_name && <span style={{ color: '#6c757d' }}> ({lead.owner_name})</span>}
                          </div>
                        )}
                        {lead.contact_number && (
                          <div style={{ color: '#6c757d' }}>
                            <FaPhone size={10} /> {lead.contact_number}
                          </div>
                        )}
                        {lead.contact_email && (
                          <div style={{ color: '#6c757d' }}>
                            <FaEnvelope size={10} /> {lead.contact_email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {lead.address && (
                        <div style={{ color: '#6c757d', fontSize: '0.875rem' }}>
                          <FaMapMarkerAlt size={10} /> {lead.address}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      <div>{formatCallbackDays(lead.callback_days)}</div>
                      {formatTimeRange(lead.callback_time_from, lead.callback_time_to) && (
                        <div style={{ color: '#6c757d', fontSize: '0.75rem' }}>
                          {formatTimeRange(lead.callback_time_from, lead.callback_time_to)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {formatDate(lead.contact_date)}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <Link
                          to={`/leads/${lead.id}`}
                          className="btn btn-sm btn-outline btn-icon"
                          title="View"
                        >
                          <FaEye />
                        </Link>
                        <Link
                          to={`/leads/${lead.id}/edit`}
                          className="btn btn-sm btn-outline btn-icon"
                          title="Edit"
                        >
                          <FaEdit />
                        </Link>
                        <button
                          className="btn btn-sm btn-outline btn-icon"
                          title="Delete"
                          onClick={() => setDeleteConfirm(lead.id)}
                          style={{ color: '#dc3545' }}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this lead? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadsList;
