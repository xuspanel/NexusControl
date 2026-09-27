import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  HardDrive,
  Layers,
  ShieldCheck,
  Terminal,
  ExternalLink,
  X,
  Loader2,
  Server,
  Info,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  FileCode,
  Key
} from 'lucide-react';

export default function PostgresManager({ token, onShowToast, onNavigateTab }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [dbToDelete, setDbToDelete] = useState(null);
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  // Fetch status and databases
  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Fetch status
      const statusRes = await fetch('/api/postgres/status', { headers: authHeaders });
      const statusData = await statusRes.json();

      if (!statusRes.ok || !statusData.success) {
        throw new Error(statusData.error || 'Failed to check PostgreSQL status');
      }

      setStatus(statusData.status);

      // 2. If active, fetch databases list
      if (statusData.status?.active) {
        const dbRes = await fetch('/api/postgres/databases', { headers: authHeaders });
        const dbData = await dbRes.json();
        if (dbRes.ok && dbData.success) {
          setDatabases(dbData.databases || []);
        } else {
          setDatabases([]);
        }
      } else {
        setDatabases([]);
      }

      if (isManual && onShowToast) {
        onShowToast('PostgreSQL instance state refreshed', 'info');
      }
    } catch (err) {
      console.error('[PostgresManager] Error loading data:', err);
      setError(err.message || 'Error communicating with PostgreSQL engine');
      if (isManual && onShowToast) {
        onShowToast(err.message || 'Error refreshing instance', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders, onShowToast]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Handle Create Database
  const handleCreateDatabase = async (e) => {
    e.preventDefault();
    if (!newDbName.trim()) return;

    setIsCreating(true);
    setCreateError('');

    try {
      const res = await fetch('/api/postgres/databases', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: newDbName.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create database');
      }

      if (onShowToast) {
        onShowToast(`Database "${data.database}" provisioned successfully`, 'success');
      }

      setIsCreateModalOpen(false);
      setNewDbName('');
      fetchData(false);
    } catch (err) {
      setCreateError(err.message || 'Failed to create database');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Drop Database
  const handleDropDatabase = async () => {
    if (!dbToDelete) return;
    if (confirmDeleteInput !== dbToDelete.name) {
      setDeleteError(`Please type "${dbToDelete.name}" exactly to confirm.`);
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      const res = await fetch(`/api/postgres/databases/${encodeURIComponent(dbToDelete.name)}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to drop database');
      }

      if (onShowToast) {
        onShowToast(`Database "${dbToDelete.name}" dropped successfully`, 'success');
      }

      setDbToDelete(null);
      setConfirmDeleteInput('');
      fetchData(false);
    } catch (err) {
      setDeleteError(err.message || 'Failed to drop database');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered databases
  const filteredDbs = useMemo(() => {
    if (!searchQuery.trim()) return databases;
    const q = searchQuery.toLowerCase();
    return databases.filter(db =>
      db.name?.toLowerCase().includes(q) ||
      db.owner?.toLowerCase().includes(q) ||
      db.charset?.toLowerCase().includes(q)
    );
  }, [databases, searchQuery]);

  // Aggregate stats
  const totalSizeBytes = useMemo(() => {
    return databases.reduce((acc, db) => acc + (parseInt(db.size_bytes, 10) || 0), 0);
  }, [databases]);

  const formattedTotalSize = useMemo(() => {
    if (totalSizeBytes === 0) return '0 B';
    const units = ['B', 'kB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(totalSizeBytes) / Math.log(1024));
    return `${(totalSizeBytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }, [totalSizeBytes]);

  // 1. Loading State
  if (loading && !status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Database className="w-7 h-7 animate-pulse" />
          </div>
          <div className="absolute inset-0 rounded-2xl border border-cyan-500/30 animate-ping pointer-events-none" />
        </div>
        <div className="text-sm font-mono text-zinc-400">Connecting to PostgreSQL engine...</div>
      </div>
    );
  }

  // 2. Graceful Fallback: PostgreSQL Not Installed
  if (status && !status.installed) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-8 shadow-xs text-center max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              PostgreSQL is not installed on this VPS
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              NexusControl could not locate the <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-xs">psql</code> binary on the system search path.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 text-left text-xs text-zinc-600 dark:text-zinc-300 space-y-2 font-mono">
            <div className="flex items-center gap-2 text-zinc-400 font-sans font-semibold">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span>Quick Install via Terminal:</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black text-emerald-400 select-all overflow-x-auto">
              sudo apt-get install -y postgresql postgresql-contrib
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigateTab ? onNavigateTab('updates') : window.location.hash = '#updates'}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Install via OS System Updates</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Re-check Engine</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Fallback: PostgreSQL Installed but Stopped/Inactive
  if (status && !status.active) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-8 shadow-xs text-center max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              PostgreSQL Service is Inactive
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              PostgreSQL is installed on this host, but the database daemon is currently stopped or refusing connections on port 5432.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 text-left text-xs text-zinc-600 dark:text-zinc-300 space-y-2 font-mono">
            <div className="flex items-center gap-2 text-zinc-400 font-sans font-semibold">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span>Start PostgreSQL Service:</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black text-emerald-400 select-all overflow-x-auto">
              sudo systemctl start postgresql && sudo systemctl enable postgresql
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Main Active Dashboard
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0 shadow-inner">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                PostgreSQL Database Management
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Host instance supervisor, provisioner, and automated Superuser connection pool
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Refresh database catalogs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setNewDbName('');
              setCreateError('');
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 hover:shadow-cyan-600/35 transition-all transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Database</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Databases */}
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Databases</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {databases.length}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono flex items-center gap-1">
            <span>Excludes system templates</span>
          </div>
        </div>

        {/* Total Cluster Size */}
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Storage Used</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {formattedTotalSize}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono">
            Across {databases.length} active catalog(s)
          </div>
        </div>

        {/* Global Superuser Pool */}
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Connection Pool</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 truncate">
            {status?.currentUser || 'nexuscontrol'}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Port {status?.port || 5432} • Pool Active
          </div>
        </div>

        {/* PostgreSQL Version */}
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Engine Release</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 truncate">
            {status?.version ? status.version.split(' ')[1] : 'v16+'}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono truncate">
            {status?.version ? status.version.split(' on ')[0] : 'PostgreSQL Engine'}
          </div>
        </div>
      </div>

      {/* 3. Database Table Section */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
        {/* Search & Table Header Toolbar */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search databases by name, owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-xs font-mono text-zinc-500">
            Showing {filteredDbs.length} of {databases.length} database(s)
          </div>
        </div>

        {/* Database List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
                <th className="py-3 px-4 font-semibold">Database Name</th>
                <th className="py-3 px-4 font-semibold">Owner</th>
                <th className="py-3 px-4 font-semibold">Disk Size</th>
                <th className="py-3 px-4 font-semibold">Encoding</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60 font-mono">
              {filteredDbs.length > 0 ? (
                filteredDbs.map((db) => {
                  const isSystem = db.name === 'postgres';
                  return (
                    <tr
                      key={db.name}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
                    >
                      {/* Name */}
                      <td className="py-3.5 px-4 font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
                          <Database className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span>{db.name}</span>
                            {isSystem && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700">
                                System Catalog
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-[11px]">
                          <Key className="w-3 h-3 text-zinc-400" />
                          {db.owner}
                        </span>
                      </td>

                      {/* Size */}
                      <td className="py-3.5 px-4 text-zinc-900 dark:text-zinc-200 font-medium">
                        {db.size}
                      </td>

                      {/* Encoding / Charset */}
                      <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400">
                        <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-[10px]">
                          {db.charset || 'UTF8'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isSystem ? (
                          <span className="text-[11px] text-zinc-400 italic font-sans pr-2">Protected</span>
                        ) : (
                          <button
                            onClick={() => {
                              setDbToDelete(db);
                              setConfirmDeleteInput('');
                              setDeleteError('');
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title={`Drop database "${db.name}"`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    {searchQuery ? `No databases matched "${searchQuery}".` : 'No databases found on this PostgreSQL cluster.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modal: Create Database */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Provision New PostgreSQL Database
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDatabase} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Database Identifier
                </label>
                <input
                  type="text"
                  placeholder="e.g. app_production"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-mono focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-zinc-500">
                  Alphanumeric characters and underscores only (max 63 chars).
                </p>
              </div>

              {createError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newDbName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{isCreating ? 'Provisioning...' : 'Provision Database'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Strict Confirm Drop Database */}
      {dbToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Drop Database "{dbToDelete.name}"?
                </h3>
                <p className="text-xs text-zinc-500">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 space-y-1">
              <p className="font-semibold">⚠️ Critical Data Loss Warning:</p>
              <p className="text-[11px] opacity-90">
                All tables, views, schemas, and stored records ({dbToDelete.size}) inside{' '}
                <strong className="font-mono text-white">{dbToDelete.name}</strong> will be wiped immediately. Active client connections will be forcefully terminated.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Type <span className="font-mono text-rose-500 font-bold select-all">{dbToDelete.name}</span> to confirm:
              </label>
              <input
                type="text"
                placeholder={dbToDelete.name}
                value={confirmDeleteInput}
                onChange={(e) => setConfirmDeleteInput(e.target.value)}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDbToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDropDatabase}
                disabled={isDeleting || confirmDeleteInput !== dbToDelete.name}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? 'Dropping...' : 'Confirm Drop Database'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
