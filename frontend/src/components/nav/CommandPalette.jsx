import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Command,
  ArrowRight,
  Sparkles,
  Terminal,
  Upload,
  RefreshCw,
  SunMoon,
  ShieldCheck,
  Plus,
  Globe,
  Boxes,
  FolderGit2,
  LayoutDashboard,
  CheckCircle2,
  X
} from 'lucide-react';
import { NAV_ITEMS } from '../../config/navigation';

export default function CommandPalette({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  onExecuteAction
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Quick Action Definitions
  const quickActions = useMemo(() => [
    {
      id: 'open_terminal',
      type: 'action',
      category: 'Quick Actions',
      label: 'Open Root Terminal Session',
      description: 'Launch an interactive bash pseudo-terminal as root',
      icon: Terminal,
      shortcut: 'Alt + 3',
      action: () => {
        onSelectTab('terminal');
        onExecuteAction?.('open_terminal');
      }
    },
    {
      id: 'upload_file',
      type: 'action',
      category: 'Quick Actions',
      label: 'Upload File to Server',
      description: 'Open chunked file uploader in Files Manager',
      icon: Upload,
      shortcut: 'Alt + 2',
      action: () => {
        onSelectTab('files');
        onExecuteAction?.('upload_file');
      }
    },
    {
      id: 'restart_docker',
      type: 'action',
      category: 'Quick Actions',
      label: 'Restart Docker Demo Container',
      description: 'Send restart signal to nexus-demo-service container',
      icon: Boxes,
      shortcut: 'Alt + 4',
      action: () => {
        onSelectTab('docker');
        onExecuteAction?.('restart_docker');
      }
    },
    {
      id: 'create_vhost',
      type: 'action',
      category: 'Quick Actions',
      label: 'Create New Virtual Host / Domain',
      description: 'Open atomic Nginx configuration wizard',
      icon: Plus,
      shortcut: 'Alt + 5',
      action: () => {
        onSelectTab('vhosts');
        onExecuteAction?.('create_vhost');
      }
    },
    {
      id: 'verify_audit',
      type: 'action',
      category: 'Quick Actions',
      label: 'Verify Audit Log Integrity',
      description: 'Cryptographically verify SHA-256 hash chain from Genesis to Head',
      icon: ShieldCheck,
      shortcut: 'Alt + 6',
      action: () => {
        onSelectTab('audit');
        onExecuteAction?.('verify_audit');
      }
    },
    {
      id: 'toggle_theme',
      type: 'action',
      category: 'Quick Actions',
      label: 'Toggle Dark / Light Theme',
      description: 'Switch between sleek dark mode and high-contrast light mode',
      icon: SunMoon,
      shortcut: 'T',
      action: () => {
        onExecuteAction?.('toggle_theme');
      }
    }
  ], [onSelectTab, onExecuteAction]);

  // Combined searchable entries
  const allEntries = useMemo(() => {
    const navEntries = NAV_ITEMS.map(item => ({
      id: item.id,
      type: 'navigation',
      category: 'Navigation',
      label: `Jump to ${item.label}`,
      description: item.description,
      icon: item.iconComponent,
      shortcut: `Alt + ${item.shortcut}`,
      action: () => onSelectTab(item.id)
    }));

    return [...navEntries, ...quickActions];
  }, [quickActions, onSelectTab]);

  // Filter entries based on query
  const filteredEntries = useMemo(() => {
    if (!query.trim()) return allEntries;
    const q = query.toLowerCase();
    return allEntries.filter(entry =>
      entry.label.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.category.toLowerCase().includes(q)
    );
  }, [allEntries, query]);

  // Auto-focus input and reset query on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected index within bounds when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredEntries.length]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && filteredEntries.length > 0) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredEntries.length]);

  // Keyboard navigation handler
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filteredEntries.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredEntries.length) % (filteredEntries.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredEntries[selectedIndex]) {
        filteredEntries[selectedIndex].action();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40">
          <Search className="w-5 h-5 text-zinc-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search screens... (e.g. Terminal, Docker, Theme)"
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none font-sans"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 mr-2 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 space-y-1 divide-y divide-zinc-100 dark:divide-zinc-900/50"
        >
          {filteredEntries.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400 text-xs font-mono">
              <Sparkles className="w-6 h-6 mx-auto mb-2 text-zinc-400 stroke-1" />
              <span>No commands or screens found matching "{query}"</span>
            </div>
          ) : (
            filteredEntries.map((entry, idx) => {
              const isSelected = idx === selectedIndex;
              const IconComponent = entry.icon;

              return (
                <div
                  key={entry.id}
                  data-index={idx}
                  onClick={() => {
                    entry.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`p-2 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-zinc-100 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/60 text-zinc-500 dark:text-zinc-400'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold font-sans truncate">
                          {entry.label}
                        </span>
                        {entry.category === 'Quick Actions' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-semibold font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            Action
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate font-sans">
                        {entry.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-3">
                    {entry.shortcut && (
                      <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {entry.shortcut}
                      </span>
                    )}
                    <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Guide */}
        <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center space-x-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px]">↑</kbd>
              <kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px]">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px]">↵</kbd>
              <span>to select</span>
            </span>
          </div>
          <div>
            <span className="text-zinc-400">NexusControl Spotlight</span>
          </div>
        </div>
      </div>
    </div>
  );
}
