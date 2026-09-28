import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  Trash2,
  CornerDownLeft,
  Copy,
  Sparkles,
  HelpCircle,
  Loader2
} from 'lucide-react';

export default function RedisConsole({ token, onShowToast }) {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([
    {
      type: 'system',
      text: 'NexusControl Redis Console Initialized. Connected to 127.0.0.1:6379.\nType commands like PING, INFO, DBSIZE, or GET <key>.'
    }
  ]);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Format Redis output into redis-cli styled text
  const formatOutput = (output) => {
    if (output === null || output === undefined) {
      return '(nil)';
    }
    if (typeof output === 'number') {
      return `(integer) ${output}`;
    }
    if (typeof output === 'string') {
      return `"${output}"`;
    }
    if (Array.isArray(output)) {
      if (output.length === 0) return '(empty list or set)';
      return output
        .map((item, idx) => {
          const formattedItem =
            typeof item === 'object' && item !== null
              ? JSON.stringify(item)
              : String(item);
          return `${idx + 1}) "${formattedItem}"`;
        })
        .join('\n');
    }
    if (typeof output === 'object') {
      return JSON.stringify(output, null, 2);
    }
    return String(output);
  };

  const handleExecute = async (cmdToRun = command) => {
    const rawCmd = (cmdToRun || '').trim();
    if (!rawCmd || isExecuting) return;

    setIsExecuting(true);
    setCommandHistory((prev) => [rawCmd, ...prev]);
    setHistoryIndex(-1);

    // Append user input to log
    setHistory((prev) => [
      ...prev,
      { type: 'input', text: `127.0.0.1:6379> ${rawCmd}` }
    ]);
    setCommand('');

    try {
      const res = await fetch('/api/redis/cli', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: rawCmd })
      });
      const data = await res.json();

      if (data.error) {
        setHistory((prev) => [
          ...prev,
          { type: 'error', text: `(error) ${data.error}` }
        ]);
      } else {
        setHistory((prev) => [
          ...prev,
          { type: 'output', text: formatOutput(data.output) }
        ]);
      }
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        { type: 'error', text: `(network error) ${err.message}` }
      ]);
    } finally {
      setIsExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(nextIndex);
        setCommand(commandHistory[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setCommand(commandHistory[nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  const quickCommands = [
    'PING',
    'DBSIZE',
    'INFO memory',
    'INFO stats',
    'CLIENT LIST',
    'TIME'
  ];

  return (
    <div className="space-y-3 font-sans">
      {/* Quick Chips & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mr-1 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            Quick Commands:
          </span>
          {quickCommands.map((qc) => (
            <button
              key={qc}
              type="button"
              onClick={() => handleExecute(qc)}
              className="px-2.5 py-1 text-[11px] font-mono rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              {qc}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setHistory([])}
          className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-1 transition-colors"
          title="Clear console output"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      {/* Terminal Display */}
      <div className="bg-[#0e0e11] border border-zinc-800 rounded-2xl shadow-xl overflow-hidden font-mono text-xs flex flex-col h-[520px]">
        {/* Terminal Header Bar */}
        <div className="h-9 px-4 bg-zinc-900/80 border-b border-zinc-800/80 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-[11px] font-medium text-zinc-400 ml-2">
              redis-cli — 127.0.0.1:6379
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">interactive session</span>
        </div>

        {/* Scrollable Terminal Output */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2">
          {history.map((entry, idx) => (
            <div key={idx} className="leading-relaxed">
              {entry.type === 'system' && (
                <div className="text-zinc-500 whitespace-pre-wrap">{entry.text}</div>
              )}
              {entry.type === 'input' && (
                <div className="text-purple-400 font-semibold">{entry.text}</div>
              )}
              {entry.type === 'output' && (
                <div className="text-zinc-200 whitespace-pre-wrap pl-3 border-l-2 border-zinc-800">
                  {entry.text}
                </div>
              )}
              {entry.type === 'error' && (
                <div className="text-rose-400 font-semibold whitespace-pre-wrap pl-3 border-l-2 border-rose-500/50">
                  {entry.text}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Command Input Row */}
        <div className="p-3 bg-zinc-900/90 border-t border-zinc-800/80 flex items-center gap-2">
          <span className="text-purple-400 font-bold select-none shrink-0">
            127.0.0.1:6379&gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type Redis command (e.g. GET mykey, HGETALL myhash)..."
            disabled={isExecuting}
            autoFocus
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 focus:outline-none text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => handleExecute()}
            disabled={isExecuting || !command.trim()}
            className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-30 transition-colors shrink-0"
            title="Execute (Enter)"
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
