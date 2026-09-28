import React, { useState } from 'react';
import { ShieldAlert, X, Loader2, AlertCircle, Ban } from 'lucide-react';

export default function ManualBanModal({ isOpen, onClose, jails = [], initialJail, token, onShowToast, onBanned }) {
  const [jail, setJail] = useState(initialJail || (jails[0] || 'sshd'));
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanIp = ip.trim();
    if (!cleanIp) {
      setError('IP address is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/security/fail2ban/jails/${encodeURIComponent(jail)}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ip: cleanIp })
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast?.(data.message || `IP ${cleanIp} banned in jail "${jail}".`, 'success');
        onBanned?.();
        onClose();
      } else {
        setError(data.error || 'Failed to ban IP address.');
      }
    } catch (err) {
      setError(err.message || 'Network error while banning IP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Manual IP Ban
              </h3>
              <p className="text-xs text-zinc-500">
                Immediately block a malicious IP across Fail2ban filters
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

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-500">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Target Jail *
            </label>
            {jails.length > 0 ? (
              <select
                value={jail}
                onChange={(e) => setJail(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
              >
                {jails.map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={jail}
                onChange={(e) => setJail(e.target.value)}
                placeholder="sshd"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                required
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              IP Address to Ban *
            </label>
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="e.g. 198.51.100.24"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
              required
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Host iptables/nftables firewall will drop all future packets from this host.
            </p>
          </div>

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
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow-md shadow-rose-600/25 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Ban IP Address
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
