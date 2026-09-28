import React, { useState } from 'react';
import { Clock, Search, Cpu, Info, CheckCircle2 } from 'lucide-react';

export default function SystemdTimersTable({ timers = [] }) {
  const [search, setSearch] = useState('');

  const filteredTimers = timers.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.unit.toLowerCase().includes(q) ||
      t.activates.toLowerCase().includes(q) ||
      t.nextRun.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs space-y-0">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Systemd OS Timer Units
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
            {timers.length} monitored
          </span>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search timer units..."
            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="p-3 bg-blue-500/5 dark:bg-blue-500/10 border-b border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0" />
        <span>Systemd timers are native Linux OS system event triggers managed by systemd init.</span>
      </div>

      {filteredTimers.length === 0 ? (
        <div className="py-16 text-center text-xs text-zinc-400">
          No systemd timers match your query.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-[11px] border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Unit Timer</th>
                <th className="py-2.5 px-4 font-medium">Next Run</th>
                <th className="py-2.5 px-4 font-medium">Time Left</th>
                <th className="py-2.5 px-4 font-medium">Last Run</th>
                <th className="py-2.5 px-4 font-medium">Passed</th>
                <th className="py-2.5 px-4 font-medium">Target Service</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredTimers.map((timer, idx) => (
                <tr
                  key={timer.unit + idx}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                      <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{timer.unit}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-700 dark:text-zinc-300">
                    {timer.nextRun}
                  </td>
                  <td className="py-2.5 px-4 text-blue-600 dark:text-blue-400 font-semibold">
                    {timer.left}
                  </td>
                  <td className="py-2.5 px-4 text-zinc-500 dark:text-zinc-400">
                    {timer.lastRun}
                  </td>
                  <td className="py-2.5 px-4 text-zinc-400">
                    {timer.passed}
                  </td>
                  <td className="py-2.5 px-4 text-zinc-800 dark:text-zinc-200">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]">
                      {timer.activates}
                    </span>
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
