import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Clock, ChevronRight, Terminal, RefreshCw, Eye } from 'lucide-react';
import HistoryDetailModal from './HistoryDetailModal';

export default function ExecutionHistoryTable({
  history = [],
  onRefresh,
  loading,
  onShowToast
}) {
  const [selectedEntry, setSelectedEntry] = useState(null);

  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs space-y-0">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Execution Log Ledger
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {history.length} captured runs
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          title="Refresh history"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {history.length === 0 ? (
        <div className="py-16 text-center text-xs text-zinc-400">
          No execution history recorded yet. Jobs wrapped by NexusControl will record stdout, stderr, and run durations automatically.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-[11px] border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2.5 px-4 font-medium w-28">Status</th>
                <th className="py-2.5 px-4 font-medium">Command</th>
                <th className="py-2.5 px-4 font-medium w-36">Duration</th>
                <th className="py-2.5 px-4 font-medium w-48">Executed At</th>
                <th className="py-2.5 px-4 font-medium text-right w-20">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {history.map((entry) => {
                const isSuccess = entry.exit_code === 0;
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      {isSuccess ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Exit 0</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" />
                          <span>Exit {entry.exit_code}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-sm sm:max-w-md">
                        <Terminal className="w-3.5 h-3.5 text-zinc-400 group-hover:text-purple-500 transition-colors shrink-0" />
                        <span className="truncate" title={entry.command}>{entry.command}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span>{entry.duration_ms} ms</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {entry.executed_at}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                        <span className="text-[10px] font-sans text-purple-600 dark:text-purple-400 hidden sm:inline">View Logs</span>
                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* History Detail Log Modal */}
      {selectedEntry && (
        <HistoryDetailModal
          isOpen={Boolean(selectedEntry)}
          onClose={() => setSelectedEntry(null)}
          entry={selectedEntry}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
