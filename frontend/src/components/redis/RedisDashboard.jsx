import React from 'react';
import {
  HardDrive,
  Target,
  Users,
  Activity,
  Server,
  Clock,
  Layers,
  Zap,
  TrendingUp,
  Cpu
} from 'lucide-react';

export default function RedisDashboard({ telemetry }) {
  if (!telemetry) return null;

  const hitRate = Number(telemetry.hit_rate || 0);
  const hits = Number(telemetry.keyspace_hits || 0);
  const misses = Number(telemetry.keyspace_misses || 0);
  const totalLookups = hits + misses;

  return (
    <div className="space-y-4 select-none">
      {/* 4 Core Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Memory Usage */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">RAM Consumption</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
              {telemetry.used_memory_human || '0B'}
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              / Peak {telemetry.used_memory_peak_human || '0B'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Frag. Ratio: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{telemetry.mem_fragmentation_ratio}</strong></span>
            <span className="text-[10px] uppercase font-mono text-purple-600 dark:text-purple-400">In-Memory</span>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Hit Rate</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
              {hitRate.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              ({hits.toLocaleString()} hits)
            </span>
          </div>
          <div className="mt-2.5">
            <div className="w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(hitRate, 0), 100)}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
              <span>{hits} hits</span>
              <span>{misses} misses</span>
            </div>
          </div>
        </div>

        {/* Connected Clients */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Client Concurrency</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
              {telemetry.connected_clients ?? 0}
            </span>
            <span className="text-[11px] text-zinc-400">connections</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Blocked: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{telemetry.blocked_clients ?? 0}</strong></span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
        </div>

        {/* Operations Per Second */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Throughput</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
              {telemetry.instantaneous_ops_per_sec ?? 0}
            </span>
            <span className="text-[11px] font-mono text-zinc-400">ops/sec</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Uptime: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{telemetry.uptime_days}d</strong></span>
            <span className="font-mono text-[10px] text-zinc-400">
              {Math.floor((telemetry.uptime_seconds || 0) / 3600)}h total
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
