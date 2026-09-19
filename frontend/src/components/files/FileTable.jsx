import React, { useRef } from 'react';
import {
  ArrowRight,
  Shield,
  ChevronDown,
  ChevronUp,
  Folder,
  MoreVertical
} from 'lucide-react';
import { getFileIcon } from './fileIcons';

function formatDate(isoOrTs) {
  if (!isoOrTs) return '—';
  const d = new Date(isoOrTs);
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function FileTable({
  items = [],
  viewMode = 'list',
  selectedPaths = new Set(),
  onToggleSelect,
  onSelectAll,
  onOpenItem,
  onContextMenu,
  sortBy,
  sortOrder,
  onSortChange,
  clipboard
}) {
  const isAllSelected = items.length > 0 && items.every((it) => selectedPaths.has(it.path));
  const longPressTimerRef = useRef(null);

  const handleRowClick = (e, item, index) => {
    e.stopPropagation();
    onToggleSelect(item.path, {
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
      index
    });
  };

  const handleTouchStart = (e, item) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (window.navigator?.vibrate) window.navigator.vibrate(20);
      const touch = e.touches[0];
      onContextMenu(
        {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: touch?.clientX || window.innerWidth / 2,
          clientY: touch?.clientY || window.innerHeight / 2
        },
        item
      );
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const renderSortArrow = (col) => {
    if (sortBy !== col) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-1 text-emerald-400" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-1 text-emerald-400" />
    );
  };

  return (
    <div
      className="flex-1 overflow-y-auto min-h-0 select-none bg-zinc-50 dark:bg-[#09090b]"
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, null);
      }}
      onClick={() => onSelectAll(false)}
    >
      {viewMode === 'list' ? (
        <div className="w-full">
          {/* Desktop Table View (md and above) */}
          <div className="hidden md:block">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-100/90 dark:bg-zinc-950/90 text-zinc-600 dark:text-zinc-400 font-mono sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="w-10 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => onSelectAll(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th
                    onClick={() => onSortChange('name')}
                    className="px-3 py-2 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                  >
                    Name {renderSortArrow('name')}
                  </th>
                  <th
                    onClick={() => onSortChange('size')}
                    className="w-28 px-3 py-2 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors text-right"
                  >
                    Size {renderSortArrow('size')}
                  </th>
                  <th
                    onClick={() => onSortChange('permissions')}
                    className="w-32 px-3 py-2 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                  >
                    Mode {renderSortArrow('permissions')}
                  </th>
                  <th className="w-28 px-3 py-2">Owner:Group</th>
                  <th
                    onClick={() => onSortChange('mtime')}
                    className="w-40 px-3 py-2 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                  >
                    Modified {renderSortArrow('mtime')}
                  </th>
                  <th className="w-10 px-2 py-2 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/40 font-mono">
                {items.map((item, idx) => {
                  const isSelected = selectedPaths.has(item.path);
                  const isCut = clipboard?.mode === 'cut' && clipboard.items.includes(item.path);

                  return (
                    <tr
                      key={item.path}
                      onClick={(e) => handleRowClick(e, item, idx)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onOpenItem(item);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onContextMenu(e, item);
                      }}
                      className={`cursor-pointer transition-colors group ${
                        isSelected
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-900/60 text-zinc-800 dark:text-zinc-300'
                      } ${isCut ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleSelect(item.path, { ctrlKey: true });
                          }}
                          className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 max-w-xl truncate">
                          {getFileIcon(item)}
                          <span className="truncate font-sans font-medium text-xs text-zinc-900 dark:text-zinc-100">
                            {item.name}
                          </span>
                          {item.isSymbolicLink && (
                            <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono truncate">
                              <ArrowRight className="w-2.5 h-2.5 text-zinc-400 dark:text-zinc-600" />
                              {item.symlinkTarget || 'broken'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {item.isDirectory ? '—' : item.sizeFormatted || `${item.size} B`}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap font-mono text-[11px]">
                        <span>{item.permissionsFormatted || item.permissions}</span>
                        <span className="ml-1 text-[10px] text-zinc-400 dark:text-zinc-600">({item.octalMode})</span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-[11px]">
                        {item.owner}:{item.group}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-500 whitespace-nowrap text-[11px]">
                        {formatDate(item.modified)}
                      </td>
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onContextMenu(e, item);
                          }}
                          className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Actions"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch-Friendly Card / List View (< md) */}
          <div className="md:hidden divide-y divide-zinc-200 dark:divide-zinc-800/60">
            {/* Mobile Header Bar */}
            <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-950/90 text-zinc-600 dark:text-zinc-400 font-mono text-xs flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
              <label className="flex items-center gap-2 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-500 focus:ring-0"
                />
                <span className="text-[11px] uppercase tracking-wider">Select All</span>
              </label>

              <button
                onClick={() => onSortChange('name')}
                className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-1"
              >
                <span>Sort by {sortBy}</span>
                {renderSortArrow(sortBy)}
              </button>
            </div>

            {items.map((item, idx) => {
              const isSelected = selectedPaths.has(item.path);
              const isCut = clipboard?.mode === 'cut' && clipboard.items.includes(item.path);

              return (
                <div
                  key={item.path}
                  onClick={(e) => handleRowClick(e, item, idx)}
                  onTouchStart={(e) => handleTouchStart(e, item)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                  className={`flex items-center justify-between p-3 min-h-[52px] transition-colors border-l-2 active:bg-zinc-200 dark:active:bg-zinc-800/80 ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300'
                      : 'border-transparent text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
                  } ${isCut ? 'opacity-50' : ''}`}
                >
                  {/* Left: Checkbox (Min 44x44px target) */}
                  <div
                    className="p-2 -ml-2 mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(item.path, { ctrlKey: true });
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-500 focus:ring-0 cursor-pointer w-4 h-4"
                    />
                  </div>

                  {/* Center: File info with icon and stacked details */}
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 pr-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenItem(item);
                    }}
                  >
                    <div className="shrink-0 p-1.5 rounded bg-zinc-200/70 dark:bg-zinc-900/60 border border-zinc-300 dark:border-zinc-800/60">
                      {getFileIcon(item, item.isDirectory, 'w-5 h-5')}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate font-sans">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono mt-0.5">
                        <span>{item.isDirectory ? 'Directory' : item.sizeFormatted || `${item.size} B`}</span>
                        <span>•</span>
                        <span>{formatDate(item.modified)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Dedicated 3-dot trigger for mobile bottom sheet */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onContextMenu(e, item);
                    }}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 active:bg-zinc-200 dark:active:bg-zinc-800 rounded-lg shrink-0 transition-colors"
                    title="Open actions"
                    aria-label={`Actions for ${item.name}`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-3">
          {items.map((item, idx) => {
            const isSelected = selectedPaths.has(item.path);
            const isCut = clipboard?.mode === 'cut' && clipboard.items.includes(item.path);

            return (
              <div
                key={item.path}
                onClick={(e) => handleRowClick(e, item, idx)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onOpenItem(item);
                }}
                onTouchStart={(e) => handleTouchStart(e, item)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenu(e, item);
                }}
                className={`relative p-3 rounded-xl border flex flex-col items-center text-center cursor-pointer transition-all min-h-[110px] justify-between ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-600/40 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-800 dark:text-zinc-300'
                } ${isCut ? 'opacity-50' : ''}`}
              >
                {/* Mobile three-dot in top right of grid card */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onContextMenu(e, item);
                  }}
                  className="absolute top-1.5 right-1.5 p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors"
                  title="Actions"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                <div
                  className="w-full flex flex-col items-center flex-1 justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenItem(item);
                  }}
                >
                  <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-950/60 mb-2">
                    {getFileIcon(item, item.isDirectory, 'w-8 h-8')}
                  </div>
                  <span className="w-full text-xs font-medium truncate font-sans px-1 text-zinc-900 dark:text-zinc-100" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {item.isDirectory ? 'directory' : item.sizeFormatted || `${item.size} B`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
          <Folder className="w-8 h-8 text-zinc-400 dark:text-zinc-600 stroke-[1.5]" />
          <span className="text-xs font-mono">This directory is empty</span>
        </div>
      )}
    </div>
  );
}
