import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowUpCircle,
  Terminal,
  Search,
  CheckSquare,
  Square,
  Shield,
  Clock,
  Check,
  X,
  ExternalLink,
  Loader2,
  HardDrive,
  Cpu,
  Layers,
  Sparkles
} from 'lucide-react';

export default function OsUpdatesSection({ token, onShowToast }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [packages, setPackages] = useState([]);
  const [manager, setManager] = useState('');
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPackages, setSelectedPackages] = useState(new Set());

  // Real-time SSE streaming upgrade modal states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingTarget, setStreamingTarget] = useState('');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [upgradeComplete, setUpgradeComplete] = useState(false);
  const [exitCode, setExitCode] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const terminalEndRef = useRef(null);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);

  // Fetch pending OS packages
  const scanPackages = useCallback(async (refreshIndex = false) => {
    if (refreshIndex) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const url = `/api/system/os-packages${refreshIndex ? '?refresh=true' : ''}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Failed to scan OS packages (${res.status})`);
      }

      const data = await res.json();
      setPackages(data.packages || []);
      setManager(data.manager || 'system');
      setSelectedPackages(new Set());

      if (refreshIndex && onShowToast) {
        onShowToast(
          data.count > 0
            ? `Found ${data.count} pending ${data.manager.toUpperCase()} package updates.`
            : `All OS packages are up to date!`,
          data.count > 0 ? 'info' : 'success'
        );
      }
    } catch (err) {
      console.error('[OsUpdates] Scan error:', err);
      setError(err.message || 'Failed to scan operating system updates.');
      if (refreshIndex && onShowToast) {
        onShowToast('Package scan failed.', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onShowToast]);

  useEffect(() => {
    scanPackages(false);
  }, [scanPackages]);

  // Clean up SSE and timers on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-scroll terminal window as new logs arrive
  useEffect(() => {
    if (isStreaming && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, isStreaming]);

  // Toggle single package selection
  const toggleSelect = (pkgName) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkgName)) {
        next.delete(pkgName);
      } else {
        next.add(pkgName);
      }
      return next;
    });
  };

  // Toggle select all filtered packages
  const filteredPackages = packages.filter(pkg => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pkg.name.toLowerCase().includes(query) ||
      (pkg.latest && pkg.latest.toLowerCase().includes(query)) ||
      (pkg.repo && pkg.repo.toLowerCase().includes(query))
    );
  });

  const allFilteredSelected = filteredPackages.length > 0 &&
    filteredPackages.every(pkg => selectedPackages.has(pkg.name));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedPackages(new Set());
    } else {
      const next = new Set(selectedPackages);
      filteredPackages.forEach(pkg => next.add(pkg.name));
      setSelectedPackages(next);
    }
  };

  // Start real-time SSE streaming upgrade
  const startUpgrade = (isAll = false) => {
    const pkgsToUpgrade = isAll ? [] : Array.from(selectedPackages);
    if (!isAll && pkgsToUpgrade.length === 0) {
      if (onShowToast) onShowToast('Please select at least one package to upgrade.', 'warning');
      return;
    }

    setStreamingTarget(isAll ? 'All Available Packages' : `${pkgsToUpgrade.length} Selected Package(s)`);
    setTerminalLogs([]);
    setUpgradeComplete(false);
    setExitCode(null);
    setElapsedTime(0);
    setIsStreaming(true);

    // Start elapsed timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    const queryParams = new URLSearchParams();
    if (token) queryParams.set('token', token);
    if (isAll) {
      queryParams.set('all', 'true');
    } else {
      queryParams.set('packages', pkgsToUpgrade.join(','));
    }

    const sseUrl = `/api/system/os-packages/upgrade?${queryParams.toString()}`;
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = event.data;
      if (data === '[DONE]') {
        eventSource.close();
        if (timerRef.current) clearInterval(timerRef.current);
        setUpgradeComplete(true);
        if (onShowToast) onShowToast('Package upgrade completed!', 'success');
      } else {
        setTerminalLogs(prev => [...prev, data]);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('[OsUpdates SSE] Stream ended or connection closed:', err);
      eventSource.close();
      if (timerRef.current) clearInterval(timerRef.current);
      setUpgradeComplete(true);
    };
  };

  const handleCloseModal = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsStreaming(false);
    // Auto-rescan to reflect newly installed packages
    scanPackages(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Operating System Packages
              </h2>
              {manager && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold">
                  {manager}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Native host dependency manager for libraries, services, runtime engines, and kernel security patches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => scanPackages(true)}
            disabled={loading || refreshing || isStreaming}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh package repository indices and rescan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-500' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Repository Index'}</span>
          </button>
        </div>
      </div>

      {/* 2. Error Display */}
      {error && !loading && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400">Scan Failed</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
            <button
              onClick={() => scanPackages(false)}
              className="mt-2 text-xs font-semibold underline text-rose-600 dark:text-rose-400 hover:text-rose-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* 3. Package Management Table & Action Controls */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl shadow-xs overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter packages..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
              {filteredPackages.length} upgradable {filteredPackages.length === 1 ? 'package' : 'packages'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => startUpgrade(false)}
              disabled={selectedPackages.size === 0 || isStreaming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Upgrade Selected ({selectedPackages.size})</span>
            </button>

            <button
              onClick={() => startUpgrade(true)}
              disabled={packages.length === 0 || isStreaming}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 fill-black" />
              <span>Upgrade All ({packages.length})</span>
            </button>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Scanning system repositories...</p>
            <p className="text-xs text-zinc-400 mt-1 font-mono">Querying {manager ? manager.toUpperCase() : 'system'} package indices for candidate updates</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && packages.length === 0 && (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Operating System is Fully Up to Date!
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
                No pending package upgrades were detected by {manager ? manager.toUpperCase() : 'the package manager'}. Your server has all latest security patches applied.
              </p>
            </div>
            <button
              onClick={() => scanPackages(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Force Rescan Repositories</span>
            </button>
          </div>
        )}

        {/* Packages Table */}
        {!loading && packages.length > 0 && (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-100/60 dark:bg-zinc-800/50 sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <button
                      onClick={toggleSelectAll}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                      title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-purple-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-semibold">Package Name</th>
                  <th className="py-2.5 px-3 font-semibold">Current Version</th>
                  <th className="py-2.5 px-3 font-semibold">New Version</th>
                  <th className="py-2.5 px-3 font-semibold">Source / Arch</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60 font-sans">
                {filteredPackages.map((pkg) => {
                  const isSelected = selectedPackages.has(pkg.name);
                  return (
                    <tr
                      key={pkg.name}
                      onClick={() => toggleSelect(pkg.name)}
                      className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                        isSelected ? 'bg-purple-500/5 dark:bg-purple-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(pkg.name)}
                          className="rounded border-zinc-300 dark:border-zinc-700 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-mono text-xs">{pkg.name}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-500 dark:text-zinc-400">
                        {pkg.current || 'installed'}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>{pkg.latest}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {pkg.repo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                              {pkg.repo}
                            </span>
                          )}
                          {pkg.arch && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                              {pkg.arch}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setSelectedPackages(new Set([pkg.name]));
                            startUpgrade(false);
                          }}
                          className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-purple-500 hover:text-white dark:bg-zinc-800 dark:hover:bg-purple-600 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium transition-colors"
                          title={`Upgrade only ${pkg.name}`}
                        >
                          Upgrade
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

      {/* 4. Real-Time Streaming Terminal Modal Overlay */}
      {isStreaming && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
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
                  <Terminal className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-zinc-100 font-mono">
                    OS Upgrade Stream: {streamingTarget}
                  </h3>
                </div>
              </div>

              {/* Status Badge & Close Button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  {upgradeComplete ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Completed ({elapsedTime}s)</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                      <span>Running ({elapsedTime}s)</span>
                    </span>
                  )}
                </div>

                <button
                  onClick={handleCloseModal}
                  disabled={!upgradeComplete}
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
                <div className="text-zinc-600 italic">Waiting for package manager output stream...</div>
              ) : (
                terminalLogs.map((logLine, idx) => {
                  let colorClass = 'text-zinc-300';
                  if (logLine.includes('ERROR') || logLine.includes('failed') || logLine.includes('Err:')) {
                    colorClass = 'text-rose-400';
                  } else if (logLine.includes('WARNING') || logLine.includes('Preparing to unpack')) {
                    colorClass = 'text-amber-400';
                  } else if (logLine.includes('Setting up') || logLine.includes('Unpacking')) {
                    colorClass = 'text-cyan-400';
                  } else if (logLine.includes('completed') || logLine.includes('Upgraded') || logLine.includes('installed')) {
                    colorClass = 'text-emerald-400 font-semibold';
                  } else if (logLine.startsWith('Get:')) {
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
                <span className={`w-2 h-2 rounded-full ${upgradeComplete ? 'bg-emerald-500' : 'bg-purple-500 animate-pulse'}`} />
                <span>{upgradeComplete ? 'Upgrade stream closed' : 'Live stdout/stderr stream via SSE'}</span>
              </span>

              {upgradeComplete && (
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  Done & Refresh List
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
