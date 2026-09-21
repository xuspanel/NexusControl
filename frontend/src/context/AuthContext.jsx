import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function AuthProvider({ children, token, onLogout }) {
  const [user, setUser] = useState(() => decodeJwt(token));

  useEffect(() => {
    if (token) {
      const decoded = decodeJwt(token);
      setUser(decoded);
    } else {
      setUser(null);
    }
  }, [token]);

  const role = user?.role || 'viewer';
  const username = user?.username || 'anonymous';

  const hasRole = useCallback((allowedRoles) => {
    if (!allowedRoles) return true;
    if (typeof allowedRoles === 'string') return role === allowedRoles;
    if (Array.isArray(allowedRoles)) return allowedRoles.includes(role);
    return false;
  }, [role]);

  const isSuperAdmin = role === 'superadmin';
  const isOperator = role === 'operator' || role === 'superadmin';

  const value = useMemo(() => ({
    user,
    role,
    username,
    hasRole,
    isSuperAdmin,
    isOperator,
    token,
    logout: onLogout
  }), [user, role, username, hasRole, isSuperAdmin, isOperator, token, onLogout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      role: 'viewer',
      username: 'anonymous',
      hasRole: () => false,
      isSuperAdmin: false,
      isOperator: false,
      token: '',
      logout: () => {}
    };
  }
  return context;
}
