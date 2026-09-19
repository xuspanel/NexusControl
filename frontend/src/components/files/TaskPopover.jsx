import React from 'react';
import { Activity, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export default function TaskPopover({
  tasks = [],
  isOpen,
  onClose
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-12 right-6 z-50 w-80 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Background Tasks</span>
          <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 px-1.5 py-0.5 rounded font-mono">
            {tasks.length}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-3 space-y-2.5 text-xs font-mono">
        {tasks.length === 0 ? (
          <div className="text-center py-6 text-zinc-500">
            <span>No background tasks running</span>
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="p-2.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-900 dark:text-zinc-200 truncate font-sans text-xs" title={task.description || task.name || task.type}>
                  {task.description || task.name || task.type}
                </span>
                {task.status === 'completed' && (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                )}
                {task.status === 'failed' && (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 flex-shrink-0" />
                )}
                {task.status === 'running' && (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    task.status === 'completed'
                      ? 'bg-emerald-500'
                      : task.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${task.progress || 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="capitalize">{task.status}</span>
                <span>{task.progress || 0}%</span>
              </div>

              {task.status === 'failed' && task.error && (
                <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-500/10 p-1.5 rounded border border-red-500/20 break-words font-mono">
                  {task.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
