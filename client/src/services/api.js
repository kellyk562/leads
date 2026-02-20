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

  // Update lead stage (lightweight)
  updateStage: (id, stage) => api.patch(`/leads/${id}/stage`, { stage }),

  // Delete lead
  delete: (id) => api.delete(`/leads/${id}`),

  // Get today's callbacks
  getTodayCallbacks: () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];
    return api.get('/leads/callbacks/today', { params: { day: todayDay } });
  },

  // Get upcoming callbacks (next 7 days)
  getUpcomingCallbacks: () => api.get('/leads/callbacks/upcoming'),

  // Get dashboard statistics
  getStats: () => api.get('/leads/stats'),

  // Add contact history
  addHistory: (leadId, data) => api.post(`/leads/${leadId}/history`, data),

  // Get contact history for a lead
  getHistory: (leadId) => api.get(`/leads/${leadId}/history`),
};

// Tasks API
export const tasksApi = {
  getAll: (params = {}) => api.get('/tasks', { params }),
  getById: (id) => api.get(`/tasks/${id}`),
  getStats: () => api.get('/tasks/stats'),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  toggleComplete: (id) => api.patch(`/tasks/${id}/complete`),
  delete: (id) => api.delete(`/tasks/${id}`),
};

// Email Templates API
export const emailTemplatesApi = {
  getAll: () => api.get('/email-templates'),
  getById: (id) => api.get(`/email-templates/${id}`),
  create: (data) => api.post('/email-templates', data),
  update: (id, data) => api.put(`/email-templates/${id}`, data),
  delete: (id) => api.delete(`/email-templates/${id}`),
};

export default api;
