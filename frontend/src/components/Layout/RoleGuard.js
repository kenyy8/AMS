import React from 'react';
import { Navigate } from 'react-router-dom';

// Utility helpers to read stored user/tenant info
const getStoredUser = () => {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch (e) {
    return null;
  }
};

const getStoredTenant = () => {
  try {
    const t = localStorage.getItem('tenant');
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return null;
  }
};

// Accepts a flexible manager identity. Primary check: role === 'manager'.
const isManagerUser = (user) => {
  if (!user) return false;
  const role = (user.role || '').toString().toLowerCase();
  if (role === 'manager' || role === 'property_manager' || role === 'admin') return true;
  // legacy boolean flag support
  if (user.is_manager || user.isAdmin || user.isAdmin === true) return true;
  return false;
};

export const RequireManager = ({ children }) => {
  const user = getStoredUser();
  const tenant = getStoredTenant();

  if (isManagerUser(user)) return children;

  // If a tenant is logged in, send them to the tenant dashboard.
  if (tenant) return <Navigate to="/tenant-dashboard" replace />;

  // Otherwise send to manager login
  return <Navigate to="/property-manager-login" replace />;
};

export const RequireTenant = ({ children }) => {
  const tenant = getStoredTenant();
  const user = getStoredUser();

  if (tenant) return children;

  // If a manager is logged in, prefer sending them to manager dashboard
  if (isManagerUser(user)) return <Navigate to="/property-manager-dashboard" replace />;

  // otherwise redirect to tenant login
  return <Navigate to="/tenant-login" replace />;
};

const RoleGuard = { RequireManager, RequireTenant };
export default RoleGuard;
