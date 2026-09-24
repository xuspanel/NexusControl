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
  Settings,
  Sliders,
  Folder,
  Plus,
  Boxes,
  CheckSquare,
  Square,
  X,
  Edit3,
  Download
} from 'lucide-react';

const MODULE_DEFINITIONS = [
  { id: 'overview', label: 'Overview & Telemetry', desc: 'Real-time hardware stats, system processes & services' },
  { id: 'files', label: 'Files Manager', desc: 'File explorer, code editor, permissions & upload pipeline' },
  { id: 'docker', label: 'Docker Engine', desc: 'Container lifecycle, inspect, stats & orchestration' },
  { id: 'terminal', label: 'Root Terminal', desc: 'Interactive root pseudo-terminal bash shell' },
  { id: 'vhosts', label: 'Domains & Proxy', desc: 'Nginx virtual hosts, reverse proxy & SSL certificates' },
  { id: 'backups', label: 'Backups & Cloud', desc: 'System snapshots, S3/GDrive replication & restore' },
  { id: 'audit', label: 'Audit Log', desc: 'Cryptographic SHA-256 tamper-evident security ledger' }
];

const DEFAULT_POLICY = {
  modules: {
    overview: true,
    files: true,
    docker: false,
    terminal: false,
    vhosts: false,
    backups: false,
    audit: false
  },
  resources: {
    allowed_directories: ['/var/www/html'],
    allowed_containers: []
  }
};

