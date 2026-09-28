import React, { useState } from 'react';
import { Shield, Plus, X, Loader2, AlertCircle, Sparkles } from 'lucide-react';

export default function OpenPortModal({ isOpen, onClose, token, onShowToast, onRuleAdded }) {
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const presets = [
    { label: '80 (HTTP)', port: '80', proto: 'tcp' },
    { label: '443 (HTTPS)', port: '443', proto: 'tcp' },
    { label: '3000 (Dev/Node)', port: '3000', proto: 'tcp' },
    { label: '8080 (Web Alt)', port: '8080', proto: 'tcp' },
    { label: '5432 (PostgreSQL)', port: '5432', proto: 'tcp' },
    { label: '6379 (Redis)', port: '6379', proto: 'tcp' },
    { label: '51820 (WireGuard)', port: '51820', proto: 'udp' }
  ];

  const handleSelectPreset = (p) => {
    setPort(p.port);
    setProtocol(p.proto);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanPort = port.trim();
    if (!cleanPort) {
      setError('Port number or service identifier is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/security/firewall/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          port: cleanPort,
          protocol
        })
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast?.(data.message || `Port ${cleanPort}/${protocol} opened successfully`, 'success');
        onRuleAdded?.();
        onClose();
      } else {
        setError(data.error || 'Failed to open firewall port.');
      }
    } catch (err) {
      setError(err.message || 'Network error while adding firewall rule.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Open Firewall Port
              </h3>
              <p className="text-xs text-zinc-500">
                Allow inbound traffic on host firewall (UFW / Firewalld)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="mt-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            Standard Service Presets:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-emerald-500/20 hover:text-emerald-500 transition-colors font-mono cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-500">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Port Number *
              </label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="e.g. 8080"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Protocol
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Rule will be applied immediately across IPv4 and IPv6 without service interruption.
          </p>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/25 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Open Port
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
