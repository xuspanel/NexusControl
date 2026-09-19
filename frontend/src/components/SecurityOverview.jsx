import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  RefreshCw, 
  Flame, 
  Radio, 
  AlertTriangle,
  Layers
} from 'lucide-react';

export default function SecurityOverview({ token }) {
  const [securityData, setSecurityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ports'); // 'ports' | 'ufw' | 'ssh'

  const fetchSecurity = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/system/security', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSecurityData(data);
      }
    } catch (err) {
      console.error('Failed to fetch security info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurity();
    const interval = setInterval(fetchSecurity, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const ufw = securityData?.ufw;
  const ports = securityData?.ports || [];
  const sshFails = securityData?.sshFails;

  return (
    <div className="nx-card p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800/80 mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Network & Security Overview
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Open sockets, firewall perimeter & brute-force audit</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Sub-tabs */}
          <div className="inline-flex bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('ports')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'ports' ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Listening Ports ({ports.length})
            </button>
            <button
              onClick={() => setActiveTab('ufw')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'ufw' ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Firewall (UFW)
            </button>
            <button
              onClick={() => setActiveTab('ssh')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'ssh' ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Failed SSH ({sshFails?.totalCount || 0})
            </button>
          </div>

          <button
            onClick={fetchSecurity}
            title="Refresh Security Status"
            className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab 1: Listening Ports */}
      {activeTab === 'ports' && (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800/60 text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider sticky top-0 bg-white dark:bg-[#121215]">
                <th className="py-2 px-3">Port</th>
                <th className="py-2 px-3">Proto</th>
                <th className="py-2 px-3">Bind Address</th>
                <th className="py-2 px-3">Process</th>
                <th className="py-2 px-3 text-right">PID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40">
              {ports.map((p, idx) => (
                <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="py-2 px-3 font-semibold text-emerald-600 dark:text-emerald-400">{p.port}</td>
                  <td className="py-2 px-3 uppercase text-zinc-600 dark:text-zinc-400">{p.proto}</td>
                  <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{p.address}</td>
                  <td className="py-2 px-3 text-zinc-900 dark:text-zinc-200 font-medium">{p.process}</td>
                  <td className="py-2 px-3 text-right text-zinc-500">{p.pid}</td>
                </tr>
              ))}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-400 dark:text-zinc-500">
                    No active listening ports detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: UFW Status & Rules */}
      {activeTab === 'ufw' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 transition-colors">
            <div className="flex items-center space-x-2">
              {ufw?.active ? (
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Unlock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-200">Uncomplicated Firewall (UFW)</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
              ufw?.active 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}>
              {ufw?.active ? 'ACTIVE & ENFORCED' : 'INACTIVE'}
            </span>
          </div>

          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/60 text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2 px-3">Rule #</th>
                  <th className="py-2 px-3">Target Port / Service</th>
                  <th className="py-2 px-3">Action</th>
                  <th className="py-2 px-3">Source Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40">
                {ufw?.rules?.map((r) => (
                  <tr key={r.num} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="py-2 px-3 text-zinc-500">[{r.num}]</td>
                    <td className="py-2 px-3 font-semibold text-zinc-900 dark:text-zinc-200">{r.to}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px]">
                        {r.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">{r.from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Failed SSH Logins */}
      {activeTab === 'ssh' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-50 dark:bg-[#09090b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 transition-colors">
              <span className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-400 block">Recent Failed Logins</span>
              <span className="text-2xl font-mono font-bold text-rose-600 dark:text-rose-400">
                {sshFails?.totalCount || 0}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">Scanned from auth journal</span>
            </div>

            <div className="bg-zinc-50 dark:bg-[#09090b] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 transition-colors">
              <span className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-400 block mb-1">Top Offending IPs</span>
              <div className="space-y-1">
                {sshFails?.topAttackers?.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-700 dark:text-zinc-300">{a.ip}</span>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">{a.count} attempts</span>
                  </div>
                ))}
                {(!sshFails?.topAttackers || sshFails.topAttackers.length === 0) && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">No repeat offenders detected.</span>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-56">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/60 text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="py-1.5 px-3">Timestamp</th>
                  <th className="py-1.5 px-3">Attacker IP</th>
                  <th className="py-1.5 px-3">Target User</th>
                  <th className="py-1.5 px-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40">
                {sshFails?.recentAttempts?.map((att, i) => (
                  <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="py-1.5 px-3 text-zinc-500">{att.timestamp}</td>
                    <td className="py-1.5 px-3 text-rose-600 dark:text-rose-400 font-semibold">{att.ip}</td>
                    <td className="py-1.5 px-3 text-zinc-700 dark:text-zinc-300">{att.user}</td>
                    <td className="py-1.5 px-3 text-zinc-600 dark:text-zinc-400">{att.reason}</td>
                  </tr>
                ))}
                {(!sshFails?.recentAttempts || sshFails.recentAttempts.length === 0) && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-zinc-400 dark:text-zinc-500">
                      Zero failed SSH attempts in recent journal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
