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

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/check', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(prev => ({ ...prev, ...data.user }));
        }
      }
    } catch (err) {
      console.warn('[AUTH] Failed to refresh user state:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const decoded = decodeJwt(token);
      setUser(decoded);
      refreshUser();
    } else {
      setUser(null);
    }
  }, [token, refreshUser]);

  const role = user?.role || 'viewer';
  const username = user?.username || 'anonymous';
  const granularPolicies = user?.granular_policies || null;
  const twoFactorEnabled = Boolean(user?.two_factor_enabled);

  const hasRole = useCallback((allowedRoles) => {
    if (!allowedRoles) return true;
    if (typeof allowedRoles === 'string') return role === allowedRoles;
    if (Array.isArray(allowedRoles)) return allowedRoles.includes(role);
    return false;
  }, [role]);

  const hasModuleAccess = useCallback((moduleId) => {
    if (!moduleId) return true;
    if (role === 'superadmin') return true;
    if (role === 'custom') {
      return Boolean(granularPolicies?.modules?.[moduleId]);
    }
    if (role === 'operator') {
      return ['overview', 'files', 'docker', 'vhosts', 'backups'].includes(moduleId);
    }
    if (role === 'viewer') {
      return ['overview', 'audit'].includes(moduleId);
    }
    return false;
  }, [role, granularPolicies]);

  const isSuperAdmin = role === 'superadmin';
  const isOperator = role === 'operator' || role === 'superadmin';
  const isCustom = role === 'custom';

  const value = useMemo(() => ({
    user,
    role,
    username,
    granularPolicies,
    twoFactorEnabled,
    refreshUser,
    hasRole,
    hasModuleAccess,
    isSuperAdmin,
    isOperator,
    isCustom,
    token,
    logout: onLogout
  }), [user, role, username, granularPolicies, twoFactorEnabled, refreshUser, hasRole, hasModuleAccess, isSuperAdmin, isOperator, isCustom, token, onLogout]);

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
      granularPolicies: null,
      hasRole: () => false,
      hasModuleAccess: () => false,
      isSuperAdmin: false,
      isOperator: false,
      isCustom: false,
      twoFactorEnabled: false,
      refreshUser: () => {},
      token: '',
      logout: () => {}
    };
  }
  return context;
}
