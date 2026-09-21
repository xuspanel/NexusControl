import React from 'react';
import {
  Server,
  ChevronLeft,
  ChevronRight,
  Search,
  Command,
  Activity,
  LogOut,
  Sparkles
} from 'lucide-react';
import { getNavItemsForRole } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import OsBadge from '../OsBadge';

export default function SidebarNav({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  profile,
  telemetry,
  connected,
  onOpenCommandPalette,
  onLogout
}) {
  const { role, username, granularPolicies } = useAuth();
  const navItems = getNavItemsForRole(role, granularPolicies);
  return (
    <aside
      className={`hidden md:flex flex-col fixed top-0 bottom-0 left-0 z-40 bg-white dark:bg-[#121215] border-r border-zinc-200 dark:border-zinc-800/80 transition-all duration-300 ease-in-out select-none ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* 1. Header / Brand Mark */}
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-zinc-200 dark:border-zinc-800/80 shrink-0">
        <div className="flex items-center space-x-3 min-w-0 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-xs">
            <Server className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 tracking-tight">
                  NexusControl
                </span>
                <span className="px-1 py-0.2 rounded text-[9px] font-mono uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  PRO
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-400 truncate">
                {profile?.hostname || 'vps-host'}
              </p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
            title="Collapse sidebar (Compact Rail)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Spotlight Quick Launcher Button */}
      <div className="p-2.5 shrink-0">
        <button
          onClick={onOpenCommandPalette}
          className={`w-full flex items-center rounded-xl bg-zinc-100/80 hover:bg-zinc-200/80 dark:bg-zinc-900/80 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 transition-colors group relative ${
            collapsed ? 'justify-center p-2.5' : 'px-3 py-2 justify-between'
          }`}
          title={collapsed ? 'Search & Commands (Ctrl+K)' : undefined}
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            {!collapsed && <span className="font-sans text-xs">Commands...</span>}
          </div>
          {!collapsed && (
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
              ⌘K
            </kbd>
          )}

          {/* Floating tooltip when collapsed */}
          {collapsed && (
            <div className="absolute left-full ml-2.5 px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-100 text-xs font-mono whitespace-nowrap shadow-xl border border-zinc-800 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              Command Palette (Ctrl+K)
            </div>
          )}
        </button>
      </div>

      {/* 3. Navigation Links List */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-1 py-1">
        {!collapsed && (
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-mono font-semibold text-zinc-400 dark:text-zinc-500">
            System Modules
          </div>
        )}

        {navItems.map((item) => {
          const isActive = activeTab === item.id || (item.id === 'overview' && activeTab === 'telemetry') || (item.id === 'vhosts' && activeTab === 'domains');
          const IconComponent = item.iconComponent;

          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center rounded-xl font-medium transition-all ${
                  collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 space-x-3'
                } ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                }`}
              >
                {/* Active left indicator pill when collapsed */}
                {isActive && collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-emerald-500" />
                )}

                <div className={`shrink-0 transition-colors ${
                  isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200'
                }`}>
                  <IconComponent className="w-5 h-5" />
                </div>

                {!collapsed && (
                  <div className="flex-1 flex items-center justify-between min-w-0 text-left">
                    <span className="text-xs font-sans truncate">{item.label}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                      isActive
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-zinc-100 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/60 text-zinc-400'
                    }`}>
                      Alt+{item.shortcut}
                    </span>
                  </div>
                )}
              </button>

              {/* Tooltip for Compact Rail */}
              {collapsed && (
                <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-100 text-xs font-mono whitespace-nowrap shadow-xl border border-zinc-800 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                  <span>{item.label}</span>
                  <span className="text-zinc-500 text-[10px]">Alt+{item.shortcut}</span>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 4. Bottom Host Profile & Collapse Controls */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800/80 shrink-0 space-y-1">
        {collapsed ? (
          <div className="flex flex-col items-center space-y-2 py-1">
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
              <OsBadge osId={profile?.osId} osName={profile?.os} className="w-4 h-4 rounded-full" />
            </div>
          </div>
        ) : (
          <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <OsBadge osId={profile?.osId} osName={profile?.os} className="w-4 h-4 rounded-full shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate flex items-center gap-1.5">
                    <span>{username}</span>
                    <span className="px-1 py-0.1 rounded text-[9px] font-mono uppercase bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {role}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse-fast' : 'bg-amber-500'}`} />
                    <span>{connected ? 'Active Stream' : 'Disconnected'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
