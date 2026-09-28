import React, { useState, useEffect } from 'react';
import { Copy, X, FolderInput, Loader2 } from 'lucide-react';
import PathAutocomplete from './PathAutocomplete';

export default function CopyToModal({
  isOpen,
  onClose,
  itemsToCopy = [],
  currentPath = '/',
  token,
  onConfirm
}) {
  const [destinationPath, setDestinationPath] = useState(currentPath);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setDestinationPath(currentPath.endsWith('/') ? currentPath : `${currentPath}/`);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen, currentPath]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const count = itemsToCopy.length;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!destinationPath.trim()) {
      setError('Please specify a destination directory path.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(destinationPath.trim());
    } catch (err) {
      setError(err.message || 'Copy operation failed');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100 font-sans">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <FolderInput className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Copy To Directory
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">
              Copying <strong className="text-zinc-900 dark:text-zinc-100">{count}</strong> {count === 1 ? 'item' : 'items'}:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {itemsToCopy.map((item, idx) => {
              const name = typeof item === 'string' ? item.split('/').pop() || item : item.name;
              return (
                <span
                  key={idx}
                  className="px-2 py-0.5 text-[11px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]"
                  title={name}
                >
                  {name}
                </span>
              );
            })}
          </div>
        </div>

        {/* Destination Path Input */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Destination Path
          </label>
          <PathAutocomplete
            value={destinationPath}
            onChange={(val) => {
              setDestinationPath(val);
              setError(null);
            }}
            token={token}
            placeholder="/var/www/..."
            disabled={isSubmitting}
            autoFocus
            onEnterSubmit={handleSubmit}
          />
          <p className="text-[11px] text-zinc-500 font-mono">
            Type an absolute directory path or choose from suggestions.
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !destinationPath.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Copying...</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Confirm Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
