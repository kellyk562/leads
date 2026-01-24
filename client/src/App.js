import React from 'react';
import { Routes, Route, NavLink, Link, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { FaPlus, FaCannabis, FaUser } from 'react-icons/fa';
import 'react-toastify/dist/ReactToastify.css';

import { UserProvider, useUsers } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';
import LeadsList from './pages/LeadsList';
import LeadForm from './pages/LeadForm';
import LeadDetail from './pages/LeadDetail';

function UserSelector() {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { users } = useUsers();

  const handleUserChange = (e) => {
    const newUsername = e.target.value;
    // Get the path after the username (e.g., /ken/leads -> /jack/leads)
    const pathParts = location.pathname.split('/').filter(Boolean);
    pathParts[0] = newUsername;
    navigate('/' + pathParts.join('/'));
  };

  return (
    <div className="user-selector">
      <FaUser className="user-icon" />
      <select value={username || 'ken'} onChange={handleUserChange}>
        {users.map(user => (
          <option key={user.id} value={user.name}>
            {user.name.charAt(0).toUpperCase() + user.name.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

function AppHeader() {
  const { username } = useParams();
  const currentUser = username || 'ken';

  return (
    <header className="header">
      <div className="header-content">
        <Link to={`/${currentUser}`} className="logo">
          <FaCannabis className="logo-icon" />
          <h1>Leads</h1>
        </Link>
        <nav className="nav-links">
          <NavLink to={`/${currentUser}/leads`}>All</NavLink>
          <NavLink to={`/${currentUser}/leads/new`} className="add-lead-btn" title="Add Lead">
            <FaPlus />
          </NavLink>
          <UserSelector />
        </nav>
      </div>
    </header>
  );
}

function AppLayout() {
  return (
    <div className="app-container">
      <AppHeader />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leads" element={<LeadsList />} />
          <Route path="/leads/new" element={<LeadForm />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/leads/:id/edit" element={<LeadForm />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <UserProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/ken" replace />} />
        <Route path="/:username/*" element={<AppLayout />} />
      </Routes>

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
    </UserProvider>
  );
}

export default App;
