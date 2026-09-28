import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Shield,
  ShieldCheck,
  Lock,
  RefreshCw,
  Globe,
  Radio,
  Server,
  Activity
} from 'lucide-react';
import FirewallTab from './FirewallTab';
import Fail2banTab from './Fail2banTab';

export default function SecurityView({ token, onShowToast, onNavigateTab }) {
  const [activeTab, setActiveTab] = useState('firewall'); // 'firewall' | 'fail2ban'
  const [firewallData, setFirewallData] = useState(null);
  const [loadingFw, setLoadingFw] = useState(true);
  const [refreshingFw, setRefreshingFw] = useState(false);

  // Fetch firewall rules
  const fetchFirewall = useCallback(async (isManual = false) => {
    if (!token) return;
    if (isManual) setRefreshingFw(true);
    else setLoadingFw(true);

    try {
      const res = await fetch('/api/security/firewall/rules', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setFirewallData(data);
      } else {
        if (res.status === 503 || data.isInstalled === false) {
          setFirewallData({ isInstalled: false, rules: [] });
        } else {
          if (isManual) onShowToast?.(data.error || 'Failed to fetch firewall status', 'error');
        }
      }
    } catch (err) {
      if (isManual) onShowToast?.(err.message || 'Error communicating with firewall API', 'error');
    } finally {
      setLoadingFw(false);
      setRefreshingFw(false);
    }
  }, [token, onShowToast]);

  useEffect(() => {
    fetchFirewall();
  }, [fetchFirewall]);

  const rulesCount = firewallData?.rules?.length || 0;
  const fwType = firewallData?.type ? firewallData.type.toUpperCase() : 'FIREWALL';
  const isFwActive = firewallData?.status === 'active';

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Firewall &amp; Intrusion Defense
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                L3/L4 Security
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              OS-agnostic packet filtering (UFW / Firewalld), Fail2ban jail supervision &amp; GeoIP attack mitigation
            </p>
          </div>
        </div>

        {/* Primary Tab Switcher */}
        <div className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 shadow-xs self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('firewall')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'firewall'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            Firewall Rules
            {rulesCount > 0 && (
              <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {rulesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('fail2ban')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'fail2ban'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            Intrusion Defense (Fail2ban)
          </button>
        </div>
      </div>

      {/* Aggregate Telemetry Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Active Firewall Engine */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>Firewall Engine</span>
            <Shield className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {fwType}
            {isFwActive ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : null}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            {isFwActive ? 'Enforcing drop policies' : 'Service offline'}
          </div>
        </div>

        {/* Allowed Ports */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>Allowed Ports</span>
            <Server className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {rulesCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            TCP/UDP inbound rules
          </div>
        </div>

        {/* Intrusion Protection */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>Brute-Force Guard</span>
            <Lock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-500 flex items-center gap-1.5">
            FAIL2BAN
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            Automated jail mitigation
          </div>
        </div>

        {/* Offline GeoIP Resolution */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>GeoIP Engine</span>
            <Globe className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-500">
            OFFLINE DB
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            Zero-latency ASN &amp; city lookup
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'firewall' ? (
        <FirewallTab
          firewallData={firewallData}
          loading={loadingFw}
          refreshing={refreshingFw}
          onRefresh={() => fetchFirewall(true)}
          token={token}
          onShowToast={onShowToast}
        />
      ) : (
        <Fail2banTab
          token={token}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
