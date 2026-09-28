import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Play, Loader2, Copy, CheckCircle2, Square } from 'lucide-react';

export default function LiveTerminalModal({ isOpen, onClose, command, token, onShowToast, onFinished }) {
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  // Start execution when modal opens
  useEffect(() => {
    if (!isOpen || !command) return;

    setOutput('');
    setIsRunning(true);
    setIsCompleted(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function streamExecution() {
      try {
        const response = await fetch('/api/cron/run', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ command }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          setOutput(`[Error]: HTTP ${response.status} - ${errText}`);
          setIsRunning(false);
          setIsCompleted(true);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setOutput((prev) => prev + chunk);
        }

        setIsRunning(false);
        setIsCompleted(true);
        onFinished?.();
      } catch (err) {
        if (err.name === 'AbortError') {
          setOutput((prev) => prev + '\n[NexusControl] Stream aborted by user.\n');
        } else {
          setOutput((prev) => prev + `\n[Stream Error]: ${err.message}\n`);
        }
        setIsRunning(false);
        setIsCompleted(true);
      }
    }

    streamExecution();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, command, token]);

  if (!isOpen) return null;

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    setIsCompleted(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    onShowToast?.('Terminal output copied', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100 font-mono truncate max-w-md">
                  {command}
                </span>
                {isRunning ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Streaming Output...</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Completed</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                Real-time chunked stdout/stderr terminal pipe
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
              title="Copy output"
            >
              <Copy className="w-4 h-4" />
            </button>
            {isRunning && (
              <button
                onClick={handleStop}
                className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center gap-1"
                title="Stop execution stream"
              >
                <Square className="w-3 h-3" />
                <span>Stop</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Streaming Terminal Window */}
        <div className="flex-1 bg-black border border-zinc-900 rounded-xl p-4 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed whitespace-pre-wrap select-text mt-3">
          {output || (
            <div className="flex items-center gap-2 text-zinc-500 italic">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Connecting to process output pipe...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="pt-3.5 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] font-mono text-zinc-500">
            HTTP Transfer-Encoding: chunked • child_process.spawn
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            Close Terminal
          </button>
        </div>
      </div>
    </div>
  );
}
