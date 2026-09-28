import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  Plus,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Cpu,
  HardDrive,
  Activity,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  RotateCw,
  Terminal,
  Key,
  Layers,
  Sparkles
} from 'lucide-react';
import AppCard from './AppCard';
import AppTable from './AppTable';
import DeployAppModal from './DeployAppModal';
import EnvManagerModal from './EnvManagerModal';
import LiveLogModal from './LiveLogModal';
import ConfirmModal from '../ConfirmModal';

export default function ProcessAppManager({ token, onShowToast, onNavigateTab }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [actionLoading, setActionLoading] = useState(null);

  // Modals state
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [activeLogApp, setActiveLogApp] = useState(null);
  const [activeEnvApp, setActiveEnvApp] = useState(null);
  const [appToDelete, setAppToDelete] = useState(null);

  // Fetch apps
  const fetchApps = useCallback(async (isManual = false) => {
    if (!token) return;
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/process', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setApps(data.apps || []);
      } else {
        if (isManual) onShowToast?.(data.error || 'Failed to fetch applications', 'error');
      }
    } catch (err) {
      if (isManual) onShowToast?.(err.message || 'Network error fetching applications', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onShowToast]);

  // Initial load and periodic polling (every 3.5 seconds)
  useEffect(() => {
    fetchApps();
    const timer = setInterval(() => {
      fetchApps();
    }, 3500);
    return () => clearInterval(timer);
  }, [fetchApps]);

  // App lifecycle action (start, stop, restart)
  const handleAction = async (name, action) => {
    setActionLoading(name);
    try {
      const res = await fetch(`/api/process/${encodeURIComponent(name)}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`Application "${name}" ${action} initiated successfully`, 'success');
        await fetchApps();
      } else {
        onShowToast?.(data.error || `Failed to ${action} ${name}`, 'error');
      }
    } catch (err) {
      onShowToast?.(err.message || `Network error during ${action}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Confirm delete app
  const confirmDelete = async () => {
    if (!appToDelete) return;
    const name = appToDelete;
    setActionLoading(name);
    try {
      const res = await fetch(`/api/process/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`Application "${name}" unit deleted successfully`, 'success');
        setAppToDelete(null);
        await fetchApps();
      } else {
        onShowToast?.(data.error || `Failed to delete ${name}`, 'error');
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error deleting application', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Metrics calculation
  const totalApps = apps.length;
  const runningApps = apps.filter(a => a.status === 'running').length;
  const failedApps = apps.filter(a => a.status === 'failed').length;
  const totalCpu = apps
    .reduce((acc, a) => acc + (a.status === 'running' ? (a.cpu || 0) : 0), 0)
    .toFixed(1);
  const totalRamMb = apps
    .reduce((acc, a) => acc + (a.status === 'running' ? (a.ramMb || 0) : 0), 0)
    .toFixed(1);

  // Filtered apps
  const filteredApps = apps.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.cmd && a.cmd.toLowerCase().includes(q)) ||
      (a.status && a.status.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Process &amp; Application Manager
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  PaaS
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Native systemd process supervision, automated restarts, environment isolation &amp; log streaming
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchApps(true)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shadow-xs cursor-pointer"
            title="Refresh application states"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsDeployModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
          >
            <Rocket className="w-4 h-4" />
            Deploy App
          </button>
        </div>
      </div>

      {/* Aggregate Telemetry Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Managed Units */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>Managed Units</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {totalApps}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            nc-app-*.service
          </div>
        </div>

        {/* Active Running */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>Running Units</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-500 flex items-center gap-2">
            {runningApps}
            {failedApps > 0 && (
              <span className="text-xs font-semibold text-rose-500 font-sans">
                ({failedApps} failed)
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            {totalApps > 0 ? `${Math.round((runningApps / totalApps) * 100)}% active` : 'No units deployed'}
          </div>
        </div>

        {/* Aggregate CPU */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>App CPU Total</span>
            <Cpu className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {totalCpu}%
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            Across {runningApps} live worker{runningApps === 1 ? '' : 's'}
          </div>
        </div>

        {/* Aggregate RAM */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>App RAM Total</span>
            <HardDrive className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {totalRamMb} MB
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            Resident Memory Footprint
          </div>
        </div>
      </div>

      {/* Filter and View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search applications by name, command, or status..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="inline-flex p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 shadow-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Apps View */}
      {loading ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Querying systemd units...
          </p>
          <p className="text-xs text-zinc-500 font-mono mt-1">
            systemctl list-units --type=service
          </p>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            {search ? 'No matching applications found' : 'No applications deployed yet'}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-5">
            {search
              ? 'Try adjusting your search criteria.'
              : 'Deploy your Node.js, Python, or Go microservices with native Linux systemd process supervision.'}
          </p>
          {!search && (
            <button
              onClick={() => setIsDeployModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Deploy First Application
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => (
            <AppCard
              key={app.name}
              app={app}
              onAction={handleAction}
              onOpenLogs={(name) => setActiveLogApp(name)}
              onOpenEnv={(name) => setActiveEnvApp(name)}
              onDelete={(name) => setAppToDelete(name)}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      ) : (
        <AppTable
          apps={filteredApps}
          onAction={handleAction}
          onOpenLogs={(name) => setActiveLogApp(name)}
          onOpenEnv={(name) => setActiveEnvApp(name)}
          onDelete={(name) => setAppToDelete(name)}
          actionLoading={actionLoading}
        />
      )}

      {/* Deploy App Modal */}
      <DeployAppModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        token={token}
        onShowToast={onShowToast}
        onCreated={() => fetchApps(true)}
      />

      {/* Environment Variable Manager Modal */}
      <EnvManagerModal
        isOpen={Boolean(activeEnvApp)}
        onClose={() => setActiveEnvApp(null)}
        appName={activeEnvApp}
        token={token}
        onShowToast={onShowToast}
        onUpdated={() => fetchApps(true)}
      />

      {/* Live Log Terminal Modal */}
      <LiveLogModal
        isOpen={Boolean(activeLogApp)}
        onClose={() => setActiveLogApp(null)}
        appName={activeLogApp}
        token={token}
        onShowToast={onShowToast}
      />

      {/* Confirm App Deletion Modal */}
      <ConfirmModal
        isOpen={Boolean(appToDelete)}
        title={`Delete Application: ${appToDelete}`}
        message={`Are you sure you want to tear down "nc-app-${appToDelete}.service"? This will stop the process, disable the systemd service, and remove the unit configuration file.`}
        confirmText="Tear Down & Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setAppToDelete(null)}
      />
    </div>
  );
}
