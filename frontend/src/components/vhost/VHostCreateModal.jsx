import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Server,
  FolderTree,
  Repeat,
  Shield,
  ShieldCheck,
  Cpu,
  Loader2,
  HardDrive,
  Info
} from 'lucide-react';

const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const PUBLIC_IP = '132.145.70.205';

export default function VHostCreateModal({ isOpen, onClose, token, onCreated, onShowToast }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [domain, setDomain] = useState('');
  const [type, setType] = useState('proxy'); // 'proxy' | 'static' | 'redirect'
  const [target, setTarget] = useState('http://127.0.0.1:8888');
  const [supportWebSocket, setSupportWebSocket] = useState(true);
  const [supportSse, setSupportSse] = useState(true);
  const [clientMaxBodySize, setClientMaxBodySize] = useState('0');
  const [webRoot, setWebRoot] = useState('');
  const [redirectCode, setRedirectCode] = useState(301);

  // SSL Options
  const [autoSsl, setAutoSsl] = useState(false);
  const [email, setEmail] = useState('');
  const [dnsCheckLoading, setDnsCheckLoading] = useState(false);
  const [dnsCheckResult, setDnsCheckResult] = useState(null);

  // Docker Containers list for quick selection
  const [dockerContainers, setDockerContainers] = useState([]);
  const [loadingContainers, setLoadingContainers] = useState(false);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setError(null);
      setDomain('');
      setType('proxy');
      setTarget('http://127.0.0.1:8888');
      setSupportWebSocket(true);
      setSupportSse(true);
      setClientMaxBodySize('0');
      setWebRoot('');
      setRedirectCode(301);
      setAutoSsl(false);
      setEmail('');
      setDnsCheckResult(null);

      // Fetch running Docker containers for quick proxy pairing
      fetchDockerContainers();
    }
  }, [isOpen]);

  // Update default webRoot when domain changes
  useEffect(() => {
    if (domain) {
      setWebRoot(`/var/www/${domain.trim().toLowerCase()}/html`);
    }
  }, [domain]);

  const fetchDockerContainers = async () => {
    try {
      setLoadingContainers(true);
      const res = await fetch('/api/docker/containers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const list = await res.json();
        setDockerContainers(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.warn('Could not fetch docker containers:', err.message);
    } finally {
      setLoadingContainers(false);
    }
  };

  // Run pre-flight DNS check when entering step 3 with a valid domain
  const runDnsCheck = async () => {
    const cleanDomain = domain.trim().toLowerCase();
    if (!DOMAIN_REGEX.test(cleanDomain)) return;

    setDnsCheckLoading(true);
    try {
      const res = await fetch(`/api/vhosts/dns-check/${encodeURIComponent(cleanDomain)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDnsCheckResult(data);
    } catch (err) {
      setDnsCheckResult({ matches: false, warning: `DNS verification error: ${err.message}` });
    } finally {
      setDnsCheckLoading(false);
    }
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      const cleanDomain = domain.trim().toLowerCase();
      if (!cleanDomain) {
        setError('Please enter a valid domain name.');
        return;
      }
      if (!DOMAIN_REGEX.test(cleanDomain)) {
        setError('Domain must follow valid RFC syntax (e.g., api.example.com).');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (type === 'proxy' && !target.trim()) {
        setError('Upstream target URL or port is required.');
        return;
      }
      if (type === 'static' && !webRoot.trim()) {
        setError('Web root directory path is required.');
        return;
      }
      if (type === 'redirect' && !target.trim()) {
        setError('Redirect destination URL is required.');
        return;
      }
      setStep(3);
      runDnsCheck();
    }
  };

  const handleDockerSelect = (e) => {
    const selectedName = e.target.value;
    if (!selectedName) return;

    const container = dockerContainers.find(c => c.name === selectedName);
    if (!container) return;

    // Check exposed ports
    if (container.ports && container.ports.length > 0) {
      const publicPort = container.ports.find(p => p.PublicPort)?.PublicPort || container.ports[0].PrivatePort;
      setTarget(`http://127.0.0.1:${publicPort}`);
      onShowToast?.(`Mapped port ${publicPort} from container "${selectedName}"`, 'info');
    } else {
      setTarget('http://127.0.0.1:8888');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    const cleanDomain = domain.trim().toLowerCase();
    const payload = {
      domain: cleanDomain,
      type,
      target: type === 'redirect' ? target.trim() : (type === 'proxy' ? target.trim() : null),
      clientMaxBodySize,
      supportWebSocket,
      supportSse,
      redirectCode: Number(redirectCode),
      webRoot: type === 'static' ? webRoot.trim() : null,
      autoSsl,
      email: autoSsl ? email.trim() : null
    };

    try {
      const res = await fetch('/api/vhosts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create virtual host.');
      }

      onShowToast?.(`Virtual host for ${cleanDomain} created and validated successfully!`, 'success');
      if (data.ssl?.warning) {
        onShowToast?.(data.ssl.warning, 'warning');
      }
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden transition-colors animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header & Steps Indicator */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Create Virtual Host & Domain
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Step {step} of 3: {step === 1 ? 'Domain & Service Type' : step === 2 ? 'Upstream & Environment' : 'SSL & Security'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="whitespace-pre-wrap font-mono leading-relaxed">{error}</div>
            </div>
          )}

          {/* STEP 1: Domain & Service Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Primary Domain / FQDN <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value.toLowerCase())}
                    placeholder="app.example.com or demo.xus.me"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  RFC-compliant Fully Qualified Domain Name pointing to this server ({PUBLIC_IP}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Service Architecture Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    onClick={() => setType('proxy')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      type === 'proxy'
                        ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-emerald-600 dark:text-emerald-400">
                      <Server className="w-4 h-4" />
                      <span className="text-xs font-semibold">Reverse Proxy</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Pass traffic to Docker containers or local port (e.g. 127.0.0.1:8888).
                    </p>
                  </div>

                  <div
                    onClick={() => setType('static')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      type === 'static'
                        ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-sky-600 dark:text-sky-400">
                      <FolderTree className="w-4 h-4" />
                      <span className="text-xs font-semibold">Static Site</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Serve static HTML/JS/CSS directly from a fast web directory.
                    </p>
                  </div>

                  <div
                    onClick={() => setType('redirect')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      type === 'redirect'
                        ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-amber-600 dark:text-amber-400">
                      <Repeat className="w-4 h-4" />
                      <span className="text-xs font-semibold">Redirect</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Forward visitors to an external URL with 301/302 HTTP status.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Upstream & Environment */}
          {step === 2 && (
            <div className="space-y-4">
              {type === 'proxy' && (
                <>
                  {/* Docker Quick Select */}
                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                        Pick from Running Docker Containers (Power Feature)
                      </span>
                      {loadingContainers && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
                    </div>
                    <select
                      onChange={handleDockerSelect}
                      defaultValue=""
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Choose container to auto-map port --</option>
                      {dockerContainers.map(c => (
                        <option key={c.id} value={c.name}>
                          {c.name} ({c.image}) - {c.ports?.length ? c.ports.map(p => `${p.PublicPort || p.PrivatePort}`).join(', ') : 'internal socket'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Upstream Target URL / Port <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="http://127.0.0.1:8888"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      Local loopback service or container socket (e.g., http://127.0.0.1:8888).
                    </p>
                  </div>

                  {/* Advanced Proxy Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <input
                        type="checkbox"
                        checked={supportWebSocket}
                        onChange={(e) => setSupportWebSocket(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 block">
                          WebSocket Proxying
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Adds Upgrade & Connection headers for full-duplex WS/WSS.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <input
                        type="checkbox"
                        checked={supportSse}
                        onChange={(e) => setSupportSse(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 block">
                          SSE Non-Buffering
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Disables proxy_buffering for zero-latency event streaming.
                        </span>
                      </div>
                    </label>
                  </div>
                </>
              )}

              {type === 'static' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Web Root Directory Path <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={webRoot}
                    onChange={(e) => setWebRoot(e.target.value)}
                    placeholder="/var/www/domain/html"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    NexusControl will automatically create this directory with permissions and a default index.html.
                  </p>
                </div>
              )}

              {type === 'redirect' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Redirect Destination URL <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="https://nexuscontrol.io"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      HTTP Redirect Status Code
                    </label>
                    <select
                      value={redirectCode}
                      onChange={(e) => setRedirectCode(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={301}>301 Permanent Redirect (SEO friendly)</option>
                      <option value={302}>302 Temporary Redirect (Found)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Client Max Body Size */}
              <div className="pt-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Client Max Body Size (Upload Limit)
                </label>
                <input
                  type="text"
                  value={clientMaxBodySize}
                  onChange={(e) => setClientMaxBodySize(e.target.value)}
                  placeholder="0 (unlimited) or 100M"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Use "0" to disable upload limits, or specify e.g. "100M", "500M".
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: SSL Option & Live DNS Resolution */}
          {step === 3 && (
            <div className="space-y-4">
              {/* DNS Live Indicator */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    Pre-Flight DNS Resolution Check
                  </span>
                  <button
                    onClick={runDnsCheck}
                    disabled={dnsCheckLoading}
                    className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {dnsCheckLoading ? 'Checking...' : 'Re-check DNS'}
                  </button>
                </div>

                <div className="text-xs font-mono">
                  <span className="text-zinc-500">Domain:</span> <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{domain}</span>
                </div>
                <div className="text-xs font-mono">
                  <span className="text-zinc-500">Host Server IP:</span> <span className="text-zinc-900 dark:text-zinc-100">{PUBLIC_IP}</span>
                </div>

                {dnsCheckLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Querying DNS A-record over Node DNS resolver...</span>
                  </div>
                ) : dnsCheckResult ? (
                  dnsCheckResult.matches ? (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>DNS A-record successfully resolves to this VPS ({PUBLIC_IP}). Ready for Let's Encrypt!</span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span>DNS does not point to this server yet. (Resolved: {dnsCheckResult.addresses?.length ? dnsCheckResult.addresses.join(', ') : 'None'}).</span>
                        <p className="text-[11px] mt-0.5 text-zinc-500 dark:text-zinc-400">
                          You can still create the vHost now, and request SSL later after DNS propagates.
                        </p>
                      </div>
                    </div>
                  )
                ) : null}
              </div>

              {/* SSL Provisioning Option */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSsl}
                    onChange={(e) => setAutoSsl(e.target.checked)}
                    className="mt-1 rounded text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Automatically provision Let's Encrypt SSL Certificate
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                      Executes Certbot to issue a trusted certificate and auto-redirect HTTP to HTTPS.
                    </span>
                  </div>
                </label>

                {autoSsl && (
                  <div className="pl-6 pt-1">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Administrator Email for Let's Encrypt <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-colors"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{loading ? 'Validating & Staging...' : 'Create Virtual Host'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