export default function UsersView({ token, onShowToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live docker containers for policy builder dropdown
  const [availableContainers, setAvailableContainers] = useState([]);

  // User creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newPolicy, setNewPolicy] = useState(DEFAULT_POLICY);
  const [newPathInput, setNewPathInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Policy edit modal state for existing user
  const [editingUser, setEditingUser] = useState(null);
  const [editPolicyState, setEditPolicyState] = useState(DEFAULT_POLICY);
  const [editPathInput, setEditPathInput] = useState('');
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);

  // Success credential state (shows QR code & TOTP secret)
  const [createdUserCredential, setCreatedUserCredential] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedVpnConfig, setCopiedVpnConfig] = useState(false);
  const [generateVpn, setGenerateVpn] = useState(false);
  const [vpnFullTunnel, setVpnFullTunnel] = useState(false);
  const [activeCredentialTab, setActiveCredentialTab] = useState('2fa');

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch('/api/docker/containers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableContainers(Array.isArray(data) ? data : []);
      }
    } catch {
      // Fallback demo container list if docker daemon is not active
      setAvailableContainers([
        { id: 'nexus-demo-service', name: 'nexus-demo-service', state: 'running' }
      ]);
    }
  }, [token]);

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
    fetchContainers();
  }, [fetchUsers, fetchContainers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      onShowToast?.('Username and password are required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        granular_policies: newRole === 'custom' ? newPolicy : null,
        generate_vpn: generateVpn,
        vpn_full_tunnel: vpnFullTunnel
      };

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
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
        password: newPassword,
        vpnProfile: data.vpnProfile || null
      });
      setActiveCredentialTab('2fa');

      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
      setNewPolicy(DEFAULT_POLICY);
      setGenerateVpn(false);
      setVpnFullTunnel(false);
      fetchUsers();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (userId, targetRole) => {
    try {
      const targetUser = users.find(u => u.id === userId);
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          role: targetRole,
          granular_policies: targetRole === 'custom' ? (targetUser?.granular_policies || DEFAULT_POLICY) : null
        })
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

  const handleSavePolicyEdit = async () => {
    if (!editingUser) return;
    setIsUpdatingPolicy(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}/policies`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ granular_policies: editPolicyState })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user policy');
      }

      onShowToast?.(`Policy updated for ${editingUser.username}`, 'success');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setIsUpdatingPolicy(false);
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
    { superadmin: 0, operator: 0, viewer: 0, custom: 0 }
  );

  // Helper to render the Visual Policy Builder form components
  const renderPolicyBuilder = (policyState, setPolicyState, pathInput, setPathInput) => {
    const modules = policyState.modules || {};
    const resources = policyState.resources || { allowed_directories: [], allowed_containers: [] };
    const allowedDirs = resources.allowed_directories || [];
    const allowedContainers = resources.allowed_containers || [];
    const isWildcardContainer = allowedContainers.includes('*');

    const toggleModule = (modId) => {
      setPolicyState(prev => ({
        ...prev,
        modules: {
          ...prev.modules,
          [modId]: !prev.modules?.[modId]
        }
      }));
    };

    const addDirectory = (pathToAdd) => {
      const target = (pathToAdd || pathInput).trim();
      if (!target) return;
      if (!target.startsWith('/')) {
        onShowToast?.('Directory path must be absolute (starting with /)', 'error');
        return;
      }
      if (allowedDirs.includes(target)) return;
      setPolicyState(prev => ({
        ...prev,
        resources: {
          ...prev.resources,
          allowed_directories: [...(prev.resources?.allowed_directories || []), target]
        }
      }));
      setPathInput('');
    };

    const removeDirectory = (dirToRemove) => {
      setPolicyState(prev => ({
        ...prev,
        resources: {
          ...prev.resources,
          allowed_directories: (prev.resources?.allowed_directories || []).filter(d => d !== dirToRemove)
        }
      }));
    };

    const toggleWildcardContainers = () => {
      setPolicyState(prev => ({
        ...prev,
        resources: {
          ...prev.resources,
          allowed_containers: isWildcardContainer ? [] : ['*']
        }
      }));
    };

    const toggleContainer = (containerName) => {
      if (isWildcardContainer) return;
      setPolicyState(prev => {
        const current = prev.resources?.allowed_containers || [];
        const next = current.includes(containerName)
          ? current.filter(c => c !== containerName)
          : [...current, containerName];
        return {
          ...prev,
          resources: {
            ...prev.resources,
            allowed_containers: next
          }
        };
      });
    };

    return (
      <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono">
            Fine-Grained Policy Builder
          </h4>
        </div>

        {/* 1. Module Permissions Grid */}
        <div className="space-y-2">
          <label className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            1. Module Access Switches
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODULE_DEFINITIONS.map(mod => {
              const enabled = Boolean(modules[mod.id]);
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => toggleModule(mod.id)}
                  className={`p-2.5 rounded-xl border text-left flex items-start justify-between transition-all ${
                    enabled
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                      : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-500'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold">{mod.label}</div>
                    <div className="text-[10px] text-zinc-400 truncate">{mod.desc}</div>
                  </div>
                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                    enabled ? 'bg-emerald-500 text-white' : 'border border-zinc-300 dark:border-zinc-700'
                  }`}>
                    {enabled && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. File System Directory Jail */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              2. File System Jail (Allowed Directories)
            </label>
            <span className="text-[10px] font-mono text-emerald-500 font-semibold">
              Strict Traversal Protection
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDirectory();
                  }
                }}
                placeholder="e.g. /var/www/html or /opt/nexus-data"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={() => addDirectory()}
              className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Path</span>
            </button>
          </div>

          {/* Preset Chips */}
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
            <span className="text-zinc-400 self-center">Presets:</span>
            {['/var/www/html', '/opt/nexus-demo-data', '/home', '/etc/nginx'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => addDirectory(p)}
                className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-emerald-500/15 hover:text-emerald-600 transition-colors"
              >
                + {p}
              </button>
            ))}
          </div>

          {/* Directory Pill List */}
          <div className="space-y-1.5 max-h-28 overflow-y-auto">
            {allowedDirs.length === 0 ? (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>No directories specified. User will have zero file access.</span>
              </div>
            ) : (
              allowedDirs.map(d => (
                <div
                  key={d}
                  className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                >
                  <span className="text-zinc-800 dark:text-zinc-200 truncate">{d}</span>
                  <button
                    type="button"
                    onClick={() => removeDirectory(d)}
                    className="text-zinc-400 hover:text-rose-500 p-0.5"
                    title="Remove path"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. Docker Container Jail */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              3. Docker Container Jail
            </label>
            <button
              type="button"
              onClick={toggleWildcardContainers}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                isWildcardContainer
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500'
              }`}
            >
              {isWildcardContainer ? '✓ All Containers (* Wildcard)' : '+ Enable All Containers (*)'}
            </button>
          </div>

          {!isWildcardContainer && (
            <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-1.5 max-h-36 overflow-y-auto">
              {availableContainers.length === 0 ? (
                <div className="text-[11px] font-mono text-zinc-400 text-center py-2">
                  No active containers detected on host.
                </div>
              ) : (
                availableContainers.map(c => {
                  const cName = c.name || c.id?.slice(0, 12);
                  const isChecked = allowedContainers.includes(cName) || allowedContainers.includes(c.id);
                  return (
                    <label
                      key={c.id || cName}
                      className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleContainer(cName)}
                          className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">{cName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">{c.state || 'active'}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

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
              Role-Based Access Control (RBAC), Fine-Grained Policies (FGAC), and cryptographic TOTP 2FA
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

      {/* 2. RBAC & FGAC Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <p className="text-[11px] text-zinc-400">Docker, Files, Domains, Backups</p>
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
            <p className="text-[11px] text-zinc-400">Read-only Telemetry & Audit</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Eye className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-500" />
              <span>Custom (FGAC)</span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {roleCounts.custom || 0}
            </div>
            <p className="text-[11px] text-zinc-400">Jailed directories & containers</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Sliders className="w-5 h-5" />
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
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Granular Scope</th>
                  <th className="py-3 px-4">2FA Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {users.map((u) => {
                  const isRoot = u.username === 'admin';
                  const isCustom = u.role === 'custom';
                  const policies = u.granular_policies;

                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs uppercase ${
                            u.role === 'superadmin'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : u.role === 'operator'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : u.role === 'custom'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
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
                              : u.role === 'custom'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          } ${isRoot ? 'opacity-70 cursor-not-allowed' : 'hover:border-purple-500'}`}
                        >
                          <option value="superadmin" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            SuperAdmin
                          </option>
                          <option value="operator" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            Operator
                          </option>
                          <option value="viewer" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            Viewer
                          </option>
                          <option value="custom" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                            Custom (FGAC)
                          </option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4">
                        {isCustom ? (
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-mono space-y-0.5">
                              <div className="text-zinc-600 dark:text-zinc-300">
                                Modules: {Object.entries(policies?.modules || {}).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'none'}
                              </div>
                              <div className="text-zinc-400">
                                Jails: {policies?.resources?.allowed_directories?.length || 0} dirs • {policies?.resources?.allowed_containers?.length || 0} containers
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setEditPolicyState(u.granular_policies || DEFAULT_POLICY);
                              }}
                              className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500/20 hover:text-emerald-600 text-[10px] font-medium transition-colors shrink-0 flex items-center gap-1"
                              title="Edit User Policy"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Policy</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-[11px] font-mono">
                            {u.role === 'superadmin' ? 'Unrestricted Root' : 'Standard Role Matrix'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {u.two_factor_enabled ? (
                          <div className="flex items-center space-x-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                              Enforced (TOTP)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                            <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[11px]">
                              Disabled
                            </span>
                          </div>
                        )}
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

      {/* 4. Edit Existing User Policy Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Edit Custom Policy: {editingUser.username}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Changes apply immediately in real-time without re-login
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {renderPolicyBuilder(editPolicyState, setEditPolicyState, editPathInput, setEditPathInput)}
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePolicyEdit}
                disabled={isUpdatingPolicy}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
              >
                {isUpdatingPolicy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Live Policy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {createdUserCredential ? (
              // Step 2: Show QR Code and Generated Credentials
              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    User Successfully Created!
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {createdUserCredential.vpnProfile
                      ? 'Configure user 2FA and download or scan the WireGuard Zero Trust VPN profile.'
                      : 'Scan the QR code below using Google Authenticator, 1Password, or Authy to complete 2FA setup.'}
                  </p>
                </div>

                {/* Segmented Tab Switcher if VPN Profile exists */}
                {createdUserCredential.vpnProfile && (
                  <div className="flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setActiveCredentialTab('2fa')}
                      className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        activeCredentialTab === '2fa'
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold'
                          : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5 text-purple-500" />
                      2FA Authenticator Setup
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCredentialTab('vpn')}
                      className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        activeCredentialTab === 'vpn'
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold'
                          : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5 text-emerald-500" />
                      WireGuard VPN Profile
                    </button>
                  </div>
                )}

                {activeCredentialTab === 'vpn' && createdUserCredential.vpnProfile ? (
                  <div className="space-y-4">
                    {/* WireGuard QR Code Container */}
                    <div className="p-4 bg-white rounded-xl border border-zinc-200 flex flex-col items-center justify-center max-w-[200px] mx-auto shadow-xs">
                      {createdUserCredential.vpnProfile.qrCodeDataUrl ? (
                        <img
                          src={createdUserCredential.vpnProfile.qrCodeDataUrl}
                          alt="WireGuard Mobile QR Code"
                          className="w-40 h-40 object-contain"
                        />
                      ) : (
                        <div className="w-40 h-40 flex items-center justify-center text-xs text-zinc-400 font-mono">
                          Generating QR...
                        </div>
                      )}
                    </div>
                    <div className="text-center text-[11px] font-mono text-zinc-500">
                      Assigned Internal IP: <span className="font-bold text-emerald-500">{createdUserCredential.vpnProfile.internalIp}/32</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([createdUserCredential.vpnProfile.clientConfig], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${createdUserCredential.username}-wg0.conf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .conf Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(createdUserCredential.vpnProfile.clientConfig);
                          setCopiedVpnConfig(true);
                          setTimeout(() => setCopiedVpnConfig(false), 2000);
                        }}
                        className="py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        {copiedVpnConfig ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedVpnConfig ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}

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
                  {createdUserCredential.vpnProfile && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">WireGuard VPN IP:</span>
                      <span className="font-semibold text-emerald-500">{createdUserCredential.vpnProfile.internalIp}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setCreatedUserCredential(null);
                    setIsCreateModalOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold transition-colors"
                >
                  I have saved credentials & keys
                </button>
              </div>
            ) : (
              // Step 1: User Details Form & Visual Policy Builder
              <form onSubmit={handleCreateUser} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
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

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
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

                  {/* Role Selection (4 roles) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Assigned Role
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                        <div className="text-[10px] text-zinc-400">Full shell & root</div>
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

                      <button
                        type="button"
                        onClick={() => setNewRole('custom')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          newRole === 'custom'
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30'
                            : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                        }`}
                      >
                        <div className="font-semibold text-xs mb-0.5">Custom</div>
                        <div className="text-[10px] text-zinc-400">Granular FGAC</div>
                      </button>
                    </div>
                  </div>

                  {/* If Custom Role selected, reveal Visual Policy Builder */}
                  {newRole === 'custom' && renderPolicyBuilder(newPolicy, setNewPolicy, newPathInput, setNewPathInput)}

                  {/* WireGuard Zero Trust VPN Profile Provisioning Checkbox */}
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            Generate WireGuard VPN Profile
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            Assigns a 10.8.0.x IP address and renders mobile/desktop configuration QR code
                          </div>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={generateVpn}
                          onChange={(e) => setGenerateVpn(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>

                    {generateVpn && (
                      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                          Tunnel Routing Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => setVpnFullTunnel(false)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all text-center ${
                              !vpnFullTunnel
                                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                          >
                            Split Tunnel (10.8.0.0/24)
                          </button>
                          <button
                            type="button"
                            onClick={() => setVpnFullTunnel(true)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all text-center ${
                              vpnFullTunnel
                                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                          >
                            Full Tunnel (0.0.0.0/0)
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {!vpnFullTunnel
                            ? 'Recommended: Only routes panel & VPS subnet traffic through the VPN. Normal internet remains direct.'
                            : 'Routes all device internet traffic through VPS with NAT masquerading.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5 shrink-0">
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
