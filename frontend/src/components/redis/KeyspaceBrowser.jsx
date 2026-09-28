import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  Clock,
  Trash2,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles,
  Key,
  Loader2,
  AlertCircle,
  Copy
} from 'lucide-react';
import KeyEditorModal from './KeyEditorModal';
import NewKeyModal from './NewKeyModal';

export default function KeyspaceBrowser({ token, onShowToast }) {
  const [keys, setKeys] = useState([]);
  const [cursor, setCursor] = useState('0');
  const [pattern, setPattern] = useState('*');
  const [searchInput, setSearchInput] = useState('*');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);

  const debounceTimerRef = useRef(null);

  // Fetch keys with cursor and pattern
  const fetchKeys = useCallback(
    async (scanCursor = '0', append = false, currentPattern = pattern) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await fetch(
          `/api/redis/keys?cursor=${encodeURIComponent(scanCursor)}&pattern=${encodeURIComponent(currentPattern)}&count=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch keys');

        setCursor(data.cursor || '0');
        if (append) {
          setKeys((prev) => [...prev, ...(data.keys || [])]);
        } else {
          setKeys(data.keys || []);
        }
      } catch (err) {
        onShowToast?.(err.message, 'error');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, pattern, onShowToast]
  );

  // Initial load
  useEffect(() => {
    fetchKeys('0', false, '*');
  }, []);

  // Handle Search Input with debounce
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const sanitized = val.trim() || '*';
      setPattern(sanitized);
      fetchKeys('0', false, sanitized);
    }, 350);
  };

  // Helper for type color badges
  const getTypeBadge = (type) => {
    switch (type?.toLowerCase()) {
      case 'string':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'hash':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case 'list':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'set':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'zset':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
    }
  };

  // Format TTL into human-readable label
  const formatTTL = (ttl) => {
    if (ttl === -1 || ttl === null) {
      return <span className="text-zinc-400 font-mono text-[11px]">Persistent (No TTL)</span>;
    }
    if (ttl === -2) {
      return <span className="text-rose-500 font-mono text-[11px]">Expired</span>;
    }
    if (ttl < 60) {
      return <span className="text-amber-500 font-mono text-[11px] font-semibold">{ttl}s</span>;
    }
    if (ttl < 3600) {
      const mins = Math.floor(ttl / 60);
      return <span className="text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">{mins}m {ttl % 60}s</span>;
    }
    const hours = Math.floor(ttl / 3600);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return <span className="text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">{days}d {hours % 24}h</span>;
    }
    return <span className="text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">{hours}h {Math.floor((ttl % 3600) / 60)}m</span>;
  };

  return (
    <div className="space-y-4">
      {/* Control Bar: Search & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input with Pattern */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Filter keys (e.g. user:*, session:*, cache:*)..."
            className="w-full pl-9 pr-8 py-2 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-colors shadow-xs"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('*');
                setPattern('*');
                fetchKeys('0', false, '*');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-mono"
              title="Reset pattern"
            >
              ×
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchKeys('0', false, pattern)}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 transition-colors shadow-xs"
            title="Scan current pattern again"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Rescan</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewKeyModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Key</span>
          </button>
        </div>
      </div>

      {/* Keys Table / Data Grid */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Keyspace Catalog
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
              {keys.length} loaded
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400">
            SCAN match: <code className="text-zinc-600 dark:text-zinc-300 font-bold">{pattern}</code>
          </div>
        </div>

        {loading && keys.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span className="text-xs font-mono">Executing SCAN cursor...</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Key className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              No keys found matching pattern "{pattern}".
            </p>
            <button
              onClick={() => setIsNewKeyModalOpen(true)}
              className="text-xs text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 font-medium pt-1"
            >
              <Plus className="w-3 h-3" />
              <span>Create first key</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 font-mono text-[11px] border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Key Name</th>
                  <th className="py-2.5 px-4 font-medium w-28">Type</th>
                  <th className="py-2.5 px-4 font-medium w-48">TTL</th>
                  <th className="py-2.5 px-4 font-medium text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
                {keys.map((item, idx) => (
                  <tr
                    key={item.key + idx}
                    onClick={() => setSelectedKey(item.key)}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-md sm:max-w-xl">
                        <Key className="w-3.5 h-3.5 text-zinc-400 group-hover:text-purple-500 transition-colors shrink-0" />
                        <span className="truncate">{item.key}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getTypeBadge(item.type)}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        {formatTTL(item.ttl)}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(item.key);
                            onShowToast?.('Key copied', 'info');
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                          title="Copy key name"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Pagination Footer */}
        {cursor !== '0' && (
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-center bg-zinc-50/50 dark:bg-zinc-900/30">
            <button
              type="button"
              onClick={() => fetchKeys(cursor, true, pattern)}
              disabled={loadingMore}
              className="px-4 py-1.5 text-xs font-mono font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-purple-500 text-purple-600 dark:text-purple-400 bg-white dark:bg-zinc-950 flex items-center gap-2 transition-all shadow-xs"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning next batch...</span>
                </>
              ) : (
                <>
                  <span>Load More Keys (Cursor: {cursor})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Edit / Inspect Modal */}
      {selectedKey && (
        <KeyEditorModal
          isOpen={Boolean(selectedKey)}
          keyName={selectedKey}
          token={token}
          onClose={() => setSelectedKey(null)}
          onSaved={() => fetchKeys('0', false, pattern)}
          onDeleted={() => {
            setKeys((prev) => prev.filter((k) => k.key !== selectedKey));
            setSelectedKey(null);
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* New Key Modal */}
      <NewKeyModal
        isOpen={isNewKeyModalOpen}
        onClose={() => setIsNewKeyModalOpen(false)}
        token={token}
        onCreated={(newKey) => {
          fetchKeys('0', false, pattern);
          setSelectedKey(newKey);
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
}
