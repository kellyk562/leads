import React from 'react';
import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { FaPlus, FaCannabis } from 'react-icons/fa';
import 'react-toastify/dist/ReactToastify.css';

import Dashboard from './pages/Dashboard';
import LeadsList from './pages/LeadsList';
import LeadForm from './pages/LeadForm';
import LeadDetail from './pages/LeadDetail';

function App() {
  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <FaCannabis className="logo-icon" />
            <h1>Leads</h1>
          </Link>
          <nav className="nav-links">
            <NavLink to="/leads">All</NavLink>
            <NavLink to="/leads/new" className="add-lead-btn" title="Add Lead">
              <FaPlus />
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leads" element={<LeadsList />} />
          <Route path="/leads/new" element={<LeadForm />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/leads/:id/edit" element={<LeadForm />} />
        </Routes>
      </main>

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
    </div>
  );
}

export default App;
