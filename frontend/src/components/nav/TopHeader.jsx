import React from 'react';
import {
  Search,
  Command,
  Activity,
  Cpu,
  Server,
  Radio,
  Menu
} from 'lucide-react';
import { getNavItem } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ThemeToggle';

export default function TopHeader({
  activeTab,
  sidebarCollapsed,
  telemetry,
  connected,
  onOpenCommandPalette
}) {
  const { role, username } = useAuth();
  const currentNav = getNavItem(activeTab);
  const IconComponent = currentNav.iconComponent;

  const cpuPercent = telemetry?.cpu?.percent ?? 0;
  const memPercent = telemetry?.memory?.percent ?? 0;

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-[#121215]/90 backdrop-blur-md transition-all duration-300 flex items-center justify-between px-4 lg:px-6 ${
        sidebarCollapsed ? 'left-0 md:left-16' : 'left-0 md:left-16 xl:left-60'
      }`}
    >
      {/* 1. Left: Current Screen Title & Dynamic Breadcrumbs */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex md:hidden items-center space-x-2 mr-1">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Server className="w-4 h-4" />
          </div>
        </div>

        <div className="flex items-center space-x-2 min-w-0">
          <span className="hidden sm:inline-block text-xs font-mono text-zinc-400 dark:text-zinc-500">
            NexusControl <span className="mx-1 text-zinc-300 dark:text-zinc-700">/</span>
          </span>
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hidden xs:flex shrink-0">
              <IconComponent className="w-4 h-4" />
            </div>
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {currentNav.label}
            </h1>
          </div>
        </div>
      </div>

      {/* 2. Center: Command Palette Search Trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:flex justify-center">
        <button
          onClick={onOpenCommandPalette}
          className="w-full max-w-sm px-3.5 py-1.5 rounded-xl bg-zinc-100/90 hover:bg-zinc-200/80 dark:bg-zinc-900/90 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 text-xs font-sans text-zinc-500 dark:text-zinc-400 flex items-center justify-between transition-colors shadow-2xs group"
          title="Open Command Palette (Ctrl+K / Cmd+K)"
        >
          <div className="flex items-center space-x-2 truncate">
            <Search className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            <span className="truncate">Search commands or jump to screen...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-200/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
            <Command className="w-2.5 h-2.5" /> K
          </kbd>
        </button>
      </div>

      {/* 3. Right: Mobile Search Button, Live Health Indicators, Theme Toggle, Stream State */}
      <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
        {/* Mobile Spotlight trigger button */}
        <button
          onClick={onOpenCommandPalette}
          className="flex md:hidden p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-300 hover:text-emerald-500 transition-colors"
          title="Search commands (Cmd+K)"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Live Mini Hardware Health Chips */}
        <div className="hidden lg:flex items-center space-x-2 text-xs font-mono">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-zinc-500 dark:text-zinc-400">CPU</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{cpuPercent}%</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
            <Activity className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-zinc-500 dark:text-zinc-400">RAM</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{memPercent}%</span>
          </div>
        </div>

        {/* Stream Status Indicator */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
            connected
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          }`}
          title={connected ? 'SSE Telemetry Stream Active (1.5s push)' : 'Telemetry stream connecting...'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse-fast' : 'bg-amber-500'
            }`}
          />
          <span>{connected ? 'LIVE 1.5s' : 'POLLING'}</span>
        </div>

        {/* User Role Badge */}
        <div
          className={`hidden xs:inline-flex items-center gap-1 px-2 py-0.8 rounded-lg text-[10px] font-mono uppercase font-semibold border ${
            role === 'superadmin'
              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25'
              : role === 'operator'
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
          }`}
          title={`Logged in as ${username} (${role})`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          <span>{role}</span>
        </div>

        {/* Dark/Light Theme Toggle */}
        <ThemeToggle />
      </div>
    </header>
  );
}
