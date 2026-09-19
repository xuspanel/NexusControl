import React, { useState, useEffect } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { TrendingUp, Clock, HardDrive, Network, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeProvider';

export default function HistoricalCharts({ token, liveTelemetry }) {
  const { resolvedTheme } = useTheme();
  const [range, setRange] = useState('1h');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async (selectedRange) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/system/history?range=${selectedRange}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const historyData = await res.json();
        // If history is sparse (just started), fill in with live data
        if (historyData.length === 0 && liveTelemetry) {
          setData([{
            timestamp: liveTelemetry.timestamp,
            timeLabel: new Date(liveTelemetry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: liveTelemetry.cpu.usage,
            mem: liveTelemetry.memory.usedPct,
            netRx: liveTelemetry.network.rxRateBytesSec / 1024,
            netTx: liveTelemetry.network.txRateBytesSec / 1024,
            diskRead: (liveTelemetry.disk.readBytesSec || 0) / (1024 * 1024),
            diskWrite: (liveTelemetry.disk.writeBytesSec || 0) / (1024 * 1024)
          }]);
        } else {
          const formatted = historyData.map(d => ({
            ...d,
            timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            netRxKB: parseFloat((d.netRx / 1024).toFixed(1)),
            netTxKB: parseFloat((d.netTx / 1024).toFixed(1)),
            diskReadMB: parseFloat((d.diskRead / (1024 * 1024)).toFixed(2)),
            diskWriteMB: parseFloat((d.diskWrite / (1024 * 1024)).toFixed(2))
          }));
          setData(formatted);
        }
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(range);
    const interval = setInterval(() => fetchHistory(range), 30000);
    return () => clearInterval(interval);
  }, [range, token]);

  // Append live telemetry point in real time if 1h view is selected
  useEffect(() => {
    if (range === '1h' && liveTelemetry) {
      setData(prev => {
        const last = prev[prev.length - 1];
        if (last && liveTelemetry.timestamp - last.timestamp < 10000) {
          return prev;
        }
        const newPoint = {
          timestamp: liveTelemetry.timestamp,
          timeLabel: new Date(liveTelemetry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cpu: liveTelemetry.cpu.usage,
          mem: liveTelemetry.memory.usedPct,
          netRxKB: parseFloat((liveTelemetry.network.rxRateBytesSec / 1024).toFixed(1)),
          netTxKB: parseFloat((liveTelemetry.network.txRateBytesSec / 1024).toFixed(1)),
          diskReadMB: parseFloat(((liveTelemetry.disk.readBytesSec || 0) / (1024 * 1024)).toFixed(2)),
          diskWriteMB: parseFloat(((liveTelemetry.disk.writeBytesSec || 0) / (1024 * 1024)).toFixed(2))
        };
        const next = [...prev, newPoint];
        if (next.length > 120) next.shift();
        return next;
      });
    }
  }, [liveTelemetry, range]);

  const ranges = [
    { id: '1h', label: '1 Hour' },
    { id: '6h', label: '6 Hours' },
    { id: '24h', label: '24 Hours' },
    { id: '7d', label: '7 Days' },
  ];

  const gridStroke = resolvedTheme === 'dark' ? '#27272a' : '#e4e4e7';
  const axisStroke = resolvedTheme === 'dark' ? '#52525b' : '#a1a1aa';
  const tooltipStyle = {
    backgroundColor: resolvedTheme === 'dark' ? '#18181b' : '#ffffff',
    borderColor: resolvedTheme === 'dark' ? '#27272a' : '#e4e4e7',
    color: resolvedTheme === 'dark' ? '#f4f4f5' : '#18181b',
    borderRadius: '0.5rem',
    fontSize: '11px',
    fontFamily: 'JetBrains Mono',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };

  return (
    <div className="nx-card p-5">
      {/* Header with Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800/80 mb-6">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Historical Time-Series Telemetry
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">30-day ring buffer downsampled telemetry views</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="inline-flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
            {ranges.map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-1 text-xs font-mono rounded-md transition-all cursor-pointer ${
                  range === r.id
                    ? 'bg-emerald-600 text-white font-medium shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchHistory(range)}
            title="Refresh History"
            className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid of 3 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: CPU & RAM (%) */}
        <div className="bg-zinc-50/80 dark:bg-[#09090b] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-300">CPU & RAM Load (%)</span>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-emerald-600 dark:text-emerald-400">■ CPU</span>
              <span className="text-sky-600 dark:text-sky-400">■ RAM</span>
            </div>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="timeLabel" stroke={axisStroke} fontSize={10} tickLine={false} />
                <YAxis domain={[0, 100]} stroke={axisStroke} fontSize={10} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#cpuGrad)" isAnimationActive={false} />
                <Area type="monotone" dataKey="mem" name="RAM %" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#memGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Network Bandwidth (KB/s) */}
        <div className="bg-zinc-50/80 dark:bg-[#09090b] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-300">Network Throughput (KB/s)</span>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-emerald-600 dark:text-emerald-400">■ RX (In)</span>
              <span className="text-purple-600 dark:text-purple-400">■ TX (Out)</span>
            </div>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c084fc" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="timeLabel" stroke={axisStroke} fontSize={10} tickLine={false} />
                <YAxis stroke={axisStroke} fontSize={10} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="netRxKB" name="RX KB/s" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#rxGrad)" isAnimationActive={false} />
                <Area type="monotone" dataKey="netTxKB" name="TX KB/s" stroke="#c084fc" strokeWidth={2} fillOpacity={1} fill="url(#txGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Disk I/O (MB/s) */}
        <div className="bg-zinc-50/80 dark:bg-[#09090b] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-300">Disk I/O Throughput (MB/s)</span>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-amber-600 dark:text-amber-400">■ Read</span>
              <span className="text-rose-600 dark:text-rose-400">■ Write</span>
            </div>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dReadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="dWriteGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="timeLabel" stroke={axisStroke} fontSize={10} tickLine={false} />
                <YAxis stroke={axisStroke} fontSize={10} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="diskReadMB" name="Read MB/s" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#dReadGrad)" isAnimationActive={false} />
                <Area type="monotone" dataKey="diskWriteMB" name="Write MB/s" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#dWriteGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
