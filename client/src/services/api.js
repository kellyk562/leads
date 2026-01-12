import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Leads API
export const leadsApi = {
  // Get all leads with optional filters
  getAll: (params = {}) => api.get('/leads', { params }),

  // Get single lead by ID
  getById: (id) => api.get(`/leads/${id}`),

  // Create new lead
  create: (data) => api.post('/leads', data),

  // Update lead
  update: (id, data) => api.put(`/leads/${id}`, data),

  // Delete lead
  delete: (id) => api.delete(`/leads/${id}`),

  // Get today's callbacks
  getTodayCallbacks: () => api.get('/leads/callbacks/today'),

  // Get upcoming callbacks (next 7 days)
  getUpcomingCallbacks: () => api.get('/leads/callbacks/upcoming'),

  // Get dashboard statistics
  getStats: () => api.get('/leads/stats'),

  // Add contact history
  addHistory: (leadId, data) => api.post(`/leads/${leadId}/history`, data),

  // Get contact history for a lead
  getHistory: (leadId) => api.get(`/leads/${leadId}/history`),
};

export default api;
