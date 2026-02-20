import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaArrowLeft,
  FaEdit,
  FaTrash,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaPlus,
  FaHistory,
  FaComments,
  FaUser,
  FaCopy,
  FaCheck,
  FaExchangeAlt,
  FaPaperPlane
} from 'react-icons/fa';
import { leadsApi, tasksApi, emailTemplatesApi, emailApi } from '../services/api';
import { STAGES, STAGE_COLORS, STAGE_BG_COLORS } from '../constants/stages';

const formatCurrency = (value) => {
  if (!value && value !== 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    due_date: new Date().toISOString().split('T')[0],
    due_time: '',
    priority: 'Medium'
  });
  const [historyForm, setHistoryForm] = useState({
    contact_method: 'Phone',
    contact_person: '',
    notes: '',
    outcome: '',
    next_callback: ''
  });
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState(1); // 1 = select template, 2 = preview
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [activityFilter, setActivityFilter] = useState('All');

  const fetchLead = useCallback(async () => {
    try {
      const response = await leadsApi.getById(id);
      setLead(response.data);
    } catch (error) {
      console.error('Error fetching lead:', error);
      toast.error('Failed to load lead');
      navigate(`/leads`);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await tasksApi.getAll({ lead_id: id });
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
    fetchTasks();
    emailApi.getStatus().then(res => setEmailConfigured(res.data.configured)).catch(() => setEmailConfigured(false));
  }, [fetchLead, fetchTasks]);

  const handleDelete = async () => {
    try {
      await leadsApi.delete(id);
      toast.success('Lead deleted successfully');
      navigate(`/leads`);
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.error('Failed to delete lead');
    }
  };

  const handlePriorityChange = async (newPriority) => {
    try {
      await leadsApi.update(id, { ...lead, priority: newPriority });
      setLead(prev => ({ ...prev, priority: newPriority }));
      setShowPriorityDropdown(false);
      toast.success(`Priority updated to ${newPriority}`);
    } catch (error) {
      console.error('Error updating priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const handleStageChange = async (newStage) => {
    try {
      await leadsApi.updateStage(id, newStage);
      setLead(prev => ({ ...prev, stage: newStage }));
      setShowStageDropdown(false);
      toast.success(`Stage updated to ${newStage}`);
      fetchLead(); // refresh to get updated contact history
    } catch (error) {
      console.error('Error updating stage:', error);
      toast.error('Failed to update stage');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleAddHistory = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await leadsApi.addHistory(id, historyForm);
      toast.success('Contact history added');
      setShowHistoryModal(false);
      setHistoryForm({
        contact_method: 'Phone',
        contact_person: '',
        notes: '',
        outcome: '',
        next_callback: ''
      });
      fetchLead();
    } catch (error) {
      console.error('Error adding history:', error);
      toast.error('Failed to add contact history');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await tasksApi.create({ ...taskForm, lead_id: parseInt(id) });
      toast.success('Task added');
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', due_date: new Date().toISOString().split('T')[0], due_time: '', priority: 'Medium' });
      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error('Failed to add task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTask = async (taskId) => {
    try {
      await tasksApi.toggleComplete(taskId);
      fetchTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await tasksApi.delete(taskId);
      toast.success('Task deleted');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const renderTemplate = useCallback((text) => {
    if (!text || !lead) return text || '';
    const fields = {
      dispensary_name: lead.dispensary_name || '',
      reference: lead.contact_name || '',
      contact_name: lead.manager_name || '',
      contact_email: lead.contact_email || '',
      dispensary_number: lead.dispensary_number || '',
      contact_number: lead.contact_number || '',
      current_pos_system: lead.current_pos_system || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
    };
    return text.replace(/\{\{(\w+)\}\}/g, (match, field) => fields[field] !== undefined ? fields[field] : match);
  }, [lead]);

  const openEmailModal = async () => {
    try {
      const response = await emailTemplatesApi.getAll();
      setEmailTemplates(response.data);
    } catch (error) {
      console.error('Error fetching email templates:', error);
      toast.error('Failed to load email templates');
      return;
    }
    setEmailStep(1);
    setSelectedTemplate(null);
    setEmailSubject('');
    setEmailBody('');
    setShowEmailModal(true);
  };

  const selectTemplate = (template) => {
    setSelectedTemplate(template);
    setEmailSubject(renderTemplate(template.subject));
    setEmailBody(renderTemplate(template.body));
    setEmailStep(2);
  };

  const handleCopyEmail = () => {
    const fullText = `Subject: ${emailSubject}\n\n${emailBody}`;
    navigator.clipboard.writeText(fullText).then(() => {
      toast.success('Email copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleOpenMailto = () => {
    const mailto = `mailto:${encodeURIComponent(lead.contact_email || '')}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailto, '_blank');
  };

  const handleLogEmail = async () => {
    setSubmitting(true);
    try {
      await leadsApi.addHistory(id, {
        contact_method: 'Email',
        notes: emailBody,
        outcome: `Sent template: ${selectedTemplate?.name || 'Custom'}`,
        email_template_id: selectedTemplate?.id || null,
        email_subject: emailSubject
      });
      toast.success('Email logged to contact history');
      setShowEmailModal(false);
      fetchLead();
    } catch (error) {
      console.error('Error logging email:', error);
      toast.error('Failed to log email');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!lead.contact_email) {
      toast.error('This lead has no email address on file');
      return;
    }
    setSendingEmail(true);
    try {
      await emailApi.send({
        leadId: parseInt(id),
        to: lead.contact_email,
        subject: emailSubject,
        body: emailBody,
        templateId: selectedTemplate?.id || null,
        templateName: selectedTemplate?.name || null,
      });
      toast.success('Email sent successfully!');
      setShowEmailModal(false);
      fetchLead();
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to send email';
      toast.error(msg);
    } finally {
      setSendingEmail(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return '-';
    }
  };

  const formatCallbackDays = (callbackDays) => {
    if (!callbackDays) return 'Not set';
    try {
      const daysArray = typeof callbackDays === 'string' ? JSON.parse(callbackDays) : callbackDays;
      if (!Array.isArray(daysArray) || daysArray.length === 0) return 'Not set';
      if (daysArray.length === 7) return 'Every day';
      return daysArray.join(', ');
    } catch {
      return 'Not set';
    }
  };

  const formatTimeSlots = (timeSlots) => {
    if (!timeSlots) return null;
    try {
      const slotsArray = typeof timeSlots === 'string' ? JSON.parse(timeSlots) : timeSlots;
      if (!Array.isArray(slotsArray) || slotsArray.length === 0) return null;
      return slotsArray.join(', ');
    } catch {
      return null;
    }
  };

  const formatTimeRange = (from, to) => {
    if (!from && !to) return null;
    if (from && to) return `${from} - ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return null;
  };

  const formatPhoneNumber = (value) => {
    if (!value) return '';
    let digits = value.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.slice(1);
    }
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const getMethodIcon = (method) => {
    const icons = {
      'Phone': <FaPhone />,
      'Email': <FaEnvelope />,
      'In-Person': <FaUser />,
      'Text': <FaComments />,
      'Stage Change': <FaExchangeAlt />,
      'Task': <FaCheck />,
      'Other': <FaHistory />
    };
    return icons[method] || <FaHistory />;
  };

  const getDaysColor = (days) => {
    if (days === null || days === undefined) return '#6c757d';
    if (days <= 7) return '#198754';
    if (days <= 14) return '#e65100';
    return '#dc3545';
  };

  const getDaysBg = (days) => {
    if (days === null || days === undefined) return '#e9ecef';
    if (days <= 7) return '#d1e7dd';
    if (days <= 14) return '#fff3e0';
    return '#f8d7da';
  };

  // Build unified activity timeline
  const activityTimeline = React.useMemo(() => {
    if (!lead) return [];
    const items = [];

    // Add contact history entries
    (lead.contact_history || []).forEach(h => {
      const isStageChange = h.contact_method === 'Other' && h.notes && h.notes.startsWith('Stage changed');
      items.push({
        id: `h-${h.id}`,
        type: isStageChange ? 'Stage Change' : (h.contact_method || 'Other'),
        date: h.contact_date,
        title: isStageChange
          ? h.notes
          : `${h.contact_method || 'Contact'}${h.contact_person ? ` with ${h.contact_person}` : ''}`,
        notes: isStageChange ? null : h.notes,
        outcome: h.outcome,
        emailSubject: h.email_subject,
        nextCallback: h.next_callback
      });
    });

    // Add completed tasks
    (lead.completed_tasks || []).forEach(t => {
      items.push({
        id: `t-${t.id}`,
        type: 'Task',
        date: t.completed_at,
        title: `Task Completed: ${t.title}`,
        notes: t.description,
        outcome: null,
        emailSubject: null,
        nextCallback: null
      });
    });

    // Sort by date descending
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    return items;
  }, [lead]);

  const filteredTimeline = activityFilter === 'All'
    ? activityTimeline
    : activityTimeline.filter(item => item.type === activityFilter);

  const activityFilterOptions = ['All', 'Phone', 'Email', 'Stage Change', 'Task', 'In-Person', 'Text'];

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="empty-state">
        <h3>Lead not found</h3>
        <Link to={`/leads`} className="btn btn-primary">
          Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="lead-detail-page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to={`/leads`} className="btn btn-outline">
          <FaArrowLeft /> Back to Leads
        </Link>
      </div>

      <div className="lead-detail">
        <div className="lead-detail-header" style={{ flexDirection: 'column', gap: '1rem' }}>
          <div className="lead-detail-title" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>{lead.dispensary_name}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Stage Badge */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setShowStageDropdown(!showStageDropdown); setShowPriorityDropdown(false); }}
                    className="stage-badge"
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      background: STAGE_BG_COLORS[lead.stage || 'New Lead'],
                      color: STAGE_COLORS[lead.stage || 'New Lead'],
                    }}
                  >
                    {lead.stage || 'New Lead'} ▼
                  </button>
                  {showStageDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '0.25rem',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      minWidth: '160px',
                      overflow: 'hidden'
                    }}>
                      {STAGES.map(stage => (
                        <button
                          key={stage}
                          onClick={() => handleStageChange(stage)}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '0.5rem 1rem',
                            border: 'none',
                            background: (lead.stage || 'New Lead') === stage ? STAGE_BG_COLORS[stage] : 'white',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.8125rem',
                            fontWeight: (lead.stage || 'New Lead') === stage ? '600' : '400',
                            color: STAGE_COLORS[stage]
                          }}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              {lead.priority && (
                <div style={{ position: 'relative' }}>
                  <button
                    className={`priority-badge priority-${lead.priority.toLowerCase()}`}
                    onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                    style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                  >
                    <span className={`priority-badge priority-${lead.priority.toLowerCase()}`} style={{ cursor: 'pointer' }}>
                      {lead.priority} ▼
                    </span>
                  </button>
                  {showPriorityDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '0.25rem',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      minWidth: '120px',
                      overflow: 'hidden'
                    }}>
                      {['High', 'Medium', 'Low'].map(priority => (
                        <button
                          key={priority}
                          onClick={() => handlePriorityChange(priority)}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '0.625rem 1rem',
                            border: 'none',
                            background: lead.priority === priority ? '#f0f0f0' : 'white',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.875rem',
                            fontWeight: lead.priority === priority ? '600' : '400'
                          }}
                        >
                          {priority}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
            {lead.address && (
              <p style={{ color: '#6c757d', margin: '0.25rem 0 0', fontSize: '0.95rem' }}>
                <FaMapMarkerAlt size={12} style={{ marginRight: '0.5rem' }} />
                {lead.address}
              </p>
            )}
            {lead.deal_value && (
              <p style={{ color: '#2e7d32', fontWeight: 700, margin: '0.25rem 0 0', fontSize: '1.1rem' }}>
                {formatCurrency(lead.deal_value)}/mo
              </p>
            )}
            {lead.days_since_last_contact !== undefined && (
              <span style={{
                display: 'inline-block',
                marginTop: '0.25rem',
                padding: '0.25rem 0.75rem',
                borderRadius: '50px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                background: getDaysBg(lead.days_since_last_contact),
                color: getDaysColor(lead.days_since_last_contact)
              }}>
                {lead.days_since_last_contact !== null
                  ? `${lead.days_since_last_contact}d since last contact`
                  : 'Never contacted'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowHistoryModal(true)}
              style={{ flex: '1 1 auto' }}
            >
              <FaPlus /> Log Contact
            </button>
            <button
              className="btn btn-outline"
              onClick={openEmailModal}
              style={{ flex: '1 1 auto' }}
            >
              <FaEnvelope /> Send Email
            </button>
            <Link to={`/leads/${id}/edit`} className="btn btn-primary" style={{ flex: '1 1 auto', textAlign: 'center', justifyContent: 'center' }}>
              <FaEdit /> Edit
            </Link>
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteModal(true)}
            >
              <FaTrash />
            </button>
          </div>
        </div>

        <div className="lead-detail-body">
          {/* Callback Info Alert */}
          {((lead.callback_days && lead.callback_days !== '[]') || formatTimeSlots(lead.callback_time_slots) || lead.callback_time_from || lead.callback_time_to) && (
            <div
              style={{
                background: '#e8f5e9',
                border: '1px solid #4caf50',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <FaCalendarAlt style={{ color: '#2d5a27' }} />
                <strong>Callback Schedule</strong>
              </div>
              <div style={{ marginLeft: '1.75rem' }}>
                {lead.callback_days && lead.callback_days !== '[]' && (
                  <div><strong>Days:</strong> {formatCallbackDays(lead.callback_days)}</div>
                )}
                {formatTimeSlots(lead.callback_time_slots) && (
                  <div><strong>Best Time:</strong> {formatTimeSlots(lead.callback_time_slots)}</div>
                )}
                {formatTimeRange(lead.callback_time_from, lead.callback_time_to) && (
                  <div><strong>Time:</strong> {formatTimeRange(lead.callback_time_from, lead.callback_time_to)}</div>
                )}
              </div>
            </div>
          )}

          {/* Contact Information */}
          <div className="detail-section">
            <h3><FaUser /> Contact Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Reference</label>
                <span>{lead.contact_name || '-'}</span>
              </div>
              <div className="detail-item">
                <label>Name</label>
                <span>
                  {lead.manager_name || '-'}
                  {lead.owner_name && <span style={{ color: '#6c757d' }}> ({lead.owner_name})</span>}
                </span>
              </div>
              <div className="detail-item">
                <label>Dispensary Phone</label>
                <span>
                  {lead.dispensary_number ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`tel:${lead.dispensary_number}`} style={{ color: '#2d5a27' }}>
                        <FaPhone size={12} /> {formatPhoneNumber(lead.dispensary_number)}
                      </a>
                      <button
                        onClick={() => copyToClipboard(lead.dispensary_number)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', padding: '0.25rem' }}
                        title="Copy to clipboard"
                      >
                        <FaCopy size={14} />
                      </button>
                    </span>
                  ) : '-'}
                </span>
              </div>
              <div className="detail-item">
                <label>Phone</label>
                <span>
                  {lead.contact_number ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`tel:${lead.contact_number}`} style={{ color: '#2d5a27' }}>
                        <FaPhone size={12} /> {formatPhoneNumber(lead.contact_number)}
                      </a>
                      <button
                        onClick={() => copyToClipboard(lead.contact_number)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', padding: '0.25rem' }}
                        title="Copy to clipboard"
                      >
                        <FaCopy size={14} />
                      </button>
                    </span>
                  ) : '-'}
                </span>
              </div>
              <div className="detail-item">
                <label>Email</label>
                <span>
                  {lead.contact_email ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`mailto:${lead.contact_email}`} style={{ color: '#2d5a27' }}>
                        <FaEnvelope size={12} /> {lead.contact_email}
                      </a>
                      <button
                        onClick={() => copyToClipboard(lead.contact_email)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d', padding: '0.25rem' }}
                        title="Copy to clipboard"
                      >
                        <FaCopy size={14} />
                      </button>
                    </span>
                  ) : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="detail-section">
              <h3><FaComments /> Notes</h3>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {lead.notes}
              </div>
            </div>
          )}

          {/* Tasks */}
          <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, border: 'none', paddingBottom: 0 }}><FaCheck /> Tasks</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowTaskModal(true)}>
                <FaPlus /> Add Task
              </button>
            </div>
            {tasks.length > 0 ? (
              <div className="task-list">
                {tasks.map(task => {
                  const taskDate = task.due_date ? new Date(task.due_date + 'T00:00:00') : null;
                  const overdue = task.status === 'pending' && taskDate && isPast(taskDate) && !isToday(taskDate);
                  return (
                    <div key={task.id} className="task-item" style={{ borderLeftColor: overdue ? '#dc3545' : task.status === 'completed' ? '#28a745' : '#f5a623' }}>
                      <input
                        type="checkbox"
                        className="task-checkbox"
                        checked={task.status === 'completed'}
                        onChange={() => handleToggleTask(task.id)}
                      />
                      <div className="task-content">
                        <span className="task-title" style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none', color: task.status === 'completed' ? '#6c757d' : 'inherit' }}>
                          {task.title}
                        </span>
                        <div className="task-meta">
                          <span style={{ color: overdue ? '#dc3545' : '#6c757d' }}>
                            {task.due_date ? format(new Date(task.due_date + 'T00:00:00'), 'MMM d, yyyy') : ''}
                            {task.due_time ? ` at ${task.due_time}` : ''}
                          </span>
                          <span className={`priority-badge priority-${task.priority?.toLowerCase()}`} style={{ fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545', padding: '0.25rem', flexShrink: 0 }}
                        title="Delete task"
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                No tasks yet. Click "Add Task" to create one.
              </p>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="detail-section">
            <h3><FaHistory /> Activity Timeline</h3>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {activityFilterOptions.map(opt => (
                <button
                  key={opt}
                  onClick={() => setActivityFilter(opt)}
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '50px',
                    border: '1px solid',
                    borderColor: activityFilter === opt ? '#2d5a27' : '#dee2e6',
                    background: activityFilter === opt ? '#2d5a27' : 'white',
                    color: activityFilter === opt ? 'white' : '#495057',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {filteredTimeline.length > 0 ? (
              <div className="history-list">
                {filteredTimeline.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-icon">
                      {getMethodIcon(item.type)}
                    </div>
                    <div className="history-content">
                      <h4>{item.title}</h4>
                      {item.emailSubject && (
                        <p style={{ fontWeight: 500, color: '#495057' }}>Subject: {item.emailSubject}</p>
                      )}
                      {item.notes && <p>{item.notes}</p>}
                      {item.outcome && (
                        <p><strong>Outcome:</strong> {item.outcome}</p>
                      )}
                      {item.nextCallback && (
                        <p><strong>Next callback:</strong> {formatDateTime(item.nextCallback)}</p>
                      )}
                      <div className="history-meta">
                        {formatDateTime(item.date)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                {activityFilter === 'All'
                  ? 'No activity yet. Click "Log Contact" to add your first entry.'
                  : `No ${activityFilter} activity found.`}
              </p>
            )}
          </div>

          {/* Metadata */}
          <div className="detail-section">
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created</label>
                <span>{formatDateTime(lead.created_at)}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated</label>
                <span>{formatDateTime(lead.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{lead.dispensary_name}</strong>?</p>
              <p>This will also delete all contact history. This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Task</h3>
              <button className="modal-close" onClick={() => setShowTaskModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAddTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title <span className="required">*</span></label>
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="What needs to be done?"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Additional details..."
                    rows="2"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Due Date <span className="required">*</span></label>
                    <input
                      type="date"
                      value={taskForm.due_date}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Due Time</label>
                    <input
                      type="time"
                      value={taskForm.due_time}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, due_time: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowTaskModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Log Contact</h3>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAddHistory}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Contact Method</label>
                  <select
                    value={historyForm.contact_method}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, contact_method: e.target.value }))}
                  >
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="In-Person">In-Person</option>
                    <option value="Text">Text</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Person Contacted</label>
                  <input
                    type="text"
                    value={historyForm.contact_person}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, contact_person: e.target.value }))}
                    placeholder="Who did you speak with?"
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={historyForm.notes}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="What was discussed?"
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Outcome</label>
                  <input
                    type="text"
                    value={historyForm.outcome}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, outcome: e.target.value }))}
                    placeholder="e.g., Scheduled demo, Sent proposal"
                  />
                </div>

                <div className="form-group">
                  <label>Schedule Next Callback</label>
                  <input
                    type="datetime-local"
                    value={historyForm.next_callback}
                    onChange={(e) => setHistoryForm(prev => ({ ...prev, next_callback: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowHistoryModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showEmailModal && (
        <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>{emailStep === 1 ? 'Select Email Template' : 'Preview & Send Email'}</h3>
              <button className="modal-close" onClick={() => setShowEmailModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {emailStep === 1 ? (
                <>
                  {emailTemplates.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {emailTemplates.map(template => (
                        <div
                          key={template.id}
                          className="email-template-card"
                          style={{ cursor: 'pointer' }}
                          onClick={() => selectTemplate(template)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>{template.name}</h4>
                            <span style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '0.125rem 0.5rem',
                              borderRadius: '50px',
                              background: '#e9ecef',
                              color: '#495057'
                            }}>
                              {template.category || 'General'}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6c757d' }}>
                            {template.subject}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: '#6c757d' }}>
                      No templates available. Create one from the Templates page.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {!lead.contact_email && (
                    <div style={{
                      background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px',
                      padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#856404'
                    }}>
                      This lead has no email address on file. Add one via Edit to send emails directly.
                    </div>
                  )}
                  {emailConfigured === false && (
                    <div style={{
                      background: '#f8d7da', border: '1px solid #dc3545', borderRadius: '8px',
                      padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#721c24'
                    }}>
                      Email sending is not configured. Contact your admin to set up the RESEND_API_KEY.
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>To</label>
                    <input
                      type="text"
                      value={lead.contact_email || 'No email on file'}
                      disabled
                      style={{ background: '#e9ecef' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Body</label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows="12"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: emailStep === 2 ? 'space-between' : 'flex-end' }}>
              {emailStep === 2 && (
                <button className="btn btn-outline" onClick={() => setEmailStep(1)}>
                  Back
                </button>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {emailStep === 2 && (
                  <>
                    <button className="btn btn-outline" onClick={handleCopyEmail}>
                      <FaCopy /> Copy
                    </button>
                    <button className="btn btn-outline" onClick={handleOpenMailto}>
                      <FaEnvelope /> Mailto
                    </button>
                    <button className="btn btn-secondary" onClick={handleLogEmail} disabled={submitting}>
                      {submitting ? 'Logging...' : 'Log Only'}
                    </button>
                    {emailConfigured && lead.contact_email && (
                      <button
                        className="btn btn-primary"
                        onClick={handleSendEmail}
                        disabled={sendingEmail}
                        style={{ background: '#198754', borderColor: '#198754' }}
                      >
                        <FaPaperPlane /> {sendingEmail ? 'Sending...' : 'Send Email'}
                      </button>
                    )}
                  </>
                )}
                {emailStep === 1 && (
                  <button className="btn btn-outline" onClick={() => setShowEmailModal(false)}>Cancel</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadDetail;
