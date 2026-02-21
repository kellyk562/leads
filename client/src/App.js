import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Link, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { FaPlus, FaCannabis } from 'react-icons/fa';
import 'react-toastify/dist/ReactToastify.css';

import Dashboard from './pages/Dashboard';
import LeadsList from './pages/LeadsList';
import LeadForm from './pages/LeadForm';
import LeadDetail from './pages/LeadDetail';
import Pipeline from './pages/Pipeline';
import Tasks from './pages/Tasks';
import EmailTemplates from './pages/EmailTemplates';
import Analytics from './pages/Analytics';
import ImportLeads from './pages/ImportLeads';
import QuickLogModal from './components/QuickLogModal';

function AppHeader() {
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <FaCannabis className="logo-icon" />
          <h1>Leads</h1>
        </Link>
        <nav className="nav-links">
          <NavLink to="/leads">All</NavLink>
          <NavLink to="/pipeline">Pipeline</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          <NavLink to="/templates">Templates</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/leads/new" className="add-lead-btn" title="Add Lead">
            <FaPlus />
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function App() {
  const [callPrompt, setCallPrompt] = useState(null);

  const checkPendingCall = useCallback(() => {
    try {
      const raw = sessionStorage.getItem('pendingCall');
      if (!raw) return;
      const pending = JSON.parse(raw);
      const elapsed = Date.now() - pending.calledAt;
      // Only prompt if the user was away 5s–60min (likely made a real call)
      if (elapsed >= 5000 && elapsed <= 3600000) {
        sessionStorage.removeItem('pendingCall');
        setCallPrompt(pending);
      } else if (elapsed > 3600000) {
        // Stale — discard silently
        sessionStorage.removeItem('pendingCall');
      }
    } catch {
      sessionStorage.removeItem('pendingCall');
    }
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkPendingCall();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [checkPendingCall]);

  return (
    <>
      <div className="app-container">
        <AppHeader />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<LeadsList />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/templates" element={<EmailTemplates />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/import" element={<ImportLeads />} />
            <Route path="/leads/new" element={<LeadForm />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/leads/:id/edit" element={<LeadForm />} />
            <Route path="/ken" element={<Navigate to="/" replace />} />
            <Route path="/ken/*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Auto-log prompt after returning from a phone call */}
      {callPrompt && (
        <QuickLogModal
          leadId={callPrompt.leadId}
          dispensaryName={callPrompt.dispensaryName}
          onClose={() => setCallPrompt(null)}
          onSaved={() => setCallPrompt(null)}
        />
      )}

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </>
  );
}

export default App;
