import React, { useEffect, useState } from 'react';
import {
  Folder,
  HardDrive,
  Trash2,
  Server,
  Settings,
  FileText,
  Home,
  Database,
  Layers,
  ChevronRight,
  X
} from 'lucide-react';

export default function FileSidebar({
  currentPath,
  onNavigate,
  onOpenTrash,
  trashCount = 0,
  token,
  onClose
}) {
  const [mounts, setMounts] = useState([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/files/mounts', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMounts(data);
      })
      .catch((err) => console.error('Error fetching mounts:', err));
  }, [token]);

  const quickLinks = [
    { name: 'Root (/)', path: '/', icon: Server },
    { name: 'Root Home', path: '/root', icon: Home },
    { name: 'NexusControl', path: '/opt/NexusControl', icon: Layers },
    { name: 'Config (/etc)', path: '/etc', icon: Settings },
    { name: 'System Logs', path: '/var/log', icon: FileText },
    { name: 'Operations (/opt)', path: '/opt', icon: Database }
  ];

  const handleLinkClick = (path) => {
    onNavigate(path);
    if (onClose) onClose();
  };

  return (
    <aside className="w-64 sm:w-72 bg-zinc-50 dark:bg-zinc-950/80 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col h-full flex-shrink-0 select-none">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Folder className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Filesystem
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4 text-xs">
        {/* Quick Access */}
        <div>
          <div className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Quick Access
          </div>
          <div className="mt-1 space-y-0.5">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              const isActive = currentPath === link.path;
              return (
                <button
                  key={link.path}
                  onClick={() => handleLinkClick(link.path)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-2 min-h-[44px] rounded-lg transition-colors text-left active:bg-zinc-200 dark:active:bg-zinc-800 ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                    <span className="truncate">{link.name}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Storage Mounts */}
        <div>
          <div className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Storage Mounts</span>
            <HardDrive className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div className="mt-1 space-y-1.5">
            {mounts.map((m) => {
              const isActive = currentPath === m.mountPoint;
              const pct = m.usedPercent || 0;
              const isHigh = pct > 85;
              return (
                <button
                  key={m.mountPoint}
                  onClick={() => handleLinkClick(m.mountPoint)}
                  className={`w-full flex flex-col p-2.5 rounded-lg transition-colors text-left border active:bg-zinc-200 dark:active:bg-zinc-800/80 min-h-[44px] ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-semibold truncate text-zinc-900 dark:text-zinc-100">{m.mountPoint}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{pct}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isHigh ? 'bg-red-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-[10px] text-zinc-500 font-mono flex justify-between">
                    <span>{m.available} free</span>
                    <span>{m.total}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trash Bin Footer */}
      <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800/80">
        <button
          onClick={() => {
            onOpenTrash();
            if (onClose) onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 active:bg-red-500/20 transition-colors text-xs"
        >
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-4 h-4 text-zinc-400 group-hover:text-red-500" />
            <span className="font-medium">Trash Bin</span>
          </div>
          {trashCount > 0 && (
            <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono px-2 py-0.5 rounded-full border border-red-500/30">
              {trashCount}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
