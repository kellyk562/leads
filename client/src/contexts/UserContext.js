import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/leads/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      // Fallback to default users if API fails
      setUsers([
        { id: 1, name: 'ken' },
        { id: 2, name: 'jack' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getUserIdByName = (username) => {
    const user = users.find(u => u.name.toLowerCase() === username?.toLowerCase());
    return user?.id || 1;
  };

  const getUserNameById = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || 'ken';
  };

  return (
    <UserContext.Provider value={{ users, loading, getUserIdByName, getUserNameById }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUsers must be used within a UserProvider');
  }
  return context;
}

export default UserContext;
