import React from 'react';
import { Play, Square, RotateCw, Terminal, Key, Trash2, Cpu, HardDrive, Clock } from 'lucide-react';

export default function AppTable({ apps, onAction, onOpenLogs, onOpenEnv, onDelete, actionLoading }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/75 dark:bg-zinc-950/50 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              <th className="py-3 px-4">Application</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">PID</th>
              <th className="py-3 px-4">CPU (%)</th>
              <th className="py-3 px-4">RAM (MB)</th>
              <th className="py-3 px-4">Uptime</th>
              <th className="py-3 px-4">Command</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
            {apps.map((app) => {
              const isRunning = app.status === 'running';
              const isFailed = app.status === 'failed';
              const isInactive = !isRunning && !isFailed;
              const isLoading = actionLoading === app.name;

              return (
                <tr
                  key={app.name}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  {/* Name */}
                  <td className="py-3.5 px-4 font-sans">
                    <div className="font-bold text-zinc-900 dark:text-zinc-100">
                      {app.name}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400">
                      nc-app-{app.name}.service
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4">
                    {isRunning && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        running
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        failed
                      </span>
                    )}
                    {isInactive && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        inactive
                      </span>
                    )}
                  </td>

                  {/* PID */}
                  <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                    {app.pid > 0 ? app.pid : '—'}
                  </td>

                  {/* CPU */}
                  <td className="py-3.5 px-4">
                    <span className={isRunning && app.cpu > 10 ? 'text-amber-500 font-bold' : 'text-zinc-600 dark:text-zinc-300'}>
                      {isRunning ? `${app.cpu}%` : '0%'}
                    </span>
                  </td>

                  {/* RAM */}
                  <td className="py-3.5 px-4">
                    <span className={isRunning && app.ramMb > 150 ? 'text-amber-500 font-bold' : 'text-zinc-600 dark:text-zinc-300'}>
                      {isRunning ? `${app.ramMb} MB` : '0 MB'}
                    </span>
                  </td>

                  {/* Uptime */}
                  <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                    {isRunning ? app.uptimeFormatted : 'Offline'}
                  </td>

                  {/* Command */}
                  <td className="py-3.5 px-4 max-w-[200px] truncate text-zinc-500 dark:text-zinc-400" title={app.cmd}>
                    {app.cmd || '—'}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isRunning ? (
                        <button
                          onClick={() => onAction(app.name, 'stop')}
                          disabled={isLoading}
                          className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
                          title="Stop Application"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onAction(app.name, 'start')}
                          disabled={isLoading}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                          title="Start Application"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}

                      <button
                        onClick={() => onAction(app.name, 'restart')}
                        disabled={isLoading}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors cursor-pointer"
                        title="Restart Application"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      </button>

                      <button
                        onClick={() => onOpenLogs(app.name)}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors cursor-pointer"
                        title="View Live Journal Logs"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onOpenEnv(app.name)}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-amber-500/10 hover:text-amber-500 transition-colors cursor-pointer"
                        title="Manage Environment Variables"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDelete(app.name)}
                        disabled={isLoading}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete Application Unit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
