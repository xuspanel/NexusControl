import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Lock,
  User,
  AlertCircle,
  QrCode,
  Eye,
  Settings
} from 'lucide-react';

export default function UsersView({ token, onShowToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // User creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success credential state (shows QR code & TOTP secret)
  const [createdUserCredential, setCreatedUserCredential] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
      onShowToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, onShowToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      onShowToast?.('Username and password are required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      onShowToast?.(`User ${data.user.username} created successfully`, 'success');
      setCreatedUserCredential({
        username: data.user.username,
        role: data.user.role,
        totpSecret: data.totpSecret,
        qrCodeDataUrl: data.qrCodeDataUrl,
        password: newPassword
      });

      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
      fetchUsers();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (userId, targetRole) => {
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: targetRole })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user role');
      }

      onShowToast?.(`Role updated to ${targetRole}`, 'success');
      fetchUsers();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (username === 'admin') {
      onShowToast?.('Cannot delete the root superadmin account', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete user "${username}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      onShowToast?.(`User ${username} deleted`, 'info');
      fetchUsers();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
    onShowToast?.('Secret copied to clipboard', 'info');
  };

  const roleCounts = users.reduce(
    (acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    },
    { superadmin: 0, operator: 0, viewer: 0 }
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#121215] p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                User Management & Access Control
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-semibold">
                SuperAdmin Only
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Role-Based Access Control (RBAC), multi-tenant operators, and cryptographic TOTP 2FA onboarding
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-colors disabled:opacity-50"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setCreatedUserCredential(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* 2. RBAC Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-500" />
              <span>SuperAdmins</span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {roleCounts.superadmin}
            </div>
            <p className="text-[11px] text-zinc-400">Full shell, user governance, snapshots</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
              <span>Operators</span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {roleCounts.operator}
            </div>
            <p className="text-[11px] text-zinc-400">Docker, Files, Domains, Backups (No Shell)</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-amber-500" />
              <span>Viewers</span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {roleCounts.viewer}
            </div>
            <p className="text-[11px] text-zinc-400">Read-only Telemetry & Audit Logs</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Eye className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Users Data Table */}
      <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
            Provisioned System Users ({users.length})
          </h3>
        </div>

        {loading && users.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs text-zinc-400">Loading user database...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 text-xs">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-80" />
            <span>{error}</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-xs">
            No users found in database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-500">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role & Privileges</th>
                  <th className="py-3 px-4">2FA Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {users.map((u) => {
                  const isRoot = u.username === 'admin';
                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs uppercase ${
                            u.role === 'superadmin'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : u.role === 'operator'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            {u.username.substring(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {isRoot && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-300 dark:border-zinc-700">
                                  Default Root
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">{u.id}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={u.role}
                          disabled={isRoot}
                          onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                          className={`text-xs font-mono font-medium rounded-lg px-2.5 py-1 border transition-colors cursor-pointer ${
                            u.role === 'superadmin'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                              : u.role === 'operator'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          } ${isRoot ? 'opacity-70 cursor-not-allowed' : 'hover:border-purple-500'}`}
                        >
                          <option value="superadmin" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            SuperAdmin (Full Root)
                          </option>
                          <option value="operator" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            Operator (No Terminal)
                          </option>
                          <option value="viewer" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            Viewer (Read Only)
                          </option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                            Enforced (TOTP)
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-zinc-500 text-[11px]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Initial Setup'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-zinc-500 text-[11px]">
                        {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDeleteUser(u.id, u.username)}
                          disabled={isRoot}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isRoot
                              ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                              : 'text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                          }`}
                          title={isRoot ? 'Root superadmin cannot be deleted' : 'Delete user'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {createdUserCredential ? (
              // Step 2: Show QR Code and Generated Credentials
              <div className="p-6 space-y-5">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    User Successfully Created!
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Scan the QR code below using Google Authenticator, 1Password, or Authy to complete 2FA setup.
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="p-4 bg-white rounded-xl border border-zinc-200 flex flex-col items-center justify-center max-w-[200px] mx-auto shadow-xs">
                  {createdUserCredential.qrCodeDataUrl ? (
                    <img
                      src={createdUserCredential.qrCodeDataUrl}
                      alt="TOTP Setup QR Code"
                      className="w-40 h-40 object-contain"
                    />
                  ) : (
                    <div className="w-40 h-40 flex items-center justify-center text-xs text-zinc-400 font-mono">
                      Generating QR...
                    </div>
                  )}
                </div>

                {/* Secret Key Display */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                    Manual 2FA Secret Key
                  </label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <code className="flex-1 font-mono text-xs text-purple-600 dark:text-purple-400 tracking-wider select-all truncate">
                      {createdUserCredential.totpSecret}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdUserCredential.totpSecret)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                      title="Copy Secret"
                    >
                      {copiedSecret ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* User Details Summary */}
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 text-xs space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Username:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{createdUserCredential.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Assigned Role:</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400 uppercase">{createdUserCredential.role}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCreatedUserCredential(null);
                    setIsCreateModalOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  Done & Close
                </button>
              </div>
            ) : (
              // Step 1: User Details Form
              <form onSubmit={handleCreateUser}>
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Create New Account
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm font-mono"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {/* Username */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="e.g. devops_dan"
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline font-mono"
                      >
                        Generate Strong Password
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter complex password"
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Role Selection */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Assigned Role
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setNewRole('superadmin')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          newRole === 'superadmin'
                            ? 'bg-purple-500/10 border-purple-500/50 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/30'
                            : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                        }`}
                      >
                        <div className="font-semibold text-xs mb-0.5">SuperAdmin</div>
                        <div className="text-[10px] text-zinc-400">Full shell & users</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewRole('operator')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          newRole === 'operator'
                            ? 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                            : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                        }`}
                      >
                        <div className="font-semibold text-xs mb-0.5">Operator</div>
                        <div className="text-[10px] text-zinc-400">Docker, Files, Ops</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewRole('viewer')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          newRole === 'viewer'
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                            : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                        }`}
                      >
                        <div className="font-semibold text-xs mb-0.5">Viewer</div>
                        <div className="text-[10px] text-zinc-400">Telemetry & Logs</div>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newUsername.trim() || !newPassword.trim()}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
                  >
                    {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Generate 2FA & Provision</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
