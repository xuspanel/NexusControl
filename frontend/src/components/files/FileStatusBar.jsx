import React from 'react';
import { Activity, CheckSquare, Keyboard } from 'lucide-react';

function formatSize(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function FileStatusBar({
  totalItems = 0,
  selectedItems = [],
  activeTasksCount = 0,
  onOpenTasks,
  onOpenKeyboardGuide,
  clipboard
}) {
  const selectedSize = selectedItems.reduce((acc, item) => acc + (item.size || 0), 0);

  return (
    <footer className="bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800/80 px-4 py-2 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 select-none font-mono">
      <div className="flex items-center gap-4">
        <span>{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>

        {selectedItems.length > 0 && (
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <CheckSquare className="w-3 h-3" />
            <span>
              {selectedItems.length} selected ({formatSize(selectedSize)})
            </span>
          </div>
        )}

        {clipboard?.items?.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400/90 text-[11px]">
            Clipboard: {clipboard.items.length} {clipboard.mode === 'cut' ? 'cut' : 'copied'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Keyboard Shortcuts Guide Button */}
        <button
          onClick={onOpenKeyboardGuide}
          title="Keyboard Shortcuts Guide"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>Hotkeys</span>
        </button>

        {/* Background Tasks Button */}
        <button
          onClick={onOpenTasks}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
            activeTasksCount > 0
              ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 animate-pulse'
              : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>
            Tasks {activeTasksCount > 0 ? `(${activeTasksCount} active)` : ''}
          </span>
        </button>
      </div>
    </footer>
  );
}
