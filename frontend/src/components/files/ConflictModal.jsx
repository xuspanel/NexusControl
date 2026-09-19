import React from 'react';
import { AlertTriangle, Copy, X } from 'lucide-react';

export default function ConflictModal({
  conflicts = [],
  actionType = 'copy', // 'copy' | 'move'
  onResolve,
  onClose
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-white dark:bg-zinc-950 border border-amber-500/40 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">File Conflicts Detected</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          The destination directory already contains {conflicts.length} item{conflicts.length > 1 ? 's' : ''} with conflicting names. Choose how to handle them:
        </p>

        {/* Conflicting items list */}
        <div className="max-h-40 overflow-y-auto bg-zinc-100 dark:bg-zinc-900/60 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs font-mono">
          {conflicts.map((c, i) => (
            <div key={i} className="py-1.5 px-1 flex flex-col gap-0.5">
              <span className="text-zinc-900 dark:text-zinc-200 font-semibold">{c.name}</span>
              <span className="text-zinc-500 text-[10px] truncate">{c.destination}</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            onClick={() => onResolve('keepBoth')}
            className="flex flex-col items-center justify-center p-2.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-lg text-xs transition-colors"
          >
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Keep Both</span>
            <span className="text-[10px] text-zinc-500 mt-0.5">Append (1), (2)</span>
          </button>

          <button
            onClick={() => onResolve('skip')}
            className="flex flex-col items-center justify-center p-2.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-lg text-xs transition-colors"
          >
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Skip</span>
            <span className="text-[10px] text-zinc-500 mt-0.5">Do not replace</span>
          </button>

          <button
            onClick={() => onResolve('overwrite')}
            className="flex flex-col items-center justify-center p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-xs transition-colors"
          >
            <span className="font-semibold text-red-600 dark:text-red-400">Overwrite</span>
            <span className="text-[10px] text-red-600/70 dark:text-red-400/70 mt-0.5">Replace all</span>
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-medium"
          >
            Cancel Entire Operation
          </button>
        </div>
      </div>
    </div>
  );
}
