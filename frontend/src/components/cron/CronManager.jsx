import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Layers,
  Activity,
  Plus,
  RefreshCw,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Play,
  Cpu,
  History
} from 'lucide-react';
import ActiveJobsTable from './ActiveJobsTable';
import SystemdTimersTable from './SystemdTimersTable';
import ExecutionHistoryTable from './ExecutionHistoryTable';
import CreateJobModal from './CreateJobModal';
import LiveTerminalModal from './LiveTerminalModal';

export default function CronManager({ token, onShowToast, onNavigateTab }) {
  const [activeTab, setActiveTab] = useState('jobs'); // 'jobs' | 'timers' | 'history'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [timers, setTimers] = useState([]);
  const [history, setHistory] = useState([]);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [streamingCommand, setStreamingCommand] = useState(null);

  // Fetch crontab jobs and systemd timers
  const fetchCronData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      try {
        const [cronRes, historyRes] = await Promise.all([
          fetch('/api/cron', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/cron/history', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        const cronData = await cronRes.json();
        const historyData = await historyRes.json();

        if (cronRes.ok) {
          setJobs(cronData.crontab || []);
          setTimers(cronData.systemd || []);
        }

        if (historyRes.ok) {
          setHistory(historyData.history || []);
        }
      } catch (err) {
        onShowToast?.(err.message || 'Failed to load cron data', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, onShowToast]
  );

  useEffect(() => {
    fetchCronData();
  }, [fetchCronData]);

  // Delete job
  const handleDeleteJob = async (command) => {
    if (!window.confirm(`Are you sure you want to remove this scheduled cron job?\n\nCommand: ${command}`)) {
      return;
    }

    try {
      const res = await fetch('/api/cron', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete job');

      onShowToast?.('Cron job removed from crontab.', 'info');
      fetchCronData(true);
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-xs select-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Cron Jobs &amp; Scheduled Tasks Manager
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Daemon
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Native Linux crontab supervisor, systemd timers &amp; SQLite execution history
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => fetchCronData(true)}
              disabled={refreshing}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              title="Refresh cron tasks"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Cron Job</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'jobs'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Active Crontab</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'jobs' ? 'bg-purple-700/60 text-purple-100' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}>
              {jobs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timers')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'timers'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Systemd Timers</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'timers' ? 'bg-purple-700/60 text-purple-100' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}>
              {timers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'history'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Execution History</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'history' ? 'bg-purple-700/60 text-purple-100' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}>
              {history.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab 1: Active Crontab Jobs */}
      {activeTab === 'jobs' && (
        <ActiveJobsTable
          jobs={jobs}
          onRunNow={(cmd) => setStreamingCommand(cmd)}
          onDeleteJob={handleDeleteJob}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onShowToast={onShowToast}
        />
      )}

      {/* Tab 2: Systemd Timers */}
      {activeTab === 'timers' && (
        <SystemdTimersTable timers={timers} />
      )}

      {/* Tab 3: Execution History */}
      {activeTab === 'history' && (
        <ExecutionHistoryTable
          history={history}
          onRefresh={() => fetchCronData(true)}
          loading={refreshing}
          onShowToast={onShowToast}
        />
      )}

      {/* Create Job Modal */}
      <CreateJobModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        token={token}
        onCreated={() => fetchCronData(true)}
        onShowToast={onShowToast}
      />

      {/* Live Streaming Terminal Modal */}
      {streamingCommand && (
        <LiveTerminalModal
          isOpen={Boolean(streamingCommand)}
          onClose={() => setStreamingCommand(null)}
          command={streamingCommand}
          token={token}
          onShowToast={onShowToast}
          onFinished={() => fetchCronData(true)}
        />
      )}
    </div>
  );
}
