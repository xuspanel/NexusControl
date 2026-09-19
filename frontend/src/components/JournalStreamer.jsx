import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Search, 
  RefreshCw, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  ArrowDownCircle,
  Filter
} from 'lucide-react';

export default function JournalStreamer({ token, onShowToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('all'); // 'all' | 'error' | 'warn' | 'info'
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef(null);

  const fetchLogs = async () => {
    if (!token || isCollapsed) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({
        lines: lines.toString(),
        level,
        search: search.trim()
      });
      const res = await fetch(`/api/system/logs?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch journal logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [token, level, lines, isCollapsed]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const copyAllLogs = () => {
    const raw = logs.map(l => l.raw).join('\n');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    onShowToast?.('Journal logs copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelBadgeColor = (lvl) => {
    if (lvl === 'ERROR') return 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (lvl === 'WARN') return 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/20';
  };

  return (
    <div className="nx-card overflow-hidden">
      {/* Header */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#121215]">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                System Journal Streamer
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-850 text-zinc-700 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-800">
                journalctl -f
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Real-time centralized host and systemd event log</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Level Filter Tabs */}
          <div className="inline-flex bg-zinc-200/80 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-300 dark:border-zinc-800 text-xs font-mono">
            {['all', 'error', 'warn', 'info'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer uppercase text-[10px] ${
                  level === lvl ? 'bg-emerald-600 text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
              placeholder="Grep pattern..."
              className="bg-white dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 rounded-lg pl-7 pr-3 py-1 text-xs text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 font-mono w-32 sm:w-40"
            />
          </div>

          {/* Lines limit */}
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-800 dark:text-zinc-300 focus:outline-none cursor-pointer"
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
          </select>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border text-xs font-mono transition-colors ${
              autoScroll 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
            title="Auto-scroll to latest"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
          </button>

          {/* Copy Logs */}
          <button
            onClick={copyAllLogs}
            className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            title="Copy Logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Manual Refresh */}
          <button
            onClick={fetchLogs}
            className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            title={isCollapsed ? 'Expand Terminal' : 'Collapse Terminal'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      {!isCollapsed && (
        <div 
          ref={containerRef}
          className="bg-zinc-100/60 dark:bg-[#09090b] p-4 max-h-96 overflow-y-auto relative font-mono text-xs select-text border-t border-zinc-200 dark:border-zinc-800/80"
        >
          {logs.map((entry, index) => (
            <div 
              key={index} 
              className="py-1 px-1.5 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/30 rounded flex items-start gap-2 leading-relaxed group"
            >
              <span className="text-zinc-500 dark:text-zinc-600 text-[10px] whitespace-nowrap select-none">
                {entry.timestamp?.split('T')[1]?.split('+')[0] || entry.timestamp}
              </span>
              <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${getLevelBadgeColor(entry.level)}`}>
                {entry.level}
              </span>
              <span className="text-purple-600 dark:text-purple-400/90 whitespace-nowrap font-medium text-[11px]">
                [{entry.unit}]
              </span>
              <span className={`flex-1 break-all ${
                entry.level === 'ERROR' ? 'text-rose-600 dark:text-rose-300' : entry.level === 'WARN' ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-800 dark:text-zinc-300'
              }`}>
                {entry.message}
              </span>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-600">
              No journal logs match the current filter criteria.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
