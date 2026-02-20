import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, isPast, isToday } from 'date-fns';
import { toast } from 'react-toastify';
import {
  FaTasks,
  FaTrash,
  FaExclamationTriangle,
  FaChevronDown,
  FaChevronRight
} from 'react-icons/fa';
import { tasksApi } from '../services/api';

function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const params = {};
      if (priorityFilter) params.priority = priorityFilter;
      const response = await tasksApi.getAll(params);
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [priorityFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleToggle = async (taskId) => {
    try {
      await tasksApi.toggleComplete(taskId);
      fetchTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error('Failed to update task');
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await tasksApi.delete(taskId);
      toast.success('Task deleted');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const grouped = useMemo(() => {
    const overdue = [];
    const today = [];
    const upcoming = [];
    const completed = [];

    tasks.forEach(task => {
      if (task.status === 'completed') {
        completed.push(task);
      } else {
        const taskDate = task.due_date ? new Date(task.due_date + 'T00:00:00') : null;
        if (taskDate && isPast(taskDate) && !isToday(taskDate)) {
          overdue.push(task);
        } else if (taskDate && isToday(taskDate)) {
          today.push(task);
        } else {
          upcoming.push(task);
        }
      }
    });

    return { overdue, today, upcoming, completed: completed.slice(0, 20) };
  }, [tasks]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString + 'T00:00:00'), 'MMM d, yyyy');
    } catch {
      return '';
    }
  };

  const renderTask = (task, isOverdue = false) => (
    <div
      key={task.id}
      className="task-item"
      style={{ borderLeftColor: task.status === 'completed' ? '#28a745' : isOverdue ? '#dc3545' : '#f5a623' }}
    >
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.status === 'completed'}
        onChange={() => handleToggle(task.id)}
      />
      <div className="task-content">
        <span
          className="task-title"
          style={{
            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
            color: task.status === 'completed' ? '#6c757d' : 'inherit'
          }}
        >
          {task.title}
        </span>
        <div className="task-meta">
          <Link
            to={`/leads/${task.lead_id}`}
            style={{ color: '#2d5a27', textDecoration: 'none', fontSize: '0.8125rem' }}
          >
            {task.dispensary_name}
          </Link>
          <span style={{ color: isOverdue ? '#dc3545' : '#6c757d', fontSize: '0.8125rem' }}>
            {isOverdue && <FaExclamationTriangle size={10} style={{ marginRight: '0.25rem' }} />}
            {formatDate(task.due_date)}
            {task.due_time ? ` at ${task.due_time}` : ''}
          </span>
          <span
            className={`priority-badge priority-${task.priority?.toLowerCase()}`}
            style={{ fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}
          >
            {task.priority}
          </span>
        </div>
      </div>
      <button
        onClick={() => handleDelete(task.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#dc3545',
          padding: '0.25rem',
          flexShrink: 0
        }}
        title="Delete task"
      >
        <FaTrash size={12} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="tasks-page">
      <div className="callbacks-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid var(--primary-light)' }}>
          <h2 style={{ margin: 0, border: 'none', paddingBottom: 0 }}>
            <FaTasks /> Tasks
          </h2>
          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {/* Overdue */}
        {grouped.overdue.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', color: '#dc3545', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaExclamationTriangle /> Overdue ({grouped.overdue.length})
            </h3>
            <div className="task-list">
              {grouped.overdue.map(task => renderTask(task, true))}
            </div>
          </div>
        )}

        {/* Today */}
        {grouped.today.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
              Today ({grouped.today.length})
            </h3>
            <div className="task-list">
              {grouped.today.map(task => renderTask(task))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {grouped.upcoming.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
              Upcoming ({grouped.upcoming.length})
            </h3>
            <div className="task-list">
              {grouped.upcoming.map(task => renderTask(task))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {grouped.overdue.length === 0 && grouped.today.length === 0 && grouped.upcoming.length === 0 && grouped.completed.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><FaTasks /></div>
            <h3>No tasks yet</h3>
            <p>Tasks can be added from individual lead pages.</p>
          </div>
        )}

        {/* Completed */}
        {grouped.completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: 0
              }}
            >
              {showCompleted ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
              Completed ({grouped.completed.length})
            </button>
            {showCompleted && (
              <div className="task-list">
                {grouped.completed.map(task => renderTask(task))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Tasks;
