import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, AlertTriangle, X, CheckSquare, RefreshCw } from 'lucide-react';

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatSize(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function TrashModal({
  token,
  isOpen,
  onClose,
  onTrashUpdated,
  onShowToast
}) {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const fetchTrash = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/files/trash', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch (err) {
      console.error('Failed to load trash:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrash();
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleRestore = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      const res = await fetch('/api/files/trash/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');

      onShowToast?.(`Restored ${ids.length} items`, 'success');
      onTrashUpdated?.();
      fetchTrash();
      setSelectedIds(new Set());
    } catch (err) {
      onShowToast?.(`Restore error: ${err.message}`, 'error');
    }
  };

  const handlePermanentDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Permanently delete ${ids.length} items? This cannot be undone.`)) return;

    try {
      const res = await fetch('/api/files/trash/permanent', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      onShowToast?.(`Permanently deleted ${ids.length} items`, 'info');
      onTrashUpdated?.();
      fetchTrash();
      setSelectedIds(new Set());
    } catch (err) {
      onShowToast?.(`Delete error: ${err.message}`, 'error');
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Empty entire Trash Bin? All files will be permanently erased.')) return;

    try {
      const res = await fetch('/api/files/trash/empty', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Empty trash failed');

      onShowToast?.('Trash Bin emptied', 'info');
      onTrashUpdated?.();
      fetchTrash();
      setSelectedIds(new Set());
    } catch (err) {
      onShowToast?.(`Empty error: ${err.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-3xl w-full p-5 shadow-2xl space-y-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500 dark:text-red-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recycle Bin (.trash)</h3>
            <span className="text-xs font-mono text-zinc-500">
              ({items.length} {items.length === 1 ? 'item' : 'items'})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTrash}
              className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded font-medium"
            >
              {selectedIds.size === items.length && items.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                {selectedIds.size} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestore}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
            <button
              onClick={handlePermanentDelete}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-600/80 hover:bg-red-600 disabled:opacity-40 text-white rounded font-medium transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Delete Permanently</span>
            </button>
            <button
              onClick={handleEmptyTrash}
              disabled={items.length === 0}
              className="px-3 py-1 bg-white dark:bg-zinc-900 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40 rounded font-medium transition-colors"
            >
              Empty Bin
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800/60 font-mono text-xs">
          {items.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              Trash Bin is currently empty
            </div>
          ) : (
            items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleToggleSelect(item.id)}
                  className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-red-500/10 text-zinc-900 dark:text-zinc-200' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900/60 text-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-red-600 cursor-pointer"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-200 truncate font-sans">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 truncate">
                        Original: {item.originalPath}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-zinc-500 whitespace-nowrap ml-4">
                    <span>{formatSize(item.size)}</span>
                    <span>{formatDate(item.trashedAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
