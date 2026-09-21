import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Key,
  Network,
  Plus,
  Trash2,
  Download,
  Eye,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  Lock,
  Activity,
  User,
  AlertTriangle,
  Radio,
  FileCode
} from 'lucide-react';

export default function WireGuardView({ token, onShowToast }) {
  const [status, setStatus] = useState(null);
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);

  // New peer form state
  const [peerUsername, setPeerUsername] = useState('');
  const [creatingPeer, setCreatingPeer] = useState(false);
  const [formError, setFormError] = useState('');

  // Revoke peer confirm state
  const [peerToRevoke, setPeerToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);

  // Copy state
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedPeerKey, setCopiedPeerKey] = useState(null);

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const fetchWireGuardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const [statusRes, peersRes] = await Promise.all([
        fetch('/api/wireguard/status', { headers: authHeaders }),
        fetch('/api/wireguard/peers', { headers: authHeaders })
      ]);

      if (!statusRes.ok) {
        throw new Error('Failed to retrieve WireGuard server status.');
      }
      if (!peersRes.ok) {
        throw new Error('Failed to retrieve active WireGuard peers.');
      }

      const statusData = await statusRes.json();
      const peersData = await peersRes.json();

      setStatus(statusData.status || null);
      setPeers(peersData.peers || []);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders, onShowToast]);

  useEffect(() => {
    fetchWireGuardData(false);
  }, [fetchWireGuardData]);

  const handleCopyServerKey = () => {
    if (!status?.publicKey) return;
    navigator.clipboard.writeText(status.publicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    if (onShowToast) onShowToast('Server Public Key copied to clipboard', 'info');
  };

  const handleCopyPeerKey = (key, id) => {
    navigator.clipboard.writeText(key);
    setCopiedPeerKey(id);
    setTimeout(() => setCopiedPeerKey(null), 2000);
    if (onShowToast) onShowToast('Peer Public Key copied to clipboard', 'info');
  };

  const handleCopyRawConfig = () => {
    if (!activeConfig?.clientConfig) return;
    navigator.clipboard.writeText(activeConfig.clientConfig);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
    if (onShowToast) onShowToast('Client WireGuard configuration copied', 'info');
  };

  const handleShowConfig = async (peerId) => {
    setConfigLoading(true);
    setIsConfigModalOpen(true);
    try {
      const res = await fetch(`/api/wireguard/peers/${peerId}/config`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load peer configuration.');
      const data = await res.json();
      setActiveConfig(data.config);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
      setIsConfigModalOpen(false);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleDownloadConfig = (peerId, username) => {
    const url = `/api/wireguard/peers/${peerId}/config?download=true&token=${token}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${username || 'peer'}-wg0.conf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onShowToast) onShowToast(`Downloading ${username || 'peer'}-wg0.conf`, 'info');
  };

  const handleCreatePeer = async (e) => {
    e.preventDefault();
    if (!peerUsername.trim()) {
      setFormError('Please enter a username or client label.');
      return;
    }
    setFormError('');
    setCreatingPeer(true);

    try {
      const res = await fetch('/api/wireguard/peers', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ username: peerUsername.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create WireGuard peer profile.');
      }

      if (onShowToast) onShowToast(`WireGuard peer '${peerUsername}' provisioned successfully`, 'success');
      setPeerUsername('');
      setIsCreateModalOpen(false);
      await fetchWireGuardData(true);

      // Immediately open configuration modal with the new peer
      if (data.peer) {
        setActiveConfig(data.peer);
        setIsConfigModalOpen(true);
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreatingPeer(false);
    }
  };

  const handleRevokePeer = async () => {
    if (!peerToRevoke) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/wireguard/peers/${peerToRevoke.id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke WireGuard peer.');
      }

      if (onShowToast) onShowToast(`WireGuard peer '${peerToRevoke.username}' revoked`, 'info');
      setPeerToRevoke(null);
      await fetchWireGuardData(true);
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Zero Trust Architecture Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-emerald-500/20 shadow-2xl p-6">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-inner">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Zero Trust Network
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    WireGuard 10.8.0.1/24
                  </span>
                </h1>
              </div>
              <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                Cryptographically isolated kernel mesh tunnel. Encrypt management traffic, enforce mutual peer authentication, and provision mobile QR profiles instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
            <button
              onClick={() => fetchWireGuardData(false)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white text-xs font-medium border border-zinc-700/60 transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Provision New Peer
            </button>
          </div>
        </div>

        {/* Telemetry & Server Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-800/60">
          <div className="bg-zinc-950/60 rounded-xl p-3.5 border border-zinc-800/80">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                Interface Status
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE (wg0)
              </span>
            </div>
            <div className="mt-2 text-lg font-bold font-mono text-zinc-100">
              {status?.address || '10.8.0.1/24'}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Port: {status?.listenPort || 51820} UDP • Kernel Fast Path
            </div>
          </div>

          <div className="bg-zinc-950/60 rounded-xl p-3.5 border border-zinc-800/80">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="w-3.5 h-3.5 text-blue-400" />
                IPv4 Forwarding
              </span>
              <span className={`text-[11px] font-mono font-semibold ${status?.ipForwarding ? 'text-emerald-400' : 'text-amber-400'}`}>
                {status?.ipForwarding ? 'ENABLED (sysctl 1)' : 'DISABLED'}
              </span>
            </div>
            <div className="mt-2 text-lg font-bold font-mono text-zinc-100">
              Mesh Routing
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Zero-Downtime Hot Sync (<code className="text-zinc-400 font-mono">wg syncconf</code>)
            </div>
          </div>

          <div className="bg-zinc-950/60 rounded-xl p-3.5 border border-zinc-800/80">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Network className="w-3.5 h-3.5 text-teal-400" />
                Connected Peers
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                10.8.0.2 .. 254
              </span>
            </div>
            <div className="mt-2 text-lg font-bold font-mono text-zinc-100">
              {peers.length} Assigned
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {253 - peers.length} IP slots remaining
            </div>
          </div>

          <div className="bg-zinc-950/60 rounded-xl p-3.5 border border-zinc-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                Server Public Key
              </span>
              <button
                onClick={handleCopyServerKey}
                className="text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
                title="Copy Public Key"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedKey ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-1 text-xs font-mono text-zinc-300 truncate bg-zinc-900/80 p-1.5 rounded border border-zinc-800 select-all" title={status?.publicKey || ''}>
              {status?.publicKey || 'Loading key...'}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Curve25519 (Diffie-Hellman)
            </div>
          </div>
        </div>
      </div>

      {/* 2. Active Peers Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 border-b border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Provisioned Client Peers
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Authorized endpoints permitted to tunnel through <code className="text-emerald-400 font-mono">10.8.0.0/24</code>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-zinc-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-medium">Querying WireGuard kernel interface...</p>
          </div>
        ) : peers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mx-auto mb-3 text-zinc-400">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">No VPN Peers Provisioned</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Generate client profiles to access your NexusControl dashboard securely over an encrypted WireGuard tunnel.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Provision First Peer
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-mono uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">User / Client Label</th>
                  <th className="py-3 px-4 font-semibold">Assigned IP</th>
                  <th className="py-3 px-4 font-semibold">Public Key</th>
                  <th className="py-3 px-4 font-semibold">Created</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {peers.map((peer) => (
                  <tr key={peer.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-100 flex items-center gap-2">
                            {peer.username}
                            {peer.user_id && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Linked User
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                            ID: {peer.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                        {peer.internal_ip}/32
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[140px] text-zinc-300" title={peer.public_key}>
                          {peer.public_key}
                        </span>
                        <button
                          onClick={() => handleCopyPeerKey(peer.public_key, peer.id)}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors"
                          title="Copy Full Public Key"
                        >
                          {copiedPeerKey === peer.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                      {new Date(peer.created_at).toLocaleDateString()} {new Date(peer.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleShowConfig(peer.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                          title="Show QR Code and .conf configuration"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="hidden sm:inline">Show Config</span>
                        </button>
                        <button
                          onClick={() => handleDownloadConfig(peer.id, peer.username)}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          title="Download .conf file"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button
                          onClick={() => setPeerToRevoke(peer)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                          title="Revoke and strip peer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Modal: Provision New Peer */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-up">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Provision WireGuard Peer</h3>
                  <p className="text-xs text-zinc-400">Generate asymmetric Curve25519 tunnel profile</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-zinc-500 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePeer} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Client Identifier / Username <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={peerUsername}
                  onChange={(e) => setPeerUsername(e.target.value)}
                  placeholder="e.g. dev-laptop, alex-phone, admin-workstation"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  autoFocus
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Assigned sequential IP in the <code className="text-zinc-400 font-mono">10.8.0.x/24</code> subnet automatically.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPeer}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
                >
                  {creatingPeer ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Generating Keypair...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Provision Peer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Show Configuration & QR Code */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-up max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    WireGuard Peer Configuration
                    {activeConfig?.username && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                        {activeConfig.username} ({activeConfig.internalIp || activeConfig.internal_ip})
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-zinc-400">Scan QR with WireGuard iOS/Android app or import .conf on desktop</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsConfigModalOpen(false);
                  setActiveConfig(null);
                }}
                className="text-zinc-500 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {configLoading ? (
                <div className="py-12 text-center text-zinc-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400 mb-3" />
                  <p className="text-sm font-medium">Rendering WireGuard configuration and QR code...</p>
                </div>
              ) : activeConfig ? (
                <>
                  {/* Top Split: QR Code and Peer Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-zinc-950 p-5 rounded-xl border border-zinc-800">
                    <div className="flex flex-col items-center justify-center">
                      {activeConfig.qrCodeDataUrl ? (
                        <div className="bg-white p-3 rounded-2xl shadow-xl border-4 border-emerald-500/30">
                          <img
                            src={activeConfig.qrCodeDataUrl}
                            alt="WireGuard Mobile QR Code"
                            className="w-48 h-48 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-48 h-48 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-xs text-zinc-500">
                          QR Code Unavailable
                        </div>
                      )}
                      <p className="text-[11px] text-zinc-400 mt-2 font-mono flex items-center gap-1">
                        <QrCode className="w-3 h-3 text-emerald-400" />
                        Scan directly with WireGuard Mobile
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-zinc-500 font-mono uppercase text-[10px]">Client Address</span>
                        <div className="font-mono text-sm font-bold text-emerald-400 mt-0.5">
                          {activeConfig.internalIp || activeConfig.internal_ip}/32
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 font-mono uppercase text-[10px]">Client Public Key</span>
                        <div className="font-mono text-zinc-300 truncate bg-zinc-900 p-1.5 rounded border border-zinc-800 mt-0.5 select-all">
                          {activeConfig.publicKey || activeConfig.public_key}
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          onClick={() => handleDownloadConfig(activeConfig.id, activeConfig.username)}
                          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download {activeConfig.username || 'client'}.conf
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Raw .conf preview */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-blue-400" />
                        Raw WireGuard Client Profile (.conf)
                      </span>
                      <button
                        onClick={handleCopyRawConfig}
                        className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1 font-mono"
                      >
                        {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedConfig ? 'Copied' : 'Copy Config'}
                      </button>
                    </div>
                    <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-xs overflow-x-auto select-all leading-relaxed whitespace-pre">
                      {activeConfig.clientConfig || activeConfig.client_config || '# Configuration generated'}
                    </pre>
                  </div>
                </>
              ) : null}
            </div>

            <div className="p-4 border-t border-zinc-800 flex justify-end shrink-0">
              <button
                onClick={() => {
                  setIsConfigModalOpen(false);
                  setActiveConfig(null);
                }}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Revoke Confirmation */}
      {peerToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Revoke VPN Peer</h3>
                <p className="text-xs text-zinc-400">Permanent cryptographic termination</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to revoke <strong className="text-white font-mono">{peerToRevoke.username}</strong> ({peerToRevoke.internal_ip})?
              The peer will be permanently removed from <code className="text-zinc-400 font-mono">/etc/wireguard/wg0.conf</code> and immediately dropped from the active interface.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPeerToRevoke(null)}
                disabled={revoking}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokePeer}
                disabled={revoking}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 transition-all flex items-center gap-2"
              >
                {revoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Revoke & Drop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
