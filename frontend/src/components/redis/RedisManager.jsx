import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Server,
  RefreshCw,
  Trash2,
  Terminal,
  Database,
  Layers,
  Activity,
  AlertTriangle,
  Wand2,
  CheckCircle2,
  Info,
  ExternalLink,
  ArrowRight,
  HardDrive
} from 'lucide-react';
import RedisDashboard from './RedisDashboard';
import KeyspaceBrowser from './KeyspaceBrowser';
import RedisConsole from './RedisConsole';
import FlushModal from './FlushModal';

export default function RedisManager({ token, onShowToast, onNavigateTab }) {
  const [activeSubTab, setActiveSubTab] = useState('keyspace'); // 'keyspace' | 'cli' | 'telemetry'
  const [telemetry, setTelemetry] = useState(null);
  const [rawInfo, setRawInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Flush modal state
  const [isFlushModalOpen, setIsFlushModalOpen] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);

  // Auto-refresh interval (5s)
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch status and telemetry
  const fetchStatus = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      try {
        const res = await fetch('/api/redis/status', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 503) {
          setIsInactive(true);
          setLoading(false);
          setIsRefreshing(false);
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch Redis status');

        setTelemetry(data.telemetry);
        setRawInfo(data.raw_info);
        setIsInactive(false);
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage(err.message);
        if (err.message?.includes('inactive') || err.message?.includes('503')) {
          setIsInactive(true);
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Periodic polling
  useEffect(() => {
    if (!autoRefresh || isInactive) return;
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, isInactive, fetchStatus]);

  // Execute FLUSH operation
  const handleConfirmFlush = async (target) => {
    setIsFlushing(true);
    try {
      const res = await fetch(`/api/redis/flush?target=${target}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Flush operation failed');

      onShowToast?.(data.message || 'Redis cache flushed successfully.', 'warning');
      setIsFlushModalOpen(false);
      fetchStatus(true);
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setIsFlushing(false);
    }
  };

  // ----------------------------------------------------
  // A. GRACEFUL FALLBACK (Redis is not active on this VPS)
  // ----------------------------------------------------
  if (isInactive) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 sm:p-12 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
            <Zap className="w-8 h-8" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Redis is not active on this VPS
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              No responsive Redis service was detected on <code className="font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">127.0.0.1:6379</code>. 
              To use the Key-Value Cache Engine, start the local daemon or install Redis via the Optimization Wizard.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchStatus(true);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Retry Connection</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab?.('wizard')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Wand2 className="w-4 h-4" />
              <span>Open Optimization Wizard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-xs select-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Title & Status */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Redis &amp; Key-Value Cache Engine
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  v{telemetry?.version || '7.x'}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  {telemetry?.mode || 'standalone'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Real-time telemetry, keyspace management &amp; raw interactive console
              </p>
            </div>
          </div>

          {/* Actions: Refresh & Flush */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                autoRefresh
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-400'
              }`}
              title="Toggle 5s live polling"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
              <span>Live {autoRefresh ? '5s' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setIsFlushModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Flush Cache</span>
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('keyspace')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeSubTab === 'keyspace'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Keyspace Browser</span>
            {telemetry?.total_keys !== undefined && (
              <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSubTab === 'keyspace' ? 'bg-purple-700/60 text-purple-100' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}>
                {telemetry.total_keys}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('cli')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeSubTab === 'cli'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Interactive CLI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('telemetry')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeSubTab === 'telemetry'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Raw INFO / Telemetry</span>
          </button>
        </div>
      </div>

      {/* Top 4 Stat Cards */}
      <RedisDashboard telemetry={telemetry} />

      {/* Tab 1: Keyspace Browser */}
      {activeSubTab === 'keyspace' && (
        <KeyspaceBrowser token={token} onShowToast={onShowToast} />
      )}

      {/* Tab 2: Interactive Console */}
      {activeSubTab === 'cli' && (
        <RedisConsole token={token} onShowToast={onShowToast} />
      )}

      {/* Tab 3: Detailed Telemetry / Raw INFO */}
      {activeSubTab === 'telemetry' && (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider font-mono">
              Redis Engine Specifications &amp; INFO Dump
            </h3>
            <span className="text-[11px] text-zinc-400 font-mono">
              {Object.keys(rawInfo?.sections || {}).length} sections parsed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            {Object.entries(rawInfo?.sections || {}).map(([secName, secValues]) => (
              <div
                key={secName}
                className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 space-y-2"
              >
                <h4 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                  # {secName}
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {Object.entries(secValues).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between text-[11px] gap-2">
                      <span className="text-zinc-500 dark:text-zinc-400 truncate">{k}</span>
                      <span className="text-zinc-900 dark:text-zinc-200 font-medium truncate max-w-[200px]" title={String(v)}>
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flush Modal */}
      <FlushModal
        isOpen={isFlushModalOpen}
        onClose={() => setIsFlushModalOpen(false)}
        onConfirm={handleConfirmFlush}
        isFlushing={isFlushing}
      />
    </div>
  );
}
