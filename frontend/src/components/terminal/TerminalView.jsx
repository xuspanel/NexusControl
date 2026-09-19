import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SerializeAddon } from '@xterm/addon-serialize';
import '@xterm/xterm/css/xterm.css';

import TerminalActionBar from './TerminalActionBar';
import VirtualTouchBar from './VirtualTouchBar';
import PresetsDropdown from './PresetsDropdown';
import { useTheme } from '../../context/ThemeProvider';

const darkTerminalTheme = {
  background: '#09090b',
  foreground: '#f4f4f5',
  cursor: '#10b981',
  cursorAccent: '#09090b',
  selectionBackground: 'rgba(16, 185, 129, 0.35)',
  black: '#18181b',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#f4f4f5',
  brightBlack: '#71717a',
  brightRed: '#ef4444',
  brightGreen: '#10b981',
  brightYellow: '#f59e0b',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff'
};

const lightTerminalTheme = {
  background: '#fafafa',
  foreground: '#18181b',
  cursor: '#059669',
  cursorAccent: '#fafafa',
  selectionBackground: 'rgba(5, 150, 105, 0.25)',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e4e4e7',
  brightBlack: '#71717a',
  brightRed: '#b91c1c',
  brightGreen: '#15803d',
  brightYellow: '#b45309',
  brightBlue: '#1d4ed8',
  brightMagenta: '#7e22ce',
  brightCyan: '#0e7490',
  brightWhite: '#09090b'
};

const STORAGE_TABS_KEY = 'nexus_terminal_tabs';
const STORAGE_ACTIVE_TAB_KEY = 'nexus_terminal_active_tab';

