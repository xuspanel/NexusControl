import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: ['Ctrl', 'A'], desc: 'Select All', detail: 'Select all files and folders in the current directory' },
    { keys: ['Ctrl', 'C'], desc: 'Copy', detail: 'Copy selected items to clipboard' },
    { keys: ['Ctrl', 'X'], desc: 'Cut', detail: 'Cut selected items to clipboard for moving' },
    { keys: ['Ctrl', 'V'], desc: 'Paste', detail: 'Paste clipboard items into the active directory' },
    { keys: ['F2'], desc: 'Rename', detail: 'Rename the selected file or folder' },
    { keys: ['Delete'], desc: 'Move to Trash', detail: 'Move selected items to Recycle Bin (.trash)' },
    { keys: ['Shift', 'Delete'], desc: 'Permanent Delete', detail: 'Permanently remove selected items without trash' },
    { keys: ['Escape'], desc: 'Clear / Close', detail: 'Clear active selections or dismiss active modal' },
    { keys: ['Ctrl', 'S'], desc: 'Save File', detail: 'Save active buffer inside Monaco Code Editor' },
    { keys: ['Enter'], desc: 'Open Item', detail: 'Navigate into folder or open file in Monaco Code Editor' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100 font-sans">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Keyboard Shortcuts Guide</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Table */}
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800/60 font-mono text-xs">
          {shortcuts.map((sc, idx) => (
            <div key={idx} className="py-2.5 flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-200 text-xs">{sc.desc}</span>
                <span className="text-[11px] text-zinc-500 font-sans">{sc.detail}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {sc.keys.map((k, ki) => (
                  <React.Fragment key={ki}>
                    <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300 text-[11px] rounded shadow-inner font-mono font-medium">
                      {k}
                    </kbd>
                    {ki < sc.keys.length - 1 && <span className="text-zinc-400 dark:text-zinc-600 text-xs">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded text-xs font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
