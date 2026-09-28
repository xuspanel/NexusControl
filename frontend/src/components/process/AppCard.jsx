import React from 'react';
import { Play, Square, RotateCw, Terminal, Key, Trash2, Cpu, HardDrive, Clock, Activity, Folder } from 'lucide-react';

export default function AppCard({ app, onAction, onOpenLogs, onOpenEnv, onDelete, actionLoading }) {
  const isRunning = app.status === 'running';
  const isFailed = app.status === 'failed';
  const isInactive = !isRunning && !isFailed;
  const isLoading = actionLoading === app.name;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700/80 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between group">
      <div>
        {/* Top bar: name & status badge */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {app.name}
            </h4>
            <span className="text-[11px] font-mono text-zinc-400">
              nc-app-{app.name}.service
            </span>
          </div>

          <div>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                running
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                failed
              </span>
            )}
            {isInactive && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                inactive
              </span>
            )}
          </div>
        </div>

        {/* Command & Directory info */}
        <div className="bg-zinc-50 dark:bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 mb-4 space-y-1 font-mono text-xs">
          <div className="text-zinc-700 dark:text-zinc-300 truncate font-semibold" title={app.cmd}>
            $ {app.cmd || 'N/A'}
          </div>
          <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1" title={app.cwd}>
            <Folder className="w-3 h-3 shrink-0" />
            {app.cwd}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-zinc-100 dark:border-zinc-800/80 mb-4 text-center">
          {/* CPU */}
          <div className="p-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/40">
            <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 mb-0.5">
              <Cpu className="w-3 h-3 text-indigo-500" />
              <span>CPU</span>
            </div>
            <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {isRunning ? `${app.cpu}%` : '0%'}
            </div>
          </div>

          {/* RAM */}
          <div className="p-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/40">
            <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 mb-0.5">
              <HardDrive className="w-3 h-3 text-cyan-500" />
              <span>RAM</span>
            </div>
            <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {isRunning ? `${app.ramMb} MB` : '0 MB'}
            </div>
          </div>

          {/* Uptime */}
          <div className="p-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/40">
            <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 mb-0.5">
              <Clock className="w-3 h-3 text-amber-500" />
              <span>Uptime</span>
            </div>
            <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 truncate">
              {isRunning ? app.uptimeFormatted : 'Offline'}
            </div>
          </div>
        </div>

        {/* PID info */}
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-4 px-1">
          <span>Main PID: {app.pid > 0 ? app.pid : '—'}</span>
          <span>State: {app.subState || app.activeState}</span>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex items-center justify-between gap-1.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-1">
          {isRunning ? (
            <button
              onClick={() => onAction(app.name, 'stop')}
              disabled={isLoading}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
              title="Stop Application"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => onAction(app.name, 'start')}
              disabled={isLoading}
              className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              title="Start Application"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          )}

          <button
            onClick={() => onAction(app.name, 'restart')}
            disabled={isLoading}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors cursor-pointer"
            title="Restart Application"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => onOpenLogs(app.name)}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors cursor-pointer"
            title="View Live Journal Logs"
          >
            <Terminal className="w-4 h-4" />
          </button>

          <button
            onClick={() => onOpenEnv(app.name)}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-amber-500/10 hover:text-amber-500 transition-colors cursor-pointer"
            title="Manage Environment Variables"
          >
            <Key className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => onDelete(app.name)}
          disabled={isLoading}
          className="p-2 rounded-xl text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Delete Application Unit"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