export default function TerminalView({ token, onShowToast }) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef(null);
  const terminalInstanceRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const serializeAddonRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Dynamically update terminal palette on theme change without reload
  useEffect(() => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.options.theme =
        resolvedTheme === 'dark' ? darkTerminalTheme : lightTerminalTheme;
    }
  }, [resolvedTheme]);

  // Tabs state
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TABS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved terminal tabs:', e);
    }
    return [{ id: 'default-' + Math.random().toString(36).substring(2, 9), name: 'bash #1' }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const savedActive = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY);
      if (savedActive) return savedActive;
    } catch (e) {}
    return tabs[0]?.id || 'default';
  });

  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected' | 'connecting' | 'disconnected'
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [touchBarVisible, setTouchBarVisible] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);

  // Sync tabs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TABS_KEY, JSON.stringify(tabs));
    } catch (e) {}
  }, [tabs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_TAB_KEY, activeTabId);
    } catch (e) {}
  }, [activeTabId]);

  // Connect WebSocket & bind to terminal
  const connectWebSocket = useCallback((term, sessionId) => {
    if (!token || !term) return;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    setConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host = window.location.host;
    // If running in local Vite dev server directly on port 5173
    if (window.location.port === '5173') {
      host = `${window.location.hostname}:8787`;
    }

    const cols = term.cols || 80;
    const rows = term.rows || 24;
    const wsUrl = `${protocol}//${host}/api/terminal/ws?token=${encodeURIComponent(
      token
    )}&sessionId=${encodeURIComponent(sessionId)}&cols=${cols}&rows=${rows}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      if (onShowToast) onShowToast('Terminal connected to root shell', 'success');
      // Request a fit & sync dimensions
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'resize',
              cols: term.cols,
              rows: term.rows
            })
          );
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' || msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term.write(`\r\n\x1b[31m[Process completed with exit code ${msg.exitCode}]\x1b[0m\r\n`);
          setConnectionStatus('disconnected');
        }
      } catch (e) {
        // Raw string fallback
        term.write(event.data);
      }
    };

    ws.onerror = (err) => {
      console.warn('Terminal WebSocket error:', err);
      setConnectionStatus('disconnected');
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      if (event.code === 4001 || event.code === 4401) {
        term.write('\r\n\x1b[31m[Session terminated: Authentication required or invalid token]\x1b[0m\r\n');
      } else if (event.code === 4003) {
        term.write('\r\n\x1b[31m[Session terminated: Client IP is not in whitelist]\x1b[0m\r\n');
      }
    };
  }, [token, onShowToast]);

  // Initialize Terminal instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Dispose prior instance
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
    }

    const term = new Terminal({
      theme: resolvedTheme === 'dark' ? darkTerminalTheme : lightTerminalTheme,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      allowProposedApi: true,
      scrollback: 10000
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const serializeAddon = new SerializeAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(serializeAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = '11';

    // WebGL Addon with graceful Canvas fallback
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon context restricted, falling back to standard canvas renderer', e);
    }

    term.open(containerRef.current);
    fitAddon.fit();

    terminalInstanceRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    serializeAddonRef.current = serializeAddon;

    // Handle user input
    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    term.onBinary((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Resize observer
    let resizeTimer = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (fitAddonRef.current && terminalInstanceRef.current) {
          try {
            fitAddonRef.current.fit();
            const cols = terminalInstanceRef.current.cols;
            const rows = terminalInstanceRef.current.rows;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
          } catch (e) {}
        }
      }, 80);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    // Initial connect
    connectWebSocket(term, activeTabId);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
      term.dispose();
      terminalInstanceRef.current = null;
    };
  }, [activeTabId, connectWebSocket]);

  // Tab management
  const handleSelectTab = (tabId) => {
    setActiveTabId(tabId);
  };

  const handleNewTab = () => {
    const newId = 'session-' + Math.random().toString(36).substring(2, 9);
    const newName = `bash #${tabs.length + 1}`;
    const nextTabs = [...tabs, { id: newId, name: newName }];
    setTabs(nextTabs);
    setActiveTabId(newId);
  };

  const handleCloseTab = (tabId) => {
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[nextTabs.length - 1].id);
    }
  };

  // Action handlers
  const handleClear = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
      // Send clear sequence to terminal shell
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: '\x0C' }));
      }
    }
  };

  const handleDownloadLogs = () => {
    if (!serializeAddonRef.current) return;
    try {
      const output = serializeAddonRef.current.serialize();
      const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminal-${activeTabId}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (onShowToast) onShowToast('Terminal log exported successfully', 'success');
    } catch (e) {
      console.error('Failed to export log:', e);
      if (onShowToast) onShowToast('Failed to export log', 'error');
    }
  };

  const handleReconnect = () => {
    if (terminalInstanceRef.current) {
      connectWebSocket(terminalInstanceRef.current, activeTabId);
    }
  };

  const handleExecutePreset = (command, executeNow) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = executeNow ? `${command}\r` : command;
      wsRef.current.send(JSON.stringify({ type: 'input', data: payload }));
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.focus();
      }
    }
  };

  const handleSendInput = (data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }));
    }
  };

  const handleFocusTerminal = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
    }
  };

  // In-terminal search
  const handleSearchNext = (query, options) => {
    if (searchAddonRef.current && query) {
      searchAddonRef.current.findNext(query, {
        caseSensitive: options?.caseSensitive,
        decorations: {
          matchBackground: '#f59e0b',
          matchBorder: '#d97706',
          activeMatchBackground: '#10b981',
          activeMatchBorder: '#059669'
        }
      });
    }
  };

  const handleSearchPrev = (query, options) => {
    if (searchAddonRef.current && query) {
      searchAddonRef.current.findPrevious(query, {
        caseSensitive: options?.caseSensitive
      });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xl transition-colors">
      {/* Top Action Bar */}
      <TerminalActionBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onNewTab={handleNewTab}
        onCloseTab={handleCloseTab}
        connectionStatus={connectionStatus}
        onOpenPresets={() => setPresetsOpen(true)}
        onClearTerminal={handleClear}
        onDownloadLogs={handleDownloadLogs}
        onReconnect={handleReconnect}
        touchBarVisible={touchBarVisible}
        onToggleTouchBar={() => setTouchBarVisible((v) => !v)}
        searchVisible={searchVisible}
        onSearch={() => setSearchVisible((v) => !v)}
        onSearchNext={handleSearchNext}
        onSearchPrev={handleSearchPrev}
        onCloseSearch={() => setSearchVisible(false)}
      />

      {/* Terminal Viewport */}
      <div
        ref={containerRef}
        onClick={handleFocusTerminal}
        className="flex-1 w-full h-full p-2 bg-zinc-50 dark:bg-[#09090b] overflow-hidden transition-colors"
      />

      {/* Mobile Virtual Touch Bar */}
      {touchBarVisible && (
        <VirtualTouchBar
          onSendInput={handleSendInput}
          onFocusTerminal={handleFocusTerminal}
        />
      )}

      {/* Presets Modal */}
      <PresetsDropdown
        isOpen={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        onExecutePreset={handleExecutePreset}
        token={token}
      />
    </div>
  );
}
