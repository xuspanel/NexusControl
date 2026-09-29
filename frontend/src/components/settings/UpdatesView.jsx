import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowUpCircle,
  Terminal,
  Copy,
  Check,
  GitBranch,
  ShieldCheck,
  Clock,
  ExternalLink,
  BookOpen,
  Info,
  Loader2,
  AlertCircle,
  Package
} from 'lucide-react';
import OsUpdatesSection from './OsUpdatesSection';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function UpdatesView({ token, onShowToast }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateData, setUpdateData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // In-app update execution states
  const [activeSection, setActiveSection] = useState('os');
  const [isUpdating, setIsUpdating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [updateStage, setUpdateStage] = useState('initiating');
  const [updateLogs, setUpdateLogs] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [triggeringApi, setTriggeringApi] = useState(false);

  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const logIntervalRef = useRef(null);
  const logEndRef = useRef(null);

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const fetchUpdates = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/system/updates?t=${Date.now()}`, {
        headers: {
          ...authHeaders,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch updates (${res.status})`);
      }

      const data = await res.json();

      // If backend was unable to reach GitHub for changelog, attempt direct fetch with cache-busting
      if (!data.changelog || data.changelog.startsWith('# Changelog\n\nNo changelog data')) {
        try {
          const directChangelogRes = await fetch(`https://raw.githubusercontent.com/xuspanel/NexusControl/main/CHANGELOG.md?t=${Date.now()}`, {
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
          });
          if (directChangelogRes.ok) {
            data.changelog = await directChangelogRes.text();
          }
        } catch (_) {}
      }

      setUpdateData(data);
      if (isManualRefresh && onShowToast) {
        onShowToast(
          data.updateAvailable
            ? `New release v${data.latestVersion} is available!`
            : `NexusControl is up to date (v${data.currentVersion || data.localVersion}).`,
          data.updateAvailable ? 'warning' : 'success'
        );
      }
    } catch (err) {
      console.error('[UpdatesView] Fetch error:', err);
      setError(err.message || 'Failed to check for updates.');
      if (isManualRefresh && onShowToast) {
        onShowToast('Could not reach GitHub update servers.', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders, onShowToast]);

  useEffect(() => {
    fetchUpdates(false);
  }, [fetchUpdates]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    };
  }, []);

  // Auto-scroll update logs to bottom as lines stream in
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updateLogs]);

  const copyUpdateCommand = () => {
    const cmd = 'sudo /opt/NexusControl/update.sh';
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    if (onShowToast) onShowToast('Update command copied to clipboard!', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  // Start the detached update process and begin polling
  const handleStartUpdate = async () => {
    setShowConfirmModal(false);
    setTriggeringApi(true);

    try {
      const res = await fetch('/api/system/update', {
        method: 'POST',
        headers: authHeaders
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate update process.');
      }

      // Enter modal overlay state
      setIsUpdating(true);
      setElapsedSeconds(0);
      setUpdateStage('initiating');
      setUpdateLogs('');

      // Start elapsed seconds counter
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);

      // Immediately begin polling real-time update logs
      logIntervalRef.current = setInterval(async () => {
        try {
          const logRes = await fetch('/api/system/update-log', { headers: authHeaders });
          if (logRes.ok) {
            const data = await logRes.json();
            if (data.log) {
              setUpdateLogs(data.log);
              if (data.log.includes('Restarting NexusControl Daemon') || data.log.includes('Update Complete!')) {
                setUpdateStage('reconnecting');
              } else if (data.log.includes('Rebuilding Frontend') || data.log.includes('Updating Backend Dependencies')) {
                setUpdateStage('compiling');
              } else if (data.log.includes('Pulling latest codebase')) {
                setUpdateStage('pulling');
              } else if (data.log.includes('Creating state backup')) {
                setUpdateStage('backup');
              }
            }
          }
        } catch (_) {
          // Ignore network dropouts while daemon restarts
        }
      }, 1500);

      // Give Node 5 seconds to gracefully detach and allow systemctl restart to begin
      setTimeout(() => {
        // Start polling loop every 3 seconds
        pollIntervalRef.current = setInterval(async () => {
          try {
            const checkRes = await fetch(`/api/system/updates?t=${Date.now()}`, {
              headers: {
                ...authHeaders,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            });

            // Once 200 OK returns, the new daemon is officially online
            if (checkRes.ok) {
              clearInterval(pollIntervalRef.current);
              clearInterval(timerIntervalRef.current);
              if (logIntervalRef.current) clearInterval(logIntervalRef.current);
              setUpdateStage('reloaded');
              if (onShowToast) onShowToast('Update completed! Reloading dashboard...', 'success');
              setTimeout(() => {
                window.location.reload();
              }, 1200);
            }
          } catch (e) {
            // Silently catch Network Error / 502 Bad Gateway during daemon restart
          }
        }, 3000);
      }, 5000);

    } catch (err) {
      console.error('[UpdatesView] Update trigger error:', err);
      setIsUpdating(false);
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
      if (onShowToast) onShowToast(err.message || 'Failed to start update.', 'error');
    } finally {
      setTriggeringApi(false);
    }
  };

  // Sanitize and parse markdown changelog safely
  const renderedChangelog = useMemo(() => {
    if (!updateData?.changelog) return '';
    try {
      const rawHtml = marked.parse(updateData.changelog);
      return DOMPurify.sanitize(rawHtml);
    } catch (err) {
      console.error('[UpdatesView] Markdown parse error:', err);
      return '<p class="text-zinc-400">Failed to render markdown changelog.</p>';
    }
  }, [updateData?.changelog]);

  const isUpToDate = updateData && !updateData.updateAvailable;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <ArrowUpCircle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              System Updates & Version Control
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Live version reconciliation against upstream GitHub releases and automated changelog viewer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Prominent Bright Update Now Button if update is available */}
          {updateData?.updateAvailable && (
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={isUpdating || triggeringApi}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all transform active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 fill-black text-black" />
              <span>Update Now</span>
            </button>
          )}

          <button
            onClick={() => fetchUpdates(true)}
            disabled={loading || refreshing || isUpdating}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 transition-colors disabled:opacity-50 cursor-pointer"
            title="Check GitHub for latest release"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
            <span>{refreshing ? 'Checking...' : 'Check for Updates'}</span>
          </button>
        </div>
      </div>

      {/* 2. Section Selector Tabs: OS System Packages vs NexusControl Engine */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-fit">
        <button
          onClick={() => setActiveSection('os')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeSection === 'os'
              ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>OS System Packages</span>
        </button>

        <button
          onClick={() => setActiveSection('platform')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeSection === 'platform'
              ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>NexusControl Engine</span>
          {updateData?.updateAvailable && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {activeSection === 'os' ? (
        <OsUpdatesSection token={token} onShowToast={onShowToast} />
      ) : (
        <>
          {/* 2. Loading State */}
      {loading && !updateData && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-12 text-center">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contacting Upstream GitHub Repository...</p>
          <p className="text-xs text-zinc-400 mt-1 font-mono">Comparing local tag against main branch release artifacts</p>
        </div>
      )}

      {/* 3. Error Banner */}
      {error && !loading && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400">Update Check Failed</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
            <button
              onClick={() => fetchUpdates(true)}
              className="mt-2 text-xs font-semibold underline text-rose-600 dark:text-rose-400 hover:text-rose-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* 4. Main Status Card */}
      {updateData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Version */}
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Current Version</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  v{updateData.currentVersion || '1.0.0'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                  Host
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
              <GitBranch className="w-5 h-5" />
            </div>
          </div>

          {/* Latest Version */}
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Latest Release</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  v{updateData.latestVersion || updateData.currentVersion || '1.0.0'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  GitHub
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>

          {/* Status Badge */}
          <div className={`border rounded-xl p-4 flex items-center justify-between shadow-xs ${
            isUpToDate
              ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30 text-amber-700 dark:text-amber-300'
          }`}>
            <div className="flex-1 pr-2">
              <p className="text-[11px] font-mono uppercase tracking-wider opacity-80">Deployment Status</p>
              <div className="flex items-center gap-1.5 mt-1 font-semibold text-sm">
                {isUpToDate ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Up to Date</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Update Available</span>
                  </>
                )}
              </div>
              <p className="text-[11px] mt-0.5 opacity-80">
                {isUpToDate
                  ? 'Your installation is on the latest release.'
                  : `Upgrade available: v${updateData.currentVersion} → v${updateData.latestVersion}`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isUpToDate ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
              }`}>
                {isUpToDate ? <ShieldCheck className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Safe Update Instructions & One-Click Trigger Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-zinc-100 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Terminal className="w-4 h-4" />
            <span>Automated Host Update Engine</span>
          </div>
          <div className="flex items-center gap-2">
            {updateData?.updateAvailable ? (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isUpdating || triggeringApi}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 fill-black" />
                <span>One-Click Update Now</span>
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isUpdating || triggeringApi}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
                title="Force-run update script to reconcile environment and rebuild"
              >
                <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                <span>Re-run Update Script</span>
              </button>
            )}
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
              CLI / Detached
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
          Updates execute detached from the Node.js event loop with automated pre-update backups and zero downtime interruption. You can trigger it via the button above, or manually via SSH:
        </p>

        {/* Command Box */}
        <div className="mt-3 relative flex items-center bg-black/60 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-xs text-zinc-200">
          <span className="text-emerald-400 select-none mr-2">$</span>
          <span className="flex-1 select-all font-semibold text-emerald-300">
            sudo /opt/NexusControl/update.sh
          </span>
          <button
            onClick={copyUpdateCommand}
            className="ml-3 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/80 transition-colors flex items-center gap-1.5 text-xs font-sans cursor-pointer"
            title="Copy command"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Safety Callout Note */}
        <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Architectural Safety Guard:</strong> When triggered from the dashboard, the update script is spawned as a detached background process with <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono">unref()</code> so that the host daemon restart does not interrupt code compilation or cause 502 Bad Gateway failures.
          </span>
        </div>
      </div>

      {/* 6. Release Notes & Markdown Changelog Container */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Release Notes & Upstream Changelog
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {updateData?.updateAvailable && (
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono">
                v{updateData.latestVersion} Ready
              </span>
            )}
            <a
              href="https://github.com/xuspanel/NexusControl/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-emerald-500 dark:text-zinc-400 dark:hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
            >
              <span>View on GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Scrollable Changelog Content Container */}
        <div className="p-6 max-h-[500px] overflow-y-auto">
          {renderedChangelog ? (
            <div
              className="changelog-markdown space-y-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans"
              dangerouslySetInnerHTML={{ __html: renderedChangelog }}
            />
          ) : (
            <div className="text-center py-10 text-xs text-zinc-400">
              No changelog entries could be loaded at this time.
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Confirm System Update
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Target version: v{updateData?.latestVersion || updateData?.currentVersion}
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2 leading-relaxed bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
              <p>
                This will execute <code className="text-emerald-500 font-mono">/opt/NexusControl/update.sh</code> in the background:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-500 dark:text-zinc-400">
                <li>Creates a pre-update state backup tar snapshot</li>
                <li>Pulls the latest code from GitHub</li>
                <li>Updates backend dependencies and rebuilds the frontend</li>
                <li>Restarts the NexusControl daemon and reloads the dashboard</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleStartUpdate}
                disabled={triggeringApi}
                className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-emerald-500 hover:bg-emerald-400 shadow-md shadow-emerald-500/25 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {triggeringApi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 fill-black" />}
                <span>Proceed with Update</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Un-closeable Updating Modal Overlay */}
      {isUpdating && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none animate-in fade-in duration-300">
          <div className="max-w-2xl w-full bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center space-y-5">
            {/* Animated Pulse Ring */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping pointer-events-none" />
            </div>

            {/* Title & Warning */}
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                Updating NexusControl...
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-md">
                Executing isolated update in independent transient scope. <strong>Do not close or refresh this tab.</strong>
              </p>
            </div>

            {/* Current Stage Indicator */}
            <div className="w-full bg-black/50 border border-zinc-800 rounded-xl p-3.5 text-left space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-400">Current Phase:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {updateStage === 'reloaded' && 'Update Complete!'}
                  {updateStage === 'reconnecting' && 'Reconnecting to Daemon...'}
                  {updateStage === 'compiling' && 'Rebuilding Frontend & Migrations...'}
                  {updateStage === 'pulling' && 'Pulling Code & Dependencies...'}
                  {(updateStage === 'backup' || updateStage === 'initiating') && 'Securing State Backup...'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-out"
                  style={{
                    width: updateStage === 'reloaded' ? '100%'
                         : updateStage === 'reconnecting' ? '85%'
                         : updateStage === 'compiling' ? '65%'
                         : updateStage === 'pulling' ? '40%'
                         : '20%'
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-0.5">
                <span>Auto-Reconnection Active</span>
                <span>Elapsed: {elapsedSeconds}s</span>
              </div>
            </div>

            {/* Live Real-time Build Stream */}
            <div className="w-full bg-black/90 border border-zinc-800/80 rounded-xl p-3 text-left font-mono text-xs flex flex-col h-44 overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80 text-[11px] text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-zinc-300 font-semibold">Live Build Stream (/opt/NexusControl/update.log)</span>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Streaming
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-0.5 text-[11px] text-zinc-300 font-mono scrollbar-thin scrollbar-thumb-zinc-700 select-text">
                {updateLogs ? (
                  updateLogs.split('\n').map((line, idx) => (
                    <div
                      key={idx}
                      className={
                        line.includes('ERROR') || line.includes('failed')
                          ? 'text-rose-400 font-medium'
                          : line.includes('===') || line.includes('✅') || line.includes('Initiating')
                          ? 'text-emerald-400 font-medium'
                          : line.includes('🎨') || line.includes('⚙️') || line.includes('📦')
                          ? 'text-amber-300'
                          : 'text-zinc-300'
                      }
                    >
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-500 italic flex items-center gap-2 pt-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting to update log pipeline...
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>

            <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-zinc-400" />
              <span>Streaming update logs • Daemon polling every 3s</span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Styles for Rendered Changelog HTML */}
      <style>{`
        .changelog-markdown h1 {
          font-size: 1.25rem;
          font-weight: 700;
          color: inherit;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid rgba(120, 120, 120, 0.2);
          padding-bottom: 0.25rem;
        }
        .changelog-markdown h2 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #10b981;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .changelog-markdown h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: inherit;
          margin-top: 1rem;
          margin-bottom: 0.35rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.9;
        }
        .changelog-markdown ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-top: 0.35rem;
          margin-bottom: 0.75rem;
          space-y: 0.25rem;
        }
        .changelog-markdown li {
          margin-bottom: 0.35rem;
        }
        .changelog-markdown code {
          background-color: rgba(120, 120, 120, 0.15);
          padding: 0.15rem 0.35rem;
          border-radius: 0.25rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85em;
        }
        .changelog-markdown a {
          color: #10b981;
          text-decoration: underline;
        }
        .changelog-markdown p {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
}
