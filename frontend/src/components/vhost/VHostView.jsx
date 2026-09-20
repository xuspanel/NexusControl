import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  FolderTree,
  Repeat,
  FileCode2,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Cpu,
  Power
} from 'lucide-react';
import VHostCreateModal from './VHostCreateModal';
import VHostConfigModal from './VHostConfigModal';
import ConfirmModal from '../ConfirmModal';

export default function VHostView({ token, onShowToast }) {
  const [vhosts, setVhosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [configModalVHost, setConfigModalVHost] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SSL Quick-Issue Modal State
  const [sslModalTarget, setSslModalTarget] = useState(null);
  const [sslEmail, setSslEmail] = useState('');
  const [sslLoading, setSslLoading] = useState(false);
  const [sslError, setSslError] = useState(null);

  const fetchVHosts = async (silent = false) => {
    if (!silent) setLoading(true);
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/vhosts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Failed to load virtual hosts.');
      }
      const data = await res.json();
      setVhosts(Array.isArray(data) ? data : []);
    } catch (err) {
      onShowToast?.(`Error fetching vhosts: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVHosts();
  }, [token]);

  // Summary Metrics
  const summary = useMemo(() => {
    const total = vhosts.length;
    const active = vhosts.filter(v => v.enabled).length;
    const proxies = vhosts.filter(v => v.type === 'proxy').length;
    const sslSecured = vhosts.filter(v => v.ssl?.hasCertificate && !v.ssl?.isExpired).length;
    return { total, active, proxies, sslSecured, disabled: total - active };
  }, [vhosts]);

  // Filtered List
  const filteredVhosts = useMemo(() => {
    if (!searchQuery.trim()) return vhosts;
    const q = searchQuery.toLowerCase();
    return vhosts.filter(v =>
      v.domain?.toLowerCase().includes(q) ||
      v.target?.toLowerCase().includes(q) ||
      v.type?.toLowerCase().includes(q)
    );
  }, [vhosts, searchQuery]);

  // State Toggle Handler (active <-> disabled)
  const handleToggle = async (vhost) => {
    const domain = vhost.domain;
    try {
      const res = await fetch(`/api/vhosts/${encodeURIComponent(domain)}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to toggle virtual host state.');
      }

      setVhosts(prev => prev.map(v => v.domain === domain ? { ...v, enabled: data.enabled } : v));
      onShowToast?.(`Virtual host ${domain} is now ${data.enabled ? 'ACTIVE' : 'DISABLED'}`, 'success');
    } catch (err) {
      onShowToast?.(`Toggle failed: ${err.message}`, 'error');
    }
  };

  // View Config Handler
  const handleViewConfig = async (vhost) => {
    try {
      const res = await fetch(`/api/vhosts/${encodeURIComponent(vhost.domain)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not fetch configuration file.');
      const data = await res.json();
      setConfigModalVHost(data);
    } catch (err) {
      onShowToast?.(`Failed to read config: ${err.message}`, 'error');
    }
  };

  // Delete Handler
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const domain = deleteTarget.domain;
    try {
      const res = await fetch(`/api/vhosts/${encodeURIComponent(domain)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete virtual host.');

      setVhosts(prev => prev.filter(v => v.domain !== domain));
      onShowToast?.(`Virtual host ${domain} successfully removed and Nginx reloaded.`, 'success');
    } catch (err) {
      onShowToast?.(`Delete failed: ${err.message}`, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // SSL Issuance Handler
  const handleIssueSsl = async () => {
    if (!sslModalTarget) return;
    setSslLoading(true);
    setSslError(null);

    try {
      const res = await fetch(`/api/vhosts/${encodeURIComponent(sslModalTarget.domain)}/ssl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: sslEmail.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Certbot SSL issuance failed.');
      }

      onShowToast?.(`Let's Encrypt SSL certificate successfully activated for ${sslModalTarget.domain}!`, 'success');
      setSslModalTarget(null);
      fetchVHosts(true);
    } catch (err) {
      setSslError(err.message);
    } finally {
      setSslLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Summary Statistics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <span>TOTAL DOMAINS</span>
            <Globe className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 font-mono">
            {summary.total}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {summary.active} active • {summary.disabled} disabled
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <span>REVERSE PROXIES</span>
            <Server className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 font-mono">
            {summary.proxies}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Routing Docker & local daemons
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <span>SSL SECURED</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {summary.sslSecured}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Automated Let's Encrypt certificates
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <span>PIPELINE ENGINE</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Nginx 1.28 Atomic
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Zero-downtime syntax validation
          </div>
        </div>
      </div>

      {/* 2. Control Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search domains, upstream targets..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => fetchVHosts(false)}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-white dark:bg-[#121215] hover:bg-zinc-100 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
            title="Refresh vHost list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Virtual Host</span>
          </button>
        </div>
      </div>

      {/* 3. Managed Virtual Hosts Table */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 font-mono uppercase text-[11px]">
                <th className="py-3 px-4">Domain Name</th>
                <th className="py-3 px-4">Architecture & Target</th>
                <th className="py-3 px-4">SSL Security</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      <span>Scanning managed virtual hosts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredVhosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    <Globe className="w-8 h-8 mx-auto mb-2 text-zinc-400 stroke-1" />
                    <span>No managed virtual hosts found. Click "Add Virtual Host" to configure a domain.</span>
                  </td>
                </tr>
              ) : (
                filteredVhosts.map(vhost => {
                  const isSslValid = vhost.ssl?.hasCertificate && !vhost.ssl?.isExpired;
                  const daysLeft = vhost.ssl?.daysRemaining ?? 0;
                  const isExpiringSoon = isSslValid && daysLeft <= 15;

                  return (
                    <tr
                      key={vhost.domain}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      {/* Domain Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={`${isSslValid ? 'https' : 'http'}://${vhost.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1.5 group"
                          >
                            <span>{vhost.domain}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400" />
                          </a>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {vhost.filename}
                        </div>
                      </td>

                      {/* Type & Target */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border flex items-center gap-1 ${
                            vhost.type === 'proxy'
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                              : vhost.type === 'static'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          }`}>
                            {vhost.type === 'proxy' && <Server className="w-3 h-3" />}
                            {vhost.type === 'static' && <FolderTree className="w-3 h-3" />}
                            {vhost.type === 'redirect' && <Repeat className="w-3 h-3" />}
                            <span>{vhost.type}</span>
                          </span>

                          <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-xs font-mono text-[11px]" title={vhost.target}>
                            {vhost.target}
                          </span>
                        </div>
                        {vhost.type === 'proxy' && (
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                            {vhost.webSocket && <span>• WS Enabled</span>}
                            {vhost.sse && <span>• SSE Non-Buffered</span>}
                            <span>• Body: {vhost.bodySize === '0' ? 'Unlimited' : vhost.bodySize}</span>
                          </div>
                        )}
                      </td>

                      {/* SSL Status Badge */}
                      <td className="py-3 px-4">
                        {isSslValid ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${
                            isExpiringSoon
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          }`}>
                            <Lock className="w-3 h-3" />
                            <span>SSL Active ({daysLeft}d left)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Unlock className="w-3 h-3" />
                            <span>HTTP Only (No SSL)</span>
                          </span>
                        )}
                      </td>

                      {/* Active Switch */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggle(vhost)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            vhost.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                          }`}
                          title={vhost.enabled ? 'Click to Disable' : 'Click to Enable'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              vhost.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {!isSslValid && (
                            <button
                              onClick={() => {
                                setSslModalTarget(vhost);
                                setSslEmail('');
                                setSslError(null);
                              }}
                              className="px-2 py-1 text-[11px] rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors flex items-center gap-1"
                              title="Issue Let's Encrypt SSL"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>SSL</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleViewConfig(vhost)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="View Nginx Config"
                          >
                            <FileCode2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(vhost)}
                            className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title="Delete vHost"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Modal Wizard */}
      <VHostCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        token={token}
        onCreated={() => fetchVHosts(true)}
        onShowToast={onShowToast}
      />

      {/* Monaco Config Viewer Modal */}
      <VHostConfigModal
        isOpen={!!configModalVHost}
        onClose={() => setConfigModalVHost(null)}
        vhost={configModalVHost}
        onShowToast={onShowToast}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Virtual Host"
        message={`Are you sure you want to permanently delete virtual host "${deleteTarget?.domain}"? The Nginx configuration file will be unlinked and Nginx will be atomically reloaded.`}
        confirmText="Delete Virtual Host"
        danger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Quick SSL Issue Modal */}
      {sslModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-150 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Issue Let's Encrypt SSL
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">{sslModalTarget.domain}</p>
                </div>
              </div>
              <button
                onClick={() => setSslModalTarget(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-1"
              >
                X
              </button>
            </div>

            {sslError && (
              <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {sslError}
              </div>
            )}

            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              NexusControl will perform a pre-flight DNS A-record verification, execute Certbot, and activate an automated HTTPS redirect.
            </p>

            <div className="mb-5">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Administrator Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={sslEmail}
                onChange={(e) => setSslEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setSslModalTarget(null)}
                disabled={sslLoading}
                className="px-4 py-2 text-xs font-medium rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueSsl}
                disabled={sslLoading || !sslEmail.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-colors disabled:opacity-50"
              >
                {sslLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{sslLoading ? 'Executing Certbot...' : 'Issue Certificate'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
