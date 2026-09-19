import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  XCircle, 
  Flame, 
  CheckCircle2 
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function ProcessManager({ token, onShowToast }) {
  const [processes, setProcesses] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('cpu');
  const [loading, setLoading] = useState(false);
  const [selectedProc, setSelectedProc] = useState(null);
  const [signalType, setSignalType] = useState('SIGTERM');

  const fetchProcesses = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/system/processes?limit=25', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProcesses(data);
      }
    } catch (err) {
      console.error('Failed to fetch processes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 4000);
    return () => clearInterval(interval);
  }, [token]);

  const handleKill = (proc, sig) => {
    setSelectedProc(proc);
    setSignalType(sig);
  };

  const confirmKill = async () => {
    if (!selectedProc) return;
    try {
      const res = await fetch('/api/system/processes/signal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pid: selectedProc.pid, signal: signalType })
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`Successfully sent ${signalType} to PID ${selectedProc.pid}`, 'success');
        fetchProcesses();
      } else {
        onShowToast?.(data.error || 'Failed to dispatch signal', 'error');
      }
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setSelectedProc(null);
    }
  };

  // Filter and sort processes
  const filtered = processes
    .filter(p => {
      const term = search.toLowerCase();
      return (
        p.command.toLowerCase().includes(term) ||
        p.user.toLowerCase().includes(term) ||
        p.pid.toString().includes(term)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'mem') return b.mem - a.mem;
      return b.cpu - a.cpu;
    });

  return (
    <div className="nx-card p-5">
      {/* Header with Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800/80 mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Live Process Manager
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Top system resource consumers & process controls</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, PID, user..."
              className="bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 font-mono w-48 sm:w-60 transition-colors"
            />
          </div>

          {/* Sort Buttons */}
          <div className="inline-flex bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setSortBy('cpu')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                sortBy === 'cpu' ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              CPU%
            </button>
            <button
              onClick={() => setSortBy('mem')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                sortBy === 'mem' ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              RAM%
            </button>
          </div>

          <button
            onClick={fetchProcesses}
            title="Refresh process list"
            className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Process Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800/60 text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider">
              <th className="py-2.5 px-3">PID</th>
              <th className="py-2.5 px-3">User</th>
              <th className="py-2.5 px-3">CPU %</th>
              <th className="py-2.5 px-3">RAM %</th>
              <th className="py-2.5 px-3">Elapsed</th>
              <th className="py-2.5 px-3">Command</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40">
            {filtered.slice(0, 15).map((p) => (
              <tr key={p.pid} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                <td className="py-2.5 px-3 text-zinc-800 dark:text-zinc-300 font-semibold">{p.pid}</td>
                <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">{p.user}</td>
                <td className="py-2.5 px-3">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                    p.cpu > 50 ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : p.cpu > 10 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'
                  }`}>
                    {p.cpu.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] ${
                    p.mem > 30 ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'
                  }`}>
                    {p.mem.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 text-[11px]">{p.uptime}</td>
                <td className="py-2.5 px-3 text-zinc-800 dark:text-zinc-200 max-w-xs truncate" title={p.command}>
                  {p.command}
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center space-x-1">
                    <button
                      onClick={() => handleKill(p, 'SIGTERM')}
                      title="Send SIGTERM (Graceful Terminate)"
                      className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/30 transition-colors text-[10px] cursor-pointer"
                    >
                      TERM
                    </button>
                    <button
                      onClick={() => handleKill(p, 'SIGKILL')}
                      title="Send SIGKILL (Force Terminate)"
                      className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-300 dark:hover:border-rose-500/30 transition-colors text-[10px] cursor-pointer"
                    >
                      KILL
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-zinc-400 dark:text-zinc-500">
                  No matching processes found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!selectedProc}
        title={`Terminate Process ${selectedProc?.pid}`}
        message={`Are you sure you want to dispatch ${signalType} to process '${selectedProc?.command}' (PID: ${selectedProc?.pid}, User: ${selectedProc?.user})?`}
        confirmText={`Dispatch ${signalType}`}
        danger={signalType === 'SIGKILL'}
        onConfirm={confirmKill}
        onCancel={() => setSelectedProc(null)}
      />
    </div>
  );
}
