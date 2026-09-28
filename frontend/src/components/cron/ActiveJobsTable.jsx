import React from 'react';
import { Play, Trash2, Clock, ShieldCheck, Copy, Terminal, Plus } from 'lucide-react';

export default function ActiveJobsTable({
  jobs = [],
  onRunNow,
  onDeleteJob,
  onOpenCreateModal,
  onShowToast
}) {
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    onShowToast?.('Command copied to clipboard', 'info');
  };

  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            System Crontab Jobs
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
            {jobs.length} active
          </span>
        </div>
        <button
          onClick={onOpenCreateModal}
          className="px-3 py-1.5 text-xs font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Cron Job</span>
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <Clock className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
            No scheduled crontab jobs found for root.
          </p>
          <button
            onClick={onOpenCreateModal}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 font-medium pt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create your first scheduled task</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 font-mono text-[11px] border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2.5 px-4 font-medium w-36">Schedule</th>
                <th className="py-2.5 px-4 font-medium w-64">Description</th>
                <th className="py-2.5 px-4 font-medium">Command</th>
                <th className="py-2.5 px-4 font-medium w-28 text-center">Tracking</th>
                <th className="py-2.5 px-4 font-medium text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
              {jobs.map((job, idx) => (
                <tr
                  key={job.id || idx}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors group"
                >
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 font-bold border border-zinc-200 dark:border-zinc-700">
                      {job.schedule}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans text-xs text-zinc-700 dark:text-zinc-300">
                    {job.humanReadable}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate max-w-sm sm:max-w-md text-zinc-900 dark:text-zinc-100" title={job.command}>
                        {job.command}
                      </span>
                      <button
                        onClick={() => handleCopy(job.command)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-opacity"
                        title="Copy command"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {job.isWrapped ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title="Output and durations recorded in SQLite history">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Logged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60" title="Native un-wrapped cron job">
                        Native
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onRunNow(job.command)}
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors flex items-center gap-1"
                        title="Run now in live streaming terminal"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        onClick={() => onDeleteJob(job.command)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete cron job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
