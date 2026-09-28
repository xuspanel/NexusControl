import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

export default function FlushModal({ isOpen, onClose, onConfirm, isFlushing }) {
  const [target, setTarget] = useState('db');
  const [confirmInput, setConfirmInput] = useState('');

  if (!isOpen) return null;

  const isConfirmed = confirmInput.trim().toUpperCase() === 'FLUSH';

  const handleFlush = () => {
    if (!isConfirmed || isFlushing) return;
    onConfirm(target);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Flush Redis Cache
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Permanent in-memory data eviction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isFlushing}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning text */}
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs leading-relaxed space-y-1">
          <p className="font-semibold">⚠️ Irreversible Operation</p>
          <p>
            Flushing Redis will immediately evict keys from RAM. Connected microservices and clients might experience cache misses until the cache repopulates.
          </p>
        </div>

        {/* Target Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Select Flush Scope
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTarget('db')}
              className={`p-3 rounded-xl border text-left transition-all ${
                target === 'db'
                  ? 'border-rose-500 bg-rose-500/5 dark:bg-rose-500/10 text-zinc-900 dark:text-zinc-100'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <div className="text-xs font-semibold font-mono">FLUSHDB</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Current DB only
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTarget('all')}
              className={`p-3 rounded-xl border text-left transition-all ${
                target === 'all'
                  ? 'border-rose-500 bg-rose-500/5 dark:bg-rose-500/10 text-zinc-900 dark:text-zinc-100'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <div className="text-xs font-semibold font-mono text-rose-600 dark:text-rose-400">FLUSHALL</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                All databases (0-15)
              </div>
            </button>
          </div>
        </div>

        {/* Confirmation Input */}
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-600 dark:text-zinc-400 block">
            Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400">FLUSH</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder="FLUSH"
            autoFocus
            disabled={isFlushing}
            className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 transition-colors uppercase tracking-widest text-center"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isFlushing}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleFlush}
            disabled={!isConfirmed || isFlushing}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 disabled:opacity-40 transition-colors shadow-xs"
          >
            {isFlushing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Flushing...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Execute {target === 'all' ? 'FLUSHALL' : 'FLUSHDB'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
