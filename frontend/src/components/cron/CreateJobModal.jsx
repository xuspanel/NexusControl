import React, { useState, useMemo } from 'react';
import { Calendar, Clock, X, Plus, Sparkles, Loader2, Info } from 'lucide-react';
import cronstrue from 'cronstrue';

export default function CreateJobModal({ isOpen, onClose, token, onCreated, onShowToast }) {
  const [command, setCommand] = useState('');
  const [scheduleMode, setScheduleMode] = useState('preset'); // 'preset' | 'advanced'
  const [selectedPreset, setSelectedPreset] = useState('0 0 * * *');
  const [customSchedule, setCustomSchedule] = useState('0 0 * * *');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const presets = [
    { label: 'Every Minute', value: '* * * * *', desc: 'Runs every 60 seconds' },
    { label: 'Every 5 Minutes', value: '*/5 * * * *', desc: 'Frequent health checks' },
    { label: 'Every 15 Minutes', value: '*/15 * * * *', desc: 'Quarter-hourly maintenance' },
    { label: 'Hourly', value: '0 * * * *', desc: 'At minute 0 of every hour' },
    { label: 'Daily at Midnight', value: '0 0 * * *', desc: 'Nightly backups & rotations' },
    { label: 'Twice Daily', value: '0 0,12 * * *', desc: 'At midnight and noon' },
    { label: 'Weekly (Sundays)', value: '0 0 * * 0', desc: 'Weekly snapshot cleanup' },
    { label: 'Monthly (1st)', value: '0 0 1 * *', desc: 'Monthly accounting & logs' }
  ];

  const currentSchedule = scheduleMode === 'preset' ? selectedPreset : customSchedule;

  // Translate cron expression to plain English using cronstrue
  const humanReadable = useMemo(() => {
    if (!currentSchedule.trim()) return '';
    try {
      return cronstrue.toString(currentSchedule.trim(), {
        use24HourTimeFormat: true,
        throwExceptionOnParseError: true
      });
    } catch {
      return 'Invalid cron expression format (must be 5 space-delimited fields or @special)';
    }
  }, [currentSchedule]);

  const isValidSchedule = !humanReadable.startsWith('Invalid');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!command.trim()) {
      setError('Command cannot be empty.');
      return;
    }
    if (!isValidSchedule) {
      setError('Please provide a valid cron schedule.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          schedule: currentSchedule.trim(),
          command: command.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create cron job');

      onShowToast?.('Cron job created successfully.', 'success');
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Schedule New Cron Job
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Automatic execution with execution logging &amp; exit code tracking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Command input */}
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              Command to Execute
            </label>
            <input
              type="text"
              required
              autoFocus
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. /opt/scripts/backup.sh or curl -s https://api.myvps.com/health"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <p className="text-[11px] text-zinc-400 mt-1 font-mono">
              Executed with root permissions. Wrapped to capture output in SQLite.
            </p>
          </div>

          {/* Schedule Mode Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Execution Schedule
              </label>
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setScheduleMode('preset')}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    scheduleMode === 'preset'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                  }`}
                >
                  Presets
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('advanced')}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    scheduleMode === 'advanced'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                  }`}
                >
                  Advanced
                </button>
              </div>
            </div>

            {/* Presets Grid */}
            {scheduleMode === 'preset' ? (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {presets.map((p) => {
                  const isSelected = selectedPreset === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setSelectedPreset(p.value)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium'
                          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{p.label}</div>
                      <div className="text-[10px] font-mono text-zinc-400 mt-0.5">{p.value}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={customSchedule}
                  onChange={(e) => setCustomSchedule(e.target.value)}
                  placeholder="* * * * * (minute hour day month weekday)"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <div className="grid grid-cols-5 text-center text-[10px] text-zinc-400 font-mono px-1">
                  <span>min</span>
                  <span>hour</span>
                  <span>day</span>
                  <span>month</span>
                  <span>weekday</span>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Human-Readable Translation (cronstrue) */}
          <div className="p-3 rounded-xl bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-purple-700 dark:text-purple-300">
                {humanReadable}
              </span>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                Expression: <code>{currentSchedule}</code>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !command.trim() || !isValidSchedule}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scheduling...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Job</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
