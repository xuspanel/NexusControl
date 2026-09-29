import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  Terminal,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileCode,
  Table,
  Copy,
  Check,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useTheme } from '../../context/ThemeProvider';

export default function MysqlTerminal({ token, dbName, onShowToast }) {
  const { theme } = useTheme();
  const [sql, setSql] = useState(`-- MySQL / MariaDB Query Console: ${dbName}
-- Press Ctrl+Enter or Cmd+Enter to execute
SHOW FULL TABLES;`);

  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [resultView, setResultView] = useState('table'); // 'table' | 'json'
  const [copied, setCopied] = useState(false);

  const editorRef = useRef(null);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(
      // KeyMod.CtrlCmd | KeyCode.Enter
      2048 | 3,
      () => {
        handleExecuteQuery();
      }
    );
  };

  const handleExecuteQuery = async () => {
    const queryToRun = (editorRef.current ? editorRef.current.getValue() : sql).trim();
    if (!queryToRun) return;

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/mysql/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dbName, sql: queryToRun })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data);
      } else {
        setResult(data);
        if (onShowToast) {
          onShowToast(`Query completed in ${data.durationMs}ms (${data.rowCount} row(s))`, 'success');
        }
      }
    } catch (err) {
      setError({ error: err.message || 'Network error executing query.' });
    } finally {
      setExecuting(false);
    }
  };

  const copyResults = () => {
    if (!result?.rows) return;
    navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sample snippets
  const snippets = [
    { label: 'Show Full Tables', query: 'SHOW FULL TABLES;' },
    { label: 'Active Processlist', query: 'SHOW FULL PROCESSLIST;' },
    { label: 'Table Status & Engine', query: 'SHOW TABLE STATUS;' },
    { label: 'Global Thread Status', query: 'SHOW GLOBAL STATUS LIKE "Threads_%";' },
    { label: 'MySQL / MariaDB Version', query: 'SELECT VERSION(), CURRENT_USER(), DATABASE();' },
    { label: 'Character Set & Collation', query: 'SELECT @@character_set_database, @@collation_database;' }
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                MySQL / MariaDB SQL Console
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {dbName}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Interactive root query runner with Monaco MySQL syntax highlighting and execution telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Snippets Dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                setSql(e.target.value);
                if (editorRef.current) editorRef.current.setValue(e.target.value);
              }
            }}
            className="px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>Load SQL Snippet...</option>
            {snippets.map((s, idx) => (
              <option key={idx} value={s.query}>{s.label}</option>
            ))}
          </select>

          {/* Run Query Button */}
          <button
            onClick={handleExecuteQuery}
            disabled={executing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all transform active:scale-95 cursor-pointer disabled:opacity-50"
            title="Ctrl + Enter"
          >
            {executing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white" />
            )}
            <span>{executing ? 'Executing...' : 'Run Query'}</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] bg-black/30 font-mono">
              Ctrl+↵
            </span>
          </button>
        </div>
      </div>

      {/* 2. Monaco Editor Container */}
      <div className="h-64 bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <Editor
          height="100%"
          language="mysql"
          value={sql}
          theme={theme === 'light' ? 'light' : 'vs-dark'}
          onChange={(val) => setSql(val || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 13,
            tabSize: 2,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            automaticLayout: true
          }}
        />
      </div>

      {/* 3. Query Results / Error Pane */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-mono space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>MySQL Syntax / Execution Error</span>
          </div>
          <p className="font-semibold text-rose-400">{error.error}</p>
          {error.code && <div className="text-[11px] text-zinc-400">Error Code: <span className="text-rose-400">{error.code}</span></div>}
          {error.sqlState && <div className="text-[11px] text-zinc-400">SQL State: <span className="text-amber-400">{error.sqlState}</span></div>}
        </div>
      )}

      {result && (
        <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs space-y-0 animate-in fade-in">
          {/* Result Header & Status Bar */}
          <div className="p-3 sm:p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-500 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                {result.command || 'SUCCESS'}
              </span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-600 dark:text-zinc-300 font-bold">
                {result.rowCount} row(s) returned
              </span>
              <span className="text-zinc-500">•</span>
              <span className="flex items-center gap-1 text-zinc-500">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                {result.durationMs} ms
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                <button
                  onClick={() => setResultView('table')}
                  className={`px-2.5 py-1 rounded-lg font-mono flex items-center gap-1 transition-all cursor-pointer ${
                    resultView === 'table' ? 'bg-white dark:bg-zinc-800 text-emerald-500 shadow-xs font-bold' : 'text-zinc-500'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
                <button
                  onClick={() => setResultView('json')}
                  className={`px-2.5 py-1 rounded-lg font-mono flex items-center gap-1 transition-all cursor-pointer ${
                    resultView === 'json' ? 'bg-white dark:bg-zinc-800 text-emerald-500 shadow-xs font-bold' : 'text-zinc-500'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>

              <button
                onClick={copyResults}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Copy Results JSON"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Result Content */}
          {resultView === 'table' ? (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-zinc-400 text-center">#</th>
                    {result.fields?.map(f => (
                      <th key={f.name} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                        {f.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {result.rows?.length > 0 ? (
                    result.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                        <td className="py-2 px-3 text-center text-zinc-400 font-sans text-[10px]">{idx + 1}</td>
                        {result.fields?.map(f => {
                          const val = row[f.name];
                          return (
                            <td key={f.name} className="py-2 px-3 whitespace-nowrap">
                              {val === null || val === undefined ? (
                                <span className="text-zinc-400 italic text-[10px]">NULL</span>
                              ) : typeof val === 'object' ? (
                                <span className="text-purple-400">{JSON.stringify(val)}</span>
                              ) : typeof val === 'boolean' ? (
                                <span className={val ? 'text-emerald-400' : 'text-rose-400'}>{String(val)}</span>
                              ) : (
                                <span className="text-zinc-800 dark:text-zinc-200">{String(val)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={(result.fields?.length || 0) + 1} className="py-8 text-center text-zinc-500 font-sans">
                        Query returned zero rows.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 bg-zinc-950 font-mono text-xs text-zinc-300 max-h-80 overflow-y-auto">
              <pre className="select-all">{JSON.stringify(result.rows, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
