import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Clock, Terminal, Copy } from 'lucide-react';

export default function HistoryDetailModal({ isOpen, onClose, entry, onShowToast }) {
  const [activeTab, setActiveTab] = useState('stdout');

  if (!isOpen || !entry) return null;

  const isSuccess = entry.exit_code === 0;

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    onShowToast?.('Logs copied to clipboard', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isSuccess
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
            }`}>
              {isSuccess ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono truncate max-w-md">
                  {entry.command}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isSuccess
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}>
                  Exit Code: {entry.exit_code}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-mono mt-0.5">
                <span>Executed: {entry.executed_at}</span>
                <span>•</span>
                <span>Duration: {entry.duration_ms}ms</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex items-center justify-between pt-3 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('stdout')}
              className={`px-3 py-1 text-xs font-mono rounded-lg transition-colors ${
                activeTab === 'stdout'
                  ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              STDOUT ({entry.stdout?.length || 0} bytes)
            </button>
            <button
              onClick={() => setActiveTab('stderr')}
              className={`px-3 py-1 text-xs font-mono rounded-lg transition-colors ${
                activeTab === 'stderr'
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              STDERR ({entry.stderr?.length || 0} bytes)
            </button>
          </div>

          <button
            onClick={() => handleCopy(activeTab === 'stdout' ? entry.stdout : entry.stderr)}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 font-mono hover:underline"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Log</span>
          </button>
        </div>

        {/* Log Viewer Container */}
        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-[#0c0c0e] font-mono text-xs">
          <div className="p-4 h-full overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
            {activeTab === 'stdout' ? (
              entry.stdout ? (
                <span className="text-zinc-200">{entry.stdout}</span>
              ) : (
                <span className="text-zinc-600 italic">(No standard output captured)</span>
              )
            ) : entry.stderr ? (
              <span className="text-rose-400">{entry.stderr}</span>
            ) : (
              <span className="text-zinc-600 italic">(No standard error captured)</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
