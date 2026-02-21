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
  updateStage: (id, stage, reason) => api.patch(`/leads/${id}/stage`, { stage, ...(reason && { reason }) }),

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

  // Get analytics data
  getAnalytics: () => api.get('/leads/analytics'),

  // Add contact history
  addHistory: (leadId, data) => api.post(`/leads/${leadId}/history`, data),

  // Get contact history for a lead
  getHistory: (leadId) => api.get(`/leads/${leadId}/history`),

  // Bulk create leads (import)
  bulkCreate: (leads, source) => api.post('/leads/bulk', { leads, source }),

  // Check for duplicate leads
  checkDuplicates: (names) => api.post('/leads/check-duplicates', { names }),

  // Bulk update stage
  bulkUpdateStage: (ids, stage, reason) => api.patch('/leads/bulk/stage', { ids, stage, ...(reason && { reason }) }),

  // Update cadence step
  updateCadenceStep: (id, step) => api.patch(`/leads/${id}/cadence-step`, { step }),

  // Get daily briefing data
  getBriefing: () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];
    return api.get('/leads/briefing', { params: { day: todayDay } });
  },

  // Get duplicate lead groups
  getDuplicates: () => api.get('/leads/duplicates'),

  // Merge two leads
  mergeLeads: (keepId, mergeId, fieldsFromMerge) => api.post('/leads/merge', { keepId, mergeId, fieldsFromMerge }),

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

// Email API (Gmail SMTP)
export const emailApi = {
  getStatus: () => api.get('/email/status'),
  testConnection: () => api.post('/email/test'),
  send: (data) => api.post('/email/send', data),
  sendBatch: (leadIds, templateId) => api.post('/email/batch', { leadIds, templateId }),
  getScheduled: () => api.get('/email/scheduled'),
  cancelScheduled: (id) => api.delete(`/email/scheduled/${id}`),
};

export default api;
