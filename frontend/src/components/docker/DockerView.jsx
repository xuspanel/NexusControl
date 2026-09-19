import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Play,
  Square,
  RotateCw,
  Trash2,
  Terminal,
  RefreshCw,
  Search,
  Eye,
  AlertTriangle,
  Cpu,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import ContainerInspectModal from './ContainerInspectModal';

export default function DockerView({ token, telemetry, onShowToast, onExecContainer }) {
  const [containers, setContainers] = useState([]);
  const [dockerStatus, setDockerStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState(null); // containerId:action

  // Inspect Modal state
  const [inspectContainer, setInspectContainer] = useState(null);
  const [inspectDetails, setInspectDetails] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Confirm Delete Modal state
  const [deletePending, setDeletePending] = useState(null);

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const fetchDockerData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [statusRes, containersRes] = await Promise.all([
        fetch('/api/docker/status', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/docker/containers', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setDockerStatus(statusData);
      }

      if (containersRes.ok) {
        const containersData = await containersRes.json();
        setContainers(Array.isArray(containersData) ? containersData : []);
      }
    } catch (err) {
      console.error('Failed to fetch docker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDockerData();
    const interval = setInterval(fetchDockerData, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // Merge live telemetry container stats if available from SSE
  const sseContainers = telemetry?.containers?.containers || [];
  const sseMap = new Map(sseContainers.map(c => [c.id, c]));

  const displayContainers = containers.map(c => {
    const live = sseMap.get(c.id);
    if (live) {
      return {
        ...c,
        cpuPercent: live.cpuPercent,
        memUsed: live.memUsed,
        memLimit: live.memLimit,
        memPercent: live.memPercent,
        netRx: live.netRx,
        netTx: live.netTx
      };
    }
    return c;
  });

  const filteredContainers = displayContainers.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.image && c.image.toLowerCase().includes(q)) ||
      (c.shortId && c.shortId.toLowerCase().includes(q)) ||
      (c.state && c.state.toLowerCase().includes(q))
    );
  });

  const handleContainerAction = async (id, name, action) => {
    setActionInProgress(`${id}:${action}`);
    try {
      const res = await fetch(`/api/docker/containers/${encodeURIComponent(id)}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to ${action} container`);
      }

      onShowToast?.(`Container '${name}' ${action}ed successfully`, 'success');
      await fetchDockerData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletePending) return;
    const { id, name } = deletePending;
    setDeletePending(null);
    setActionInProgress(`${id}:delete`);

    try {
      const res = await fetch(`/api/docker/containers/${encodeURIComponent(id)}?force=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete container');
      }

      onShowToast?.(`Container '${name}' deleted successfully`, 'success');
      await fetchDockerData();
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenInspect = async (container) => {
    setInspectContainer(container);
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/docker/containers/${encodeURIComponent(container.id)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const details = await res.json();
        setInspectDetails(details);
      }
    } catch (err) {
      console.error('Failed to inspect container:', err);
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Docker Engine Spec Bar */}
      <div className="nx-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Enterprise Docker Engine
                </h1>
                {dockerStatus?.available && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold">
                    v{dockerStatus.version}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                  dockerStatus?.available
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dockerStatus?.available ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {dockerStatus?.available ? 'DAEMON READY' : 'DAEMON OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Native Unix Socket (/var/run/docker.sock) • Real-time orchestration and telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search containers..."
                className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-sky-500 w-44 sm:w-60 transition-colors"
              />
            </div>

            <button
              onClick={fetchDockerData}
              title="Refresh Containers"
              className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Counter Pills */}
        {dockerStatus?.available && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/80">
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">Total Containers</span>
              <span className="text-sm font-semibold font-mono text-zinc-900 dark:text-zinc-100">{containers.length}</span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">Running</span>
              <span className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                {containers.filter(c => c.state === 'running').length}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">Stopped / Exited</span>
              <span className="text-sm font-semibold font-mono text-zinc-500">
                {containers.filter(c => c.state !== 'running').length}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">Total Images</span>
              <span className="text-sm font-semibold font-mono text-sky-600 dark:text-sky-400">{dockerStatus.imagesCount || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Offline Alert Banner */}
      {dockerStatus && !dockerStatus.available && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              Docker Engine Socket Inactive
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
              The Docker daemon is either stopped or `/var/run/docker.sock` is unreachable. Start the Docker service on the host:
            </p>
            <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 text-zinc-100 font-mono text-[11px]">
              <code>systemctl start docker</code>
            </div>
          </div>
        </div>
      )}

      {/* Main Containers High-Density Table */}
      <div className="nx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider bg-zinc-50/80 dark:bg-[#09090b]">
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Name & Image</th>
                <th className="py-3 px-4">State & Uptime</th>
                <th className="py-3 px-4">Resource Utilization</th>
                <th className="py-3 px-4">Ports</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
              {filteredContainers.map((c) => {
                const isRunning = c.state === 'running';
                const isBusy = actionInProgress && actionInProgress.startsWith(c.id);

                return (
                  <tr 
                    key={c.id} 
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                    onClick={() => handleOpenInspect(c)}
                  >
                    {/* Status Badge */}
                    <td className="py-3 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isRunning 
                            ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' 
                            : 'bg-zinc-400 dark:bg-zinc-600'
                        }`} />
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${
                          isRunning
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                        }`}>
                          {c.state}
                        </span>
                      </div>
                    </td>

                    {/* Name & Image */}
                    <td className="py-3 px-4 max-w-[220px]">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                        <span>{c.name}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">({c.shortId})</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5" title={c.image}>
                        {c.image}
                      </div>
                    </td>

                    {/* State & Uptime */}
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400 text-[11px]">
                      {c.status}
                    </td>

                    {/* Resource Utilization (Live SSE telemetry) */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isRunning ? (
                        <div className="space-y-1 min-w-[130px]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">CPU:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{c.cpuPercent || 0}%</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">RAM:</span>
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {formatBytes(c.memUsed)} <span className="text-zinc-400">/ {formatBytes(c.memLimit)}</span>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-[11px] italic">Stopped</span>
                      )}
                    </td>

                    {/* Ports */}
                    <td className="py-3 px-4">
                      {c.ports && c.ports.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {c.ports.slice(0, 2).map((p, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                              {p}
                            </span>
                          ))}
                          {c.ports.length > 2 && (
                            <span className="text-[10px] text-zinc-400 font-mono self-center">
                              +{c.ports.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5">
                        {/* Terminal Shell Bridge Quick Action */}
                        {isRunning && onExecContainer && (
                          <button
                            onClick={() => onExecContainer(c.name)}
                            title={`Drop into ${c.name} container shell`}
                            className="p-1.5 rounded-md bg-zinc-100 hover:bg-emerald-50 dark:bg-zinc-900 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Lifecycle buttons */}
                        {isRunning ? (
                          <>
                            <button
                              onClick={() => handleContainerAction(c.id, c.name, 'restart')}
                              disabled={isBusy}
                              title="Restart Container"
                              className="p-1.5 rounded-md bg-zinc-100 hover:bg-sky-50 dark:bg-zinc-900 dark:hover:bg-sky-500/10 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-sky-600 dark:text-zinc-400 dark:hover:text-sky-400 transition-colors disabled:opacity-40"
                            >
                              <RotateCw className={`w-3.5 h-3.5 ${actionInProgress === `${c.id}:restart` ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleContainerAction(c.id, c.name, 'stop')}
                              disabled={isBusy}
                              title="Stop Container"
                              className="p-1.5 rounded-md bg-zinc-100 hover:bg-amber-50 dark:bg-zinc-900 dark:hover:bg-amber-500/10 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 transition-colors disabled:opacity-40"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleContainerAction(c.id, c.name, 'start')}
                            disabled={isBusy}
                            title="Start Container"
                            className="p-1.5 rounded-md bg-zinc-100 hover:bg-emerald-50 dark:bg-zinc-900 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors disabled:opacity-40"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Inspect Details Button */}
                        <button
                          onClick={() => handleOpenInspect(c)}
                          title="Inspect Container Config & Env"
                          className="p-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setDeletePending(c)}
                          disabled={isBusy}
                          title="Delete Container"
                          className="p-1.5 rounded-md bg-zinc-100 hover:bg-rose-50 dark:bg-zinc-900 dark:hover:bg-rose-500/10 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredContainers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {searchQuery ? 'No containers matching search query.' : 'No active or stopped Docker containers found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Deletion */}
      <ConfirmModal
        isOpen={!!deletePending}
        title="Delete Container"
        message={`Are you sure you want to delete container '${deletePending?.name}' (${deletePending?.shortId})? This action will permanently remove the container state and cannot be undone.`}
        confirmText="Delete Container"
        danger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletePending(null)}
      />

      {/* Container Inspection Drawer / Modal */}
      <ContainerInspectModal
        isOpen={!!inspectContainer}
        container={inspectContainer}
        rawDetails={inspectDetails}
        onShowToast={onShowToast}
        onClose={() => {
          setInspectContainer(null);
          setInspectDetails(null);
        }}
      />
    </div>
  );
}
