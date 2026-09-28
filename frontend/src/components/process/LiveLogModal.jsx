import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Loader2, Copy, Trash2, ArrowDown, Square, Play, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function LiveLogModal({ isOpen, onClose, appName, token, onShowToast }) {
  const [logs, setLogs] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const terminalRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Connect and stream journalctl logs
  const startStream = () => {
    if (!appName || !token) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setLogs('');
    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function fetchStream() {
      try {
        const response = await fetch(`/api/process/${encodeURIComponent(appName)}/logs`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          setLogs(`[Error]: HTTP ${response.status} - ${errText}\n`);
          setIsStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setLogs(prev => prev + chunk);
        }

        setIsStreaming(false);
      } catch (err) {
        if (err.name === 'AbortError') {
          setLogs(prev => prev + '\n[NexusControl PaaS] Log stream disconnected.\n');
        } else {
          setLogs(prev => prev + `\n[Stream Error]: ${err.message}\n`);
        }
        setIsStreaming(false);
      }
    }

    fetchStream();
  };

  useEffect(() => {
    if (isOpen && appName) {
      startStream();
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsStreaming(false);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, appName]);

  if (!isOpen) return null;

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    onShowToast?.('Logs copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setLogs('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100 truncate">
                  nc-app-{appName}.service
                </h3>
                {isStreaming ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                    DISCONNECTED
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                journalctl -u nc-app-{appName}.service -n 100 -f
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1 text-xs rounded-lg font-mono flex items-center gap-1.5 transition-colors border ${
                autoScroll
                  ? 'bg-zinc-800 text-emerald-400 border-zinc-700'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
              }`}
              title="Toggle auto-scroll to bottom"
            >
              <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            {/* Reconnect / Stop */}
            {isStreaming ? (
              <button
                onClick={handleStopStream}
                className="px-2.5 py-1 text-xs rounded-lg font-mono flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                title="Disconnect stream"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button
                onClick={startStream}
                className="px-2.5 py-1 text-xs rounded-lg font-mono flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                title="Reconnect stream"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Resume</span>
              </button>
            )}

            {/* Copy button */}
            <button
              onClick={handleCopy}
              disabled={!logs}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40"
              title="Copy output"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Clear logs */}
            <button
              onClick={handleClear}
              disabled={!logs}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
              title="Clear terminal window"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Terminal screen */}
        <div
          ref={terminalRef}
          className="flex-1 mt-3 bg-black text-green-400 font-mono text-xs p-4 rounded-xl border border-zinc-800/80 overflow-y-auto overflow-x-auto whitespace-pre leading-relaxed select-text shadow-inner"
        >
          {logs ? (
            <>
              {logs}
              <div ref={bottomRef} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500/50" />
              <span>Attaching to systemd journal stream...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 font-mono shrink-0">
          <div>
            App: <span className="text-zinc-300">nc-app-{appName}</span>
          </div>
          <div>
            Log Destination: <span className="text-zinc-300">journald</span> (Native Linux Zero-Disk Rotation)
          </div>
        </div>
      </div>
    </div>
  );
}
