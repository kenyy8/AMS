import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

const readStoredUser = () => {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch (e) {
    return null;
  }
};

const isManager = (user) => {
  if (!user) return false;
  const role = (user.role || '').toString().toLowerCase();
  return role === 'manager' || role === 'property_manager' || role === 'admin' || user.is_manager || user.isAdmin;
};

const Layout = () => {
  const user = readStoredUser();
  const showNavbar = isManager(user);

  return (
    <div className="app-root-full">
      {showNavbar && <Navbar />}
      {/* When navbar is hidden for tenants, remove the top offset so no blank header bar shows */}
      <div className="app-content-scroll" style={ showNavbar ? undefined : { top: 0 } }>
        <main className="mgr-main" style={ showNavbar ? undefined : { paddingTop: 18 } }>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
