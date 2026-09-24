import React, { useState } from 'react';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Clock, 
  Radio, 
  Copy, 
  Check, 
  LogOut, 
  ShieldCheck, 
  AlertTriangle, 
  AlertOctagon,
  RefreshCw,
  Globe
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import OsBadge from './OsBadge';
import { useAuth } from '../context/AuthContext';
import TwoFactorModal from './TwoFactorModal';

export default function HeaderProfile({ profile, telemetry, connected, onLogout, onRefresh }) {
  const { twoFactorEnabled, refreshUser, token } = useAuth();
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [copiedIp, setCopiedIp] = useState(null);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(type);
    setTimeout(() => setCopiedIp(null), 1500);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const health = telemetry?.health?.status || 'Healthy';
  const healthColor = health === 'Critical' ? 'rose' : health === 'Degraded' ? 'amber' : 'emerald';

  return (
    <header className="bg-white dark:bg-[#121215] border-b border-zinc-200 dark:border-zinc-800/80 px-4 lg:px-8 py-4 transition-colors">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top bar: Brand, Live indicator, Health Badge, Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">NexusControl</h1>
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50">
                  {profile?.hostname || 'ubuntu-vps'}
                </span>
                {/* Live stream status */}
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                  connected 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse-fast' : 'bg-amber-500 dark:bg-amber-400'}`} />
                  {connected ? 'LIVE 1.5s' : 'POLLING'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                  <OsBadge osId={profile?.osId} osName={profile?.os} className="w-4 h-4 shrink-0 shadow-sm rounded-full" />
                  <span>{profile?.os || 'Ubuntu Linux'}</span>
                </span>
                <span className="text-zinc-400 dark:text-zinc-600">•</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60 uppercase font-sans font-semibold">
                    {profile?.osFamily || 'debian'}
                  </span>
                  <span>{profile?.kernel || '7.0.0-1009-oracle'} ({profile?.arch || 'aarch64'})</span>
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* System Health Badge */}
            <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${
              health === 'Critical'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                : health === 'Degraded'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            }`}>
              {health === 'Critical' ? (
                <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              ) : health === 'Degraded' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
              <div className="text-left">
                <div className="text-[10px] uppercase font-mono tracking-wider opacity-80 leading-none">System Status</div>
                <div className="text-xs font-semibold leading-tight mt-0.5">{health.toUpperCase()}</div>
              </div>
            </div>

            {/* 2FA Status Badge & Trigger */}
            <button
              onClick={() => setIs2faModalOpen(true)}
              title={twoFactorEnabled ? 'Two-Factor Authentication is Active' : 'Two-Factor Authentication is Disabled - Click to Configure'}
              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 text-xs font-mono transition-all cursor-pointer ${
                twoFactorEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 animate-pulse'
              }`}
            >
              {twoFactorEnabled ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span className="hidden md:inline font-semibold">
                {twoFactorEnabled ? '2FA ACTIVE' : '2FA DISABLED'}
              </span>
            </button>

            {/* Theme Toggle (Light / Dark / System) */}
            <ThemeToggle />

            {/* Refresh button */}
            <button
              onClick={onRefresh}
              title="Refresh Host Profile"
              className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Logout button */}
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-200 dark:hover:border-rose-500/30 transition-colors shadow-sm"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hero Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
          {/* Public IP */}
          <div className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 transition-colors">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3 text-sky-500 dark:text-sky-400" />
                Public IP
              </span>
              <button 
                onClick={() => copyToClipboard(profile?.publicIp, 'pub')}
                className="hover:text-zinc-900 dark:hover:text-zinc-300 text-zinc-400 dark:text-zinc-500 transition-colors"
              >
                {copiedIp === 'pub' ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-1 truncate">
              {profile?.publicIp || '132.145.70.205'}
            </div>
          </div>

          {/* Private IP */}
          <div className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 transition-colors">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider flex items-center justify-between">
              <span>Private IP</span>
              <button 
                onClick={() => copyToClipboard(profile?.privateIp, 'priv')}
                className="hover:text-zinc-900 dark:hover:text-zinc-300 text-zinc-400 dark:text-zinc-500 transition-colors"
              >
                {copiedIp === 'priv' ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-1 truncate">
              {profile?.privateIp || '10.0.0.202'}
            </div>
          </div>

          {/* CPU Specs */}
          <div className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 transition-colors">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider flex items-center gap-1">
              <Cpu className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
              Processor
            </div>
            <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 mt-1 truncate" title={profile?.cpuModel}>
              {profile?.cpuCores || 2} Cores • {profile?.cpuModel?.split('@')[0]?.trim() || 'Neoverse-N1'}
            </div>
          </div>

          {/* RAM Specs */}
          <div className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 transition-colors">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider">Installed RAM</div>
            <div className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-1">
              {formatBytes(profile?.totalMemory)}
            </div>
          </div>

          {/* Storage Specs */}
          <div className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 transition-colors">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              Total Disk
            </div>
            <div className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-1">
              {formatBytes(profile?.totalDisk)}
            </div>
          </div>

          {/* Uptime */}
          <div className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 transition-colors">
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-purple-500 dark:text-purple-400" />
              Uptime
            </div>
            <div className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-1 truncate" title={`Booted: ${profile?.bootTimestamp ? new Date(profile.bootTimestamp).toLocaleString() : 'N/A'}`}>
              {telemetry?.system?.humanUptime || profile?.humanUptime || 'Active'}
            </div>
          </div>
        </div>
      </div>

      <TwoFactorModal
        isOpen={is2faModalOpen}
        onClose={() => setIs2faModalOpen(false)}
        token={token}
        onEnabled={() => {
          refreshUser?.();
        }}
      />
    </header>
  );
}
