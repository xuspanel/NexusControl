import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  Terminal,
  FileCode,
  Sliders,
  Lock,
  Eye,
  X
} from 'lucide-react';

export default function AuditLogView({ token, onShowToast }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize,
        offset: page * pageSize
      });
      if (actionFilter) params.append('action', actionFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/audit/logs?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      onShowToast?.(`Failed to load audit logs: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, page, actionFilter, searchQuery, onShowToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/audit/verify', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      setVerifyResult(data);
      if (data.valid) {
        onShowToast?.(`Chain Integrity Verified: ${data.count} blocks intact`, 'success');
      } else {
        onShowToast?.(`INTEGRITY FAILURE: Tampering detected!`, 'error');
      }
    } catch (err) {
      console.error('Verification failed:', err);
      setVerifyResult({ valid: false, message: err.message });
      onShowToast?.(`Verification error: ${err.message}`, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text, label = 'Copied') => {
    navigator.clipboard?.writeText(text);
    onShowToast?.(`${label} copied to clipboard`, 'info');
  };

  const getActionBadge = (action) => {
    if (action.startsWith('AUTH_')) {
      const isSuccess = action.includes('SUCCESS');
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
          isSuccess 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        }`}>
          <Lock className="w-3 h-3" />
          {action}
        </span>
      );
    }
    if (action.startsWith('SERVICE_')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Sliders className="w-3 h-3" />
          {action}
        </span>
      );
    }
    if (action.startsWith('FILE_') || action.startsWith('ARCHIVE_')) {
      const isDestructive = action.includes('DELETE') || action.includes('TRASH');
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
          isDestructive
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        }`}>
          <FileCode className="w-3 h-3" />
          {action}
        </span>
      );
    }
    if (action.startsWith('TERMINAL_')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <Terminal className="w-3 h-3" />
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
        {action}
      </span>
    );
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-4">
      {/* Top Header & Verification Bar */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  Tamper-Evident Audit Ledger
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    SHA-256 Chained
                  </span>
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Cryptographically linked block sequence tracking all root operations and privilege mutations.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyChain}
              disabled={verifying}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/20 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              <span>{verifying ? 'Verifying Hashes...' : 'Verify Log Integrity'}</span>
            </button>

            <button
              onClick={fetchLogs}
              className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 transition"
              title="Refresh logs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Verification Status Banner */}
        {verifyResult && (
          <div className={`mt-4 p-3.5 rounded-lg border text-xs font-mono transition-all ${
            verifyResult.valid
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500/60 text-rose-800 dark:text-rose-300 animate-pulse'
          }`}>
            <div className="flex items-start gap-2.5">
              {verifyResult.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm flex items-center justify-between">
                  <span>{verifyResult.valid ? 'CRYPTO-INTEGRITY ASSURED' : 'CRITICAL INTEGRITY FAILURE DETECTED'}</span>
                  <span className="text-[11px] opacity-80">{new Date().toLocaleTimeString()}</span>
                </div>
                <div>{verifyResult.message || verifyResult.reason}</div>
                {verifyResult.valid ? (
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                    Chain Head Hash: <span className="text-emerald-600 dark:text-emerald-400">{verifyResult.headHash}</span> ({verifyResult.count} blocks)
                  </div>
                ) : (
                  <div className="text-[11px] space-y-0.5 text-rose-700 dark:text-rose-300/90 pt-1 border-t border-rose-500/20">
                    <div>Tampered Log ID: <span className="underline">{verifyResult.logId}</span></div>
                    <div>Action: {verifyResult.action} • Expected: {verifyResult.expectedHash?.slice(0, 16)}... • Actual: {verifyResult.actualHash?.slice(0, 16)}...</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Search resource, payload, or user..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-300 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              className="bg-zinc-50 dark:bg-[#18181b] border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">All Actions</option>
              <option value="AUTH_STEP1_SUCCESS">AUTH_STEP1_SUCCESS</option>
              <option value="AUTH_STEP1_FAILED">AUTH_STEP1_FAILED</option>
              <option value="AUTH_LOGIN_SUCCESS">AUTH_LOGIN_SUCCESS</option>
              <option value="FILE_WRITE">FILE_WRITE</option>
              <option value="FILE_CHMOD">FILE_CHMOD</option>
              <option value="FILE_TRASH">FILE_TRASH</option>
              <option value="FILE_DELETE_PERMANENT">FILE_DELETE_PERMANENT</option>
              <option value="ARCHIVE_EXTRACT">ARCHIVE_EXTRACT</option>
              <option value="SERVICE_START">SERVICE_START</option>
              <option value="SERVICE_STOP">SERVICE_STOP</option>
              <option value="SERVICE_RESTART">SERVICE_RESTART</option>
              <option value="PROCESS_SIGNAL">PROCESS_SIGNAL</option>
              <option value="TERMINAL_SESSION_CONNECT">TERMINAL_SESSION_CONNECT</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
          <span>{total} total records</span>
          <div className="flex items-center gap-1 border-l border-zinc-300 dark:border-zinc-800 pl-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-100/80 dark:bg-[#18181b]/80 border-b border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-400 font-mono">
                <th className="py-2.5 px-3 font-medium">Timestamp</th>
                <th className="py-2.5 px-3 font-medium">Action</th>
                <th className="py-2.5 px-3 font-medium">Actor & IP</th>
                <th className="py-2.5 px-3 font-medium">Target Resource</th>
                <th className="py-2.5 px-3 font-medium">Hash Link (SHA-256)</th>
                <th className="py-2.5 px-3 font-medium text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span>Loading cryptographic ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono">
                    No audit records matching query.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-zinc-100/70 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <span className="text-zinc-900 dark:text-zinc-200 font-semibold">{log.user}</span>
                      <span className="text-zinc-500 text-[11px] ml-1.5">({log.ip})</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-zinc-800 dark:text-zinc-300 max-w-xs truncate" title={log.target_resource}>
                      {log.target_resource || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-500 text-[10px]" title={`Prev: ${log.prev_hash}`}>
                          {log.prev_hash.slice(0, 6)}...
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-600">→</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[10px]" title={`Event Hash: ${log.event_hash}`}>
                          {log.event_hash.slice(0, 8)}...
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1 rounded bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition"
                        title="View Full Cryptographic Block"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Cryptographic Block Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Audit Block Record Inspector
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Block UUID</div>
                  <div className="text-zinc-900 dark:text-zinc-200 mt-1 flex items-center justify-between">
                    <span className="truncate">{selectedLog.id}</span>
                    <button
                      onClick={() => copyToClipboard(selectedLog.id, 'UUID')}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 ml-1"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Timestamp</div>
                  <div className="text-zinc-900 dark:text-zinc-200 mt-1">
                    {selectedLog.timestamp} ({new Date(selectedLog.timestamp).toISOString()})
                  </div>
                </div>
              </div>

              {/* Cryptographic Linkage Box */}
              <div className="bg-zinc-50 dark:bg-[#18181b] p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">
                  Cryptographic Chain Linkage
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Previous Hash (Parent Pointer):</div>
                  <div className="text-zinc-800 dark:text-zinc-300 flex items-center justify-between bg-zinc-200/70 dark:bg-black/40 px-2 py-1 rounded mt-0.5">
                    <span className="break-all">{selectedLog.prev_hash}</span>
                    <button
                      onClick={() => copyToClipboard(selectedLog.prev_hash, 'Prev Hash')}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 ml-2 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-zinc-500">Current Event SHA-256 Hash:</div>
                  <div className="text-emerald-700 dark:text-emerald-400 flex items-center justify-between bg-zinc-200/70 dark:bg-black/40 px-2 py-1 rounded mt-0.5">
                    <span className="break-all">{selectedLog.event_hash}</span>
                    <button
                      onClick={() => copyToClipboard(selectedLog.event_hash, 'Event Hash')}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 ml-2 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actor & Client Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Actor</div>
                  <div className="text-zinc-900 dark:text-zinc-200 mt-1">{selectedLog.user}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Client IP</div>
                  <div className="text-zinc-900 dark:text-zinc-200 mt-1">{selectedLog.ip}</div>
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase">User-Agent</div>
                <div className="text-zinc-800 dark:text-zinc-300 mt-1 break-all">{selectedLog.user_agent || 'N/A'}</div>
              </div>

              {/* Target & Payload */}
              <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase">Target Resource</div>
                <div className="text-zinc-900 dark:text-zinc-200 break-all">{selectedLog.target_resource || '—'}</div>
              </div>

              <div className="bg-zinc-50 dark:bg-[#18181b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase">Raw Payload</div>
                <pre className="p-2.5 rounded bg-zinc-100 dark:bg-black/60 text-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800/80 overflow-x-auto text-[11px] font-mono max-h-48 whitespace-pre-wrap">
                  {selectedLog.payload || 'null'}
                </pre>
              </div>
            </div>

            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#151518] flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
