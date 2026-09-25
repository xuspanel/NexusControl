import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Info
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function UpdatesView({ token, onShowToast }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateData, setUpdateData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const fetchUpdates = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/system/updates', {
        headers: authHeaders
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch updates (${res.status})`);
      }

      const data = await res.json();
      setUpdateData(data);
      if (isManualRefresh && onShowToast) {
        onShowToast(
          data.updateAvailable
            ? `New release v${data.latestVersion} is available!`
            : `NexusControl is up to date (v${data.currentVersion}).`,
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

  const copyUpdateCommand = () => {
    const cmd = 'sudo /opt/NexusControl/update.sh';
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    if (onShowToast) onShowToast('Update command copied to clipboard!', 'info');
    setTimeout(() => setCopied(false), 2000);
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchUpdates(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 transition-colors disabled:opacity-50"
            title="Check GitHub for latest release"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
            <span>{refreshing ? 'Checking...' : 'Check for Updates'}</span>
          </button>
        </div>
      </div>

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
            <div>
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
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isUpToDate ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              {isUpToDate ? <ShieldCheck className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
            </div>
          </div>
        </div>
      )}

      {/* 5. Safe Update Instructions Block */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-zinc-100 shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Terminal className="w-4 h-4" />
            <span>How to Apply Updates Safely</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
            CLI Operations
          </span>
        </div>

        <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
          NexusControl features automated, state-reconciling migrations and pre-update tar snapshot guards. Run the host update script directly via SSH:
        </p>

        {/* Command Box */}
        <div className="mt-3 relative flex items-center bg-black/60 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-xs text-zinc-200">
          <span className="text-emerald-400 select-none mr-2">$</span>
          <span className="flex-1 select-all font-semibold text-emerald-300">
            sudo /opt/NexusControl/update.sh
          </span>
          <button
            onClick={copyUpdateCommand}
            className="ml-3 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/80 transition-colors flex items-center gap-1.5 text-xs font-sans"
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
            <strong>Architectural Safety Guard:</strong> To apply this update, run <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono">sudo /opt/NexusControl/update.sh</code> via your server terminal. Do not execute the script directly from Node.js, as replacing the active process mid-request can cause 502 Bad Gateway errors.
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
