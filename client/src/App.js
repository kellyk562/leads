import React from 'react';
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
            <Route path="/leads/new" element={<LeadForm />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/leads/:id/edit" element={<LeadForm />} />
            <Route path="/ken" element={<Navigate to="/" replace />} />
            <Route path="/ken/*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

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
