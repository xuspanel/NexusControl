import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Wand2,
  Sparkles,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Check,
  CheckSquare,
  Square,
  Package,
  Terminal,
  X,
  Loader2,
  HardDrive,
  Layers,
  Search,
  Activity,
  Flame,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Shield,
  Server,
  Database,
  Globe,
  Mail,
  Box
} from 'lucide-react';

export default function SystemWizard({ token, onShowToast }) {
  // Wizard state: 'scanning' | 'report' | 'purging'
  const [isScanning, setIsScanning] = useState(true);
  const [scanData, setScanData] = useState(null);
  const [error, setError] = useState(null);

  // Selected items for purge
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [purgeOrphaned, setPurgeOrphaned] = useState(true);
  const [filterMode, setFilterMode] = useState('action'); // 'all' | 'action' | 'keep'

  // SSE Execution modal states
  const [isPurging, setIsPurging] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [purgeComplete, setPurgeComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const terminalEndRef = useRef(null);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);

  // Scan system for major tools and orphaned packages
  const runScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    try {
      const res = await fetch('/api/system/wizard/scan', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Scan failed (${res.status})`);
      }

      const data = await res.json();
      setScanData(data);

      // Pre-select tools recommended for purge
      const initialPurgeSet = new Set();
      if (data.tools) {
        data.tools.forEach(t => {
          if (t.recommendation === 'PURGE') {
            initialPurgeSet.add(t.id);
          }
        });
      }
      setSelectedTools(initialPurgeSet);
      setPurgeOrphaned(Boolean(data.orphaned?.count > 0));

      if (onShowToast) {
        onShowToast('System heuristic scan completed.', 'info');
      }
    } catch (err) {
      console.error('[SystemWizard] Scan error:', err);
      setError(err.message || 'Failed to complete system scan.');
      if (onShowToast) onShowToast('System scan failed.', 'error');
    } finally {
      setIsScanning(false);
    }
  }, [token, onShowToast]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-scroll terminal window
  useEffect(() => {
    if (isPurging && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, isPurging]);

  // Toggle selection for a tool
  const toggleTool = (toolId) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  // Start real-time SSE deep purge
  const executeDeepPurge = () => {
    setShowConfirmModal(false);
    setIsPurging(true);
    setTerminalLogs([]);
    setPurgeComplete(false);
    setElapsedTime(0);

    // Start timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    const queryParams = new URLSearchParams();
    if (token) queryParams.set('token', token);
    if (selectedTools.size > 0) {
      queryParams.set('tools', Array.from(selectedTools).join(','));
    }
    if (purgeOrphaned) {
      queryParams.set('autoremove', 'true');
    }

    const sseUrl = `/api/system/wizard/purge?${queryParams.toString()}`;
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = event.data;
      if (data === '[DONE]') {
        eventSource.close();
        if (timerRef.current) clearInterval(timerRef.current);
        setPurgeComplete(true);
        if (onShowToast) onShowToast('Deep purge completed successfully!', 'success');
      } else {
        setTerminalLogs(prev => [...prev, data]);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('[Wizard SSE] Stream error or connection ended:', err);
      eventSource.close();
      if (timerRef.current) clearInterval(timerRef.current);
      setPurgeComplete(true);
    };
  };

  const handleCloseModal = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsPurging(false);
    // Re-run scan to update status
    runScan();
  };

  // Category Icon helper
  const getToolIcon = (category) => {
    switch (category) {
      case 'Web Server': return Globe;
      case 'Database': return Database;
      case 'Containers': return Box;
      case 'Mail Server': return Mail;
      case 'Cache':
      case 'Cache & Store': return Layers;
      default: return Server;
    }
  };

  // Filter tools based on tab
  const tools = scanData?.tools || [];
  const filteredTools = useMemo(() => {
    if (filterMode === 'action') {
      return tools.filter(t => t.recommendation === 'PURGE' || t.recommendation === 'REVIEW');
    }
    if (filterMode === 'keep') {
      return tools.filter(t => t.recommendation === 'KEEP');
    }
    return tools;
  }, [tools, filterMode]);

  const purgeCount = tools.filter(t => t.recommendation === 'PURGE').length;
  const reviewCount = tools.filter(t => t.recommendation === 'REVIEW').length;
  const keepCount = tools.filter(t => t.recommendation === 'KEEP').length;
  const orphanedCount = scanData?.orphaned?.count || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-xs">
            <Wand2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                System Optimization Wizard
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">
                HEURISTIC ENGINE
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Automated service footprint analyzer, dormant daemon detector, and zero-residue deep purge cleaner
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runScan}
            disabled={isScanning || isPurging}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-amber-500' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Rescan System'}</span>
          </button>
        </div>
      </div>

      {/* 2. Step 1: Scanning Radar Animation */}
      {isScanning && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-16 text-center shadow-xs flex flex-col items-center justify-center space-y-6">
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* Concentric Pulsing Radar Rings */}
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border border-amber-500/30 animate-pulse" />
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-500 shadow-lg">
              <Wand2 className="w-8 h-8 animate-bounce" />
            </div>
          </div>

          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Analyzing Server Software Footprint...
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-mono">
              Probing active systemd daemons, dormant binaries, and orphaned dependency trees...
            </p>
          </div>
        </div>
      )}

      {/* 3. Error Banner */}
      {error && !isScanning && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400">Analysis Interrupted</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
            <button
              onClick={runScan}
              className="mt-2 text-xs font-semibold underline text-rose-600 dark:text-rose-400 hover:text-rose-700"
            >
              Retry Heuristic Scan
            </button>
          </div>
        </div>
      )}

      {/* 4. Step 2 & 3: Assessment Report & Interactive Decisions */}
      {!isScanning && scanData && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-4 shadow-xs">
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Total Detected Tools</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {tools.length}
                </span>
                <span className="text-xs text-zinc-400">installed</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#121215] border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10 rounded-xl p-4 shadow-xs">
              <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active & Essential</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {keepCount}
                </span>
                <span className="text-xs text-emerald-500/80">keep running</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#121215] border border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/10 rounded-xl p-4 shadow-xs">
              <p className="text-[11px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400">Purge Recommended</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                  {purgeCount}
                </span>
                <span className="text-xs text-rose-500/80">dormant / conflict</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#121215] border border-purple-500/20 bg-purple-500/5 dark:bg-purple-950/10 rounded-xl p-4 shadow-xs">
              <p className="text-[11px] font-mono uppercase tracking-wider text-purple-600 dark:text-purple-400">Orphaned Leftovers</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {orphanedCount}
                </span>
                <span className="text-xs font-mono text-purple-500/80">({scanData.orphaned?.estimatedSpaceFreed})</span>
              </div>
            </div>
          </div>

          {/* Orphaned Leftovers Notification Banner (If Any Found) */}
          {orphanedCount > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-purple-400">
                    {orphanedCount} Orphaned System Dependencies Detected
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    These libraries were installed as dependencies for uninstalled software and are no longer required. Cleaning them will reclaim approximately <strong className="text-purple-300 font-mono">{scanData.orphaned?.estimatedSpaceFreed}</strong> of disk storage.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-purple-300 cursor-pointer select-none bg-purple-500/20 px-3 py-2 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors shrink-0">
                <input
                  type="checkbox"
                  checked={purgeOrphaned}
                  onChange={(e) => setPurgeOrphaned(e.target.checked)}
                  className="rounded border-purple-400 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                />
                <span>Include in Deep Purge</span>
              </label>
            </div>
          )}

          {/* Filter Tabs Bar */}
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterMode('action')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterMode === 'action'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Action Recommended ({purgeCount + reviewCount})
              </button>

              <button
                onClick={() => setFilterMode('keep')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterMode === 'keep'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Active & Running ({keepCount})
              </button>

              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                All Tools ({tools.length})
              </button>
            </div>

            <div className="text-xs text-zinc-500 font-mono">
              Showing {filteredTools.length} tool(s)
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTools.map((tool) => {
              const isSelected = selectedTools.has(tool.id);
              const IconComponent = getToolIcon(tool.category);

              const isPurge = tool.recommendation === 'PURGE';
              const isKeep = tool.recommendation === 'KEEP';
              const isReview = tool.recommendation === 'REVIEW';

              return (
                <div
                  key={tool.id}
                  onClick={() => !isKeep && toggleTool(tool.id)}
                  className={`border rounded-xl p-5 transition-all relative overflow-hidden select-none ${
                    isKeep
                      ? 'bg-white dark:bg-[#121215] border-zinc-200 dark:border-zinc-800/80 shadow-xs'
                      : isPurge
                      ? isSelected
                        ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/40 shadow-sm'
                        : 'bg-white dark:bg-[#121215] border-rose-500/20 hover:border-rose-500/40'
                      : isSelected
                      ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/40 shadow-sm'
                      : 'bg-white dark:bg-[#121215] border-amber-500/20 hover:border-amber-500/40'
                  } ${!isKeep ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        isKeep
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : isPurge
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        <IconComponent className="w-5 h-5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {tool.name}
                          </h4>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                            {tool.category}
                          </span>
                        </div>

                        {/* Status Pills */}
                        <div className="flex items-center gap-2 pt-0.5">
                          {tool.active ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Daemon ({tool.serviceName})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                              Inactive / Stopped
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Recommendation Badge or Selection Checkbox */}
                    <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {isKeep ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>KEEP</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border flex items-center gap-1 ${
                            isPurge
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          }`}>
                            {isPurge ? <Flame className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            <span>{tool.recommendation}</span>
                          </span>

                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTool(tool.id)}
                            className="rounded border-zinc-400 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Heuristic Reason Callout */}
                  <div className={`mt-3.5 p-2.5 rounded-lg text-xs leading-relaxed border ${
                    isKeep
                      ? 'bg-zinc-50 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800/60'
                      : isPurge
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                  }`}>
                    <strong>Analysis:</strong> {tool.reason}
                  </div>

                  {/* Associated Package Tags */}
                  {!isKeep && (
                    <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-zinc-400">
                      <span>Packages to purge:</span>
                      {tool.packagesToRemove?.map(pkg => (
                        <span key={pkg} className="bg-black/30 dark:bg-black/50 px-1 py-0.2 rounded border border-zinc-700/50 text-zinc-300">
                          {pkg}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky Decision & Execution Action Bar */}
          <div className="sticky bottom-6 z-20 bg-zinc-900/95 border border-zinc-800 text-zinc-100 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-zinc-100">
                    {selectedTools.size} Tool(s) Selected for Deep Purge
                  </span>
                  {purgeOrphaned && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      + Autoremove Leftovers
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400">
                  Deep purge executes `apt-get purge --auto-remove` to cleanly remove binaries and configuration bloat.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => setSelectedTools(new Set())}
                disabled={selectedTools.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors cursor-pointer"
              >
                Clear Selection
              </button>

              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={selectedTools.size === 0 && !purgeOrphaned}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-lg shadow-rose-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer transform active:scale-95"
              >
                <Flame className="w-4 h-4" />
                <span>Execute Deep Purge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Confirm Deep Purge
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Irreversible uninstallation of selected dormant software
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2 leading-relaxed bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
              <p>
                The following actions will be performed as root:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-500 dark:text-zinc-400 font-mono">
                {Array.from(selectedTools).map(tId => {
                  const t = tools.find(x => x.id === tId);
                  return <li key={tId}>{t?.name || tId} (Purge config & binaries)</li>;
                })}
                {purgeOrphaned && <li>OS Dependency Autoremove (`apt-get autoremove --purge`)</li>}
              </ul>
              <p className="text-amber-500 font-medium pt-1">
                ⚠️ All configuration files for these tools will be removed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeDeepPurge}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/25 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Confirm & Purge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Real-Time Streaming Terminal Modal Overlay */}
      {isPurging && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-3xl w-full p-5 shadow-2xl flex flex-col space-y-4 max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <div className="flex items-center gap-2 pl-2">
                  <Terminal className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-zinc-100 font-mono">
                    Deep Purge Execution Stream
                  </h3>
                </div>
              </div>

              {/* Status Badge & Close Button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  {purgeComplete ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Purge Finished ({elapsedTime}s)</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      <span>Purging ({elapsedTime}s)</span>
                    </span>
                  )}
                </div>

                <button
                  onClick={handleCloseModal}
                  disabled={!purgeComplete}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Close streaming window"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Glowing Terminal Screen */}
            <div className="flex-1 bg-black/95 border border-zinc-900 rounded-xl p-4 font-mono text-xs text-zinc-300 overflow-y-auto max-h-[480px] space-y-1 shadow-inner select-text">
              {terminalLogs.length === 0 ? (
                <div className="text-zinc-600 italic">Initializing deep purge engine...</div>
              ) : (
                terminalLogs.map((logLine, idx) => {
                  let colorClass = 'text-zinc-300';
                  if (logLine.includes('ERROR') || logLine.includes('failed') || logLine.includes('Err:')) {
                    colorClass = 'text-rose-400';
                  } else if (logLine.includes('WARNING') || logLine.includes('Purging configuration')) {
                    colorClass = 'text-amber-400';
                  } else if (logLine.includes('Removing') || logLine.includes('Removing:')) {
                    colorClass = 'text-rose-400 font-semibold';
                  } else if (logLine.includes('completed') || logLine.includes('freed') || logLine.includes('✅')) {
                    colorClass = 'text-emerald-400 font-semibold';
                  } else if (logLine.startsWith('Spawning') || logLine.startsWith('Wizard')) {
                    colorClass = 'text-purple-400';
                  }

                  return (
                    <div key={idx} className={`leading-relaxed break-all ${colorClass}`}>
                      {logLine}
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>

            {/* Modal Bottom Footer Actions */}
            <div className="pt-2 flex items-center justify-between text-xs text-zinc-500 font-mono">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${purgeComplete ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                <span>{purgeComplete ? 'Purge process terminated' : 'Streaming live stdout/stderr via SSE'}</span>
              </span>

              {purgeComplete && (
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  Done & Rescan System
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
