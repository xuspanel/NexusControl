import React, { useState } from 'react';
import {
  Plus,
  X,
  Search,
  BookOpen,
  Download,
  Trash2,
  RefreshCw,
  Smartphone,
  ChevronDown,
  ChevronUp,
  CaseSensitive,
  Terminal as TermIcon
} from 'lucide-react';

export default function TerminalActionBar({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  connectionStatus, // 'connected' | 'connecting' | 'disconnected'
  onOpenPresets,
  onClearTerminal,
  onDownloadLogs,
  onReconnect,
  touchBarVisible,
  onToggleTouchBar,
  onSearch,
  onSearchNext,
  onSearchPrev,
  onCloseSearch,
  searchVisible
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (onSearchNext && searchQuery) {
      onSearchNext(searchQuery, { caseSensitive });
    }
  };

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (onSearch) {
      onSearch(val, { caseSensitive });
    }
  };

  const toggleCase = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    if (onSearch && searchQuery) {
      onSearch(searchQuery, { caseSensitive: next });
    }
  };

  return (
    <div className="bg-white dark:bg-[#0e1217] border-b border-zinc-200 dark:border-zinc-800 flex flex-col select-none transition-colors">
      {/* Upper row: Tabs & Actions */}
      <div className="flex items-center justify-between px-2 py-1.5 gap-2 overflow-x-auto no-scrollbar">
        {/* Session Tabs */}
        <div className="flex items-center gap-1 min-w-0">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-t-md cursor-pointer transition-all border-b-2 shrink-0 ${
                  isActive
                    ? 'bg-zinc-100 dark:bg-zinc-800/80 text-emerald-600 dark:text-emerald-400 border-emerald-500 font-semibold shadow-sm'
                    : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <TermIcon className="w-3.5 h-3.5" />
                <span className="truncate max-w-[110px]">{tab.name || `Session ${idx + 1}`}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="p-0.5 rounded text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors ml-1"
                    title="Close session"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onNewTab}
            className="p-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-800 text-zinc-600 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors shrink-0"
            title="Open new terminal session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Connection Status Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono mr-1">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500 dark:bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={
                connectionStatus === 'connected'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : connectionStatus === 'connecting'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }
            >
              {connectionStatus === 'connected'
                ? 'PTY ONLINE'
                : connectionStatus === 'connecting'
                ? 'CONNECTING'
                : 'OFFLINE'}
            </span>
          </div>

          {/* Search Toggle */}
          <button
            type="button"
            onClick={onSearch}
            className={`p-1.5 rounded text-xs transition-colors border ${
              searchVisible
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
            }`}
            title="Search buffer (Ctrl+Shift+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Presets Library */}
          <button
            type="button"
            onClick={onOpenPresets}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-700 hover:text-emerald-600 dark:text-zinc-300 dark:hover:text-emerald-400 border border-zinc-200 dark:border-zinc-800 transition-colors"
            title="Command Presets Library"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline">Presets</span>
          </button>

          {/* Download Logs */}
          <button
            type="button"
            onClick={onDownloadLogs}
            className="p-1.5 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 transition-colors"
            title="Export session buffer to .log"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Clear Buffer */}
          <button
            type="button"
            onClick={onClearTerminal}
            className="p-1.5 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-700 hover:text-rose-600 dark:text-zinc-300 dark:hover:text-rose-400 border border-zinc-200 dark:border-zinc-800 transition-colors"
            title="Clear terminal screen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Reconnect */}
          <button
            type="button"
            onClick={onReconnect}
            className="p-1.5 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 transition-colors"
            title="Reconnect WebSocket / Refresh PTY"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Touch Bar */}
          <button
            type="button"
            onClick={onToggleTouchBar}
            className={`p-1.5 rounded text-xs font-mono transition-colors border ${
              touchBarVisible
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
            }`}
            title="Toggle Mobile Touch Bar"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* In-Terminal Search Bar (When Open) */}
      {searchVisible && (
        <form
          onSubmit={handleSearchSubmit}
          className="px-3 py-2 bg-zinc-100/90 dark:bg-zinc-950/90 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2 text-xs font-mono animate-in slide-in-from-top-1"
        >
          <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search terminal output..."
            value={searchQuery}
            onChange={handleQueryChange}
            className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded px-2.5 py-1 text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
          />

          <button
            type="button"
            onClick={toggleCase}
            className={`px-2 py-1 rounded border text-[11px] transition-colors ${
              caseSensitive
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 font-semibold'
                : 'bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-300 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
            title="Match Case"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onSearchPrev && onSearchPrev(searchQuery, { caseSensitive })}
            className="p-1 rounded bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800 transition-colors"
            title="Previous Match"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onSearchNext && onSearchNext(searchQuery, { caseSensitive })}
            className="p-1 rounded bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800 transition-colors"
            title="Next Match"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onCloseSearch}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors ml-1"
            title="Close Search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
