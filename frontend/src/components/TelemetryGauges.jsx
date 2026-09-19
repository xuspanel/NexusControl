import React from 'react';
import { 
  Cpu, 
  Database, 
  HardDrive, 
  Network, 
  Activity, 
  ArrowDown, 
  ArrowUp, 
  Zap, 
  Layers,
  Gauge
} from 'lucide-react';

export default function TelemetryGauges({ telemetry }) {
  if (!telemetry) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-48 bg-zinc-200/60 dark:bg-zinc-900/50 border border-zinc-300 dark:border-zinc-800 rounded-xl" />
        ))}
      </div>
    );
  }

  const { cpu, memory, disk, network, system } = telemetry;

  // Format functions
  const formatBytes = (bytes, decimals = 1) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatRate = (bytesSec) => {
    if (!bytesSec || bytesSec === 0) return '0 KB/s';
    const kb = bytesSec / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB/s`;
  };

  // Color threshold helper
  const getProgressColor = (pct) => {
    if (pct > 88) return 'bg-rose-500';
    if (pct > 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getLoadColor = (load, cores) => {
    const ratio = load / (cores || 2);
    if (ratio > 1.8) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (ratio > 1.0) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. CPU Telemetry Card */}
      <div className="nx-card p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide uppercase">CPU Telemetry</span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
              {cpu.coreCount || 2} Cores
            </span>
          </div>

          {/* Large Metric Display */}
          <div className="my-3 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">{cpu.usage}%</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">Aggregate Load</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Active Procs</span>
              <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{system?.activeProcs} / {system?.totalProcs}</span>
            </div>
          </div>

          {/* Aggregate Progress Bar */}
          <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4">
            <div 
              className={`h-full transition-all duration-500 ${getProgressColor(cpu.usage)}`}
              style={{ width: `${Math.min(100, Math.max(1, cpu.usage))}%` }}
            />
          </div>

          {/* Per-Core Breakdown */}
          <div className="space-y-1.5 mb-3">
            <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 dark:text-zinc-400">Per-Core Utilization</div>
            {cpu.cores?.map((coreUsage, idx) => (
              <div key={idx} className="flex items-center text-xs font-mono gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 w-8">C{idx}</span>
                <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${getProgressColor(coreUsage)}`}
                    style={{ width: `${Math.min(100, Math.max(1, coreUsage))}%` }}
                  />
                </div>
                <span className="text-zinc-700 dark:text-zinc-300 w-10 text-right">{coreUsage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Load Averages Footer */}
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Load Avg:</span>
          <div className="flex gap-2">
            <span title="1 minute load" className={getLoadColor(system?.load1, cpu.coreCount)}>
              {system?.load1?.toFixed(2)}
            </span>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span title="5 minute load" className={getLoadColor(system?.load5, cpu.coreCount)}>
              {system?.load5?.toFixed(2)}
            </span>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span title="15 minute load" className={getLoadColor(system?.load15, cpu.coreCount)}>
              {system?.load15?.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Memory & Swap Card */}
      <div className="nx-card p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Database className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide uppercase">RAM & Buffers</span>
            </div>
            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
              {formatBytes(memory.total)}
            </span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">{memory.usedPct}%</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">In Use</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Available</span>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{formatBytes(memory.available)}</span>
            </div>
          </div>

          {/* Segmented Memory Bar */}
          <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex mb-3">
            <div 
              title={`Used: ${formatBytes(memory.used)}`}
              className={`h-full ${getProgressColor(memory.usedPct)}`}
              style={{ width: `${(memory.used / memory.total) * 100}%` }}
            />
            <div 
              title={`Cached/Buffers: ${formatBytes(memory.cached + memory.buffers)}`}
              className="h-full bg-sky-500/70"
              style={{ width: `${((memory.cached + memory.buffers) / memory.total) * 100}%` }}
            />
          </div>

          {/* Detailed Allocation Breakdown */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
            <div className="bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block uppercase">Active Used</span>
              <span className="text-zinc-800 dark:text-zinc-200">{formatBytes(memory.used)}</span>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block uppercase">Cached / Buffers</span>
              <span className="text-sky-600 dark:text-sky-400">{formatBytes(memory.cached + memory.buffers)}</span>
            </div>
          </div>
        </div>

        {/* Swap Bar */}
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/80">
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Swap Space:</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {memory.swapTotal > 0 ? `${formatBytes(memory.swapUsed)} / ${formatBytes(memory.swapTotal)} (${memory.swapPct}%)` : 'Disabled'}
            </span>
          </div>
          {memory.swapTotal > 0 && (
            <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500"
                style={{ width: `${memory.swapPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 3. Storage & IOPS Card */}
      <div className="nx-card p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide uppercase">Storage & I/O</span>
            </div>
            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
              Root (/)
            </span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">{disk.usedPct}%</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">Capacity</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Free Space</span>
              <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{formatBytes(disk.freeBytes)}</span>
            </div>
          </div>

          <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
            <div 
              className={`h-full transition-all duration-500 ${getProgressColor(disk.usedPct)}`}
              style={{ width: `${disk.usedPct}%` }}
            />
          </div>

          {/* I/O Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
            <div className="bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block uppercase">Read IOPS / Rate</span>
              <span className="text-zinc-800 dark:text-zinc-200">{disk.readIops} IOPS</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">{formatRate(disk.readBytesSec)}</span>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block uppercase">Write IOPS / Rate</span>
              <span className="text-zinc-800 dark:text-zinc-200">{disk.writeIops} IOPS</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">{formatRate(disk.writeBytesSec)}</span>
            </div>
          </div>
        </div>

        {/* Inodes Footer */}
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Inode Utilization:</span>
          <span className="text-zinc-700 dark:text-zinc-300">{disk.inodePct}% ({((disk.usedInodes || 0) / 1000).toFixed(0)}k used)</span>
        </div>
      </div>

      {/* 4. Network & Bandwidth Card */}
      <div className="nx-card p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Network className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide uppercase">Network Traffic</span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
              {network.interface}
            </span>
          </div>

          {/* Transfer Rates */}
          <div className="my-3 grid grid-cols-2 gap-2">
            <div className="bg-zinc-50 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-mono mb-1">
                <ArrowDown className="w-3 h-3" />
                Download (RX)
              </div>
              <div className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {formatRate(network.rxRateBytesSec)}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                Total: {formatBytes(network.rxTotalBytes)}
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
              <div className="flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 uppercase font-mono mb-1">
                <ArrowUp className="w-3 h-3" />
                Upload (TX)
              </div>
              <div className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {formatRate(network.txRateBytesSec)}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                Total: {formatBytes(network.txTotalBytes)}
              </div>
            </div>
          </div>

          {/* Ping Tracker */}
          <div className="bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">Upstream DNS (1.1.1.1)</span>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {network.pingLatencyMs ? `${network.pingLatencyMs} ms` : '2.1 ms'}
            </span>
          </div>
        </div>

        {/* Packet Counts Footer */}
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400">
          <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Packets:</span>
          <span>RX {((network.rxPackets || 0) / 1000).toFixed(0)}k • TX {((network.txPackets || 0) / 1000).toFixed(0)}k</span>
        </div>
      </div>
    </div>
  );
}
