import React, { useState } from 'react';
import {
  MoreHorizontal,
  X,
  Globe,
  ShieldCheck,
  Cpu,
  Activity,
  HardDrive,
  LogOut,
  SunMoon,
  Search,
  CheckCircle2,
  Terminal,
  Radio
} from 'lucide-react';
import { getNavItemsForRole } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ThemeToggle';
import OsBadge from '../OsBadge';

export default function MobileNav({
  activeTab,
  onSelectTab,
  telemetry,
  profile,
  connected,
  onOpenCommandPalette,
  onLogout
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { role } = useAuth();

  const allowedItems = getNavItemsForRole(role);
  // Primary mobile items
  const primaryItems = allowedItems.filter(item => item.primaryMobile);
  // Secondary items
  const secondaryItems = allowedItems.filter(item => !item.primaryMobile);

  const cpuPercent = telemetry?.cpu?.percent ?? 0;
  const memPercent = telemetry?.memory?.percent ?? 0;

  const handleSelectPrimary = (id) => {
    setIsMoreOpen(false);
    onSelectTab(id);
  };

  const handleSelectSecondary = (id) => {
    setIsMoreOpen(false);
    onSelectTab(id);
  };

  return (
    <>
      {/* 1. Fixed Mobile Bottom Dock */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 transition-colors"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {primaryItems.map((item) => {
            const isActive = activeTab === item.id || (item.id === 'overview' && activeTab === 'telemetry');
            const IconComponent = item.iconComponent;

            return (
              <button
                key={item.id}
                onClick={() => handleSelectPrimary(item.id)}
                className={`flex flex-col items-center justify-center h-full space-y-1 transition-colors relative active:scale-95 ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute top-0 w-8 h-0.5 rounded-full bg-emerald-500" />
                )}
                <IconComponent className="w-5 h-5" />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </button>
            );
          })}

          {/* 5th Slot: More Button */}
          <button
            onClick={() => setIsMoreOpen(prev => !prev)}
            className={`flex flex-col items-center justify-center h-full space-y-1 transition-colors relative active:scale-95 ${
              isMoreOpen || secondaryItems.some(i => activeTab === i.id || (i.id === 'vhosts' && activeTab === 'domains'))
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {secondaryItems.some(i => activeTab === i.id || (i.id === 'vhosts' && activeTab === 'domains')) && (
              <span className="absolute top-0 w-8 h-0.5 rounded-full bg-emerald-500" />
            )}
            <div className="relative">
              <MoreHorizontal className="w-5 h-5" />
              {/* Subtle badge dot */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121215]" />
            </div>
            <span className="text-[10px] tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* 2. "More" Bottom Sheet Modal */}
      {isMoreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200"
          onClick={() => setIsMoreOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-[#121215] border-t border-zinc-200 dark:border-zinc-800 rounded-t-3xl shadow-2xl p-5 space-y-5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-250 transition-colors"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle Bar */}
            <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto -mt-1" />

            {/* Sheet Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
              <div className="flex items-center space-x-2.5">
                <OsBadge osId={profile?.osId} osName={profile?.os} className="w-5 h-5 rounded-full shadow-xs" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {profile?.hostname || 'NexusControl VPS'}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse-fast' : 'bg-amber-500'}`} />
                    <span>{connected ? 'Stream Active (1.5s)' : 'Disconnected'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Mini Hardware Status Bar */}
            <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-emerald-500" /> CPU Load
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{cpuPercent}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(2, cpuPercent))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-sky-500" /> Memory Load
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{memPercent}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(2, memPercent))}%` }}
                />
              </div>
            </div>

            {/* Secondary Modules Navigation Grid */}
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider font-mono font-semibold text-zinc-400">
                Additional Modules
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {secondaryItems.map((item) => {
                  const isActive = activeTab === item.id || (item.id === 'vhosts' && activeTab === 'domains');
                  const IconComponent = item.iconComponent;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectSecondary(item.id)}
                      className={`min-h-[48px] p-3 rounded-xl border flex items-center space-x-3 text-left transition-all active:scale-98 ${
                        isActive
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-zinc-50/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 shrink-0">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{item.label}</div>
                        <div className="text-[10px] text-zinc-400 truncate">Tap to open</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Mobile Actions */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] uppercase tracking-wider font-mono font-semibold text-zinc-400">
                System Controls
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenCommandPalette();
                  }}
                  className="min-h-[48px] p-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors"
                >
                  <Search className="w-4 h-4 text-emerald-500" />
                  <span>Spotlight (Cmd+K)</span>
                </button>

                <div className="min-h-[48px] p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                  <ThemeToggle />
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onLogout?.();
                }}
                className="w-full min-h-[48px] mt-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors active:scale-98"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out of NexusControl</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
