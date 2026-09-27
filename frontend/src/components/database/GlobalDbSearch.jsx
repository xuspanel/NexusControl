import React, { useState } from 'react';
import {
  Search,
  Table,
  ArrowRight,
  Database,
  Loader2,
  AlertCircle,
  Layers,
  Sparkles
} from 'lucide-react';

export default function GlobalDbSearch({ token, dbName, onSelectTable, onShowToast }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/postgres/databases/${encodeURIComponent(dbName)}/search?query=${encodeURIComponent(searchTerm.trim())}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to execute global search');
      }

      setResults(data);
      if (onShowToast) {
        onShowToast(`Found ${data.totalMatches} match(es) across ${data.matches.length} table(s)`, 'info');
      }
    } catch (err) {
      setError(err.message || 'Error executing search');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Search Bar Toolbar */}
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan-500" />
            <span>Global Database Search</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Searches across all text, varchar, and character columns in user tables in database <code className="text-cyan-500 font-mono">{dbName}</code>
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search keyword, email, uuid, identifier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchTerm.trim()}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{searching ? 'Scanning...' : 'Search'}</span>
          </button>
        </form>
      </div>

      {/* 2. Error Display */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Search Results */}
      {results && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500 px-1">
            <span>
              Matches for "<strong className="text-cyan-400">{results.searchTerm}</strong>": {results.totalMatches} total match(es)
            </span>
          </div>

          {results.matches?.length > 0 ? (
            results.matches.map((item, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <Table className="w-4 h-4 text-cyan-500" />
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{item.schema}.{item.table}</span>
                    <span className="text-zinc-400">• column: <code className="text-amber-500">{item.column}</code></span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-500">
                      {item.matchCount} hit(s)
                    </span>
                  </div>

                  <button
                    onClick={() => onSelectTable(item.table, item.schema)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    <span>Open Table</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Match Preview Rows */}
                <div className="overflow-x-auto">
                  <div className="space-y-1.5 font-mono text-xs">
                    {item.matches?.map((row, rIdx) => (
                      <div
                        key={rIdx}
                        className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-300 overflow-x-auto text-[11px]"
                      >
                        <pre className="whitespace-pre-wrap select-all">{JSON.stringify(row, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl text-xs text-zinc-500">
              No matching records found in database "{dbName}" for "{results.searchTerm}".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
