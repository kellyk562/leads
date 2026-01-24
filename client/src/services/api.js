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
  getAll: (params = {}, userId) => {
    const queryParams = userId ? { ...params, user_id: userId } : params;
    return api.get('/leads', { params: queryParams });
  },

  // Get single lead by ID
  getById: (id) => api.get(`/leads/${id}`),

  // Create new lead
  create: (data, userId) => api.post('/leads', { ...data, user_id: userId }),

  // Update lead
  update: (id, data) => api.put(`/leads/${id}`, data),

  // Delete lead
  delete: (id) => api.delete(`/leads/${id}`),

  // Get today's callbacks
  getTodayCallbacks: (userId) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];
    const params = { day: todayDay };
    if (userId) params.user_id = userId;
    return api.get('/leads/callbacks/today', { params });
  },

  // Get upcoming callbacks (next 7 days)
  getUpcomingCallbacks: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/leads/callbacks/upcoming', { params });
  },

  // Get dashboard statistics
  getStats: (userId) => {
    const params = userId ? { user_id: userId } : {};
    return api.get('/leads/stats', { params });
  },

  // Add contact history
  addHistory: (leadId, data) => api.post(`/leads/${leadId}/history`, data),

  // Get contact history for a lead
  getHistory: (leadId) => api.get(`/leads/${leadId}/history`),

  // Get users
  getUsers: () => api.get('/leads/users'),
};

export default api;
