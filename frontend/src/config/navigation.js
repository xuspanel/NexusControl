import {
  LayoutDashboard,
  FolderGit2,
  Terminal,
  Boxes,
  Globe,
  ShieldCheck,
  Archive
} from 'lucide-react';

/**
 * Centralized Navigation Registry for NexusControl Adaptive Tri-Mode Navigation
 */
export const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Real-time telemetry, hardware gauges, systemd units & processes',
    icon: 'LayoutDashboard',
    iconComponent: LayoutDashboard,
    shortcut: '1',
    primaryMobile: true
  },
  {
    id: 'files',
    label: 'Files',
    description: 'Enterprise file manager, Monaco code editor, permissions & trash',
    icon: 'FolderGit2',
    iconComponent: FolderGit2,
    shortcut: '2',
    primaryMobile: true
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Persistent root bash pseudo-terminal sessions with xterm WebGL',
    icon: 'Terminal',
    iconComponent: Terminal,
    shortcut: '3',
    primaryMobile: true
  },
  {
    id: 'docker',
    label: 'Docker',
    description: 'Container orchestration, live CPU/RAM stats, inspect & lifecycle',
    icon: 'Boxes',
    iconComponent: Boxes,
    shortcut: '4',
    primaryMobile: true
  },
  {
    id: 'vhosts',
    label: 'Domains & Proxy',
    description: 'Virtual hosts, reverse proxy, static sites & Let\'s Encrypt SSL',
    icon: 'Globe',
    iconComponent: Globe,
    shortcut: '5',
    primaryMobile: false
  },
  {
    id: 'audit',
    label: 'Audit Log',
    description: 'Tamper-evident SHA-256 cryptographic ledger & integrity verification',
    icon: 'ShieldCheck',
    iconComponent: ShieldCheck,
    shortcut: '6',
    primaryMobile: false
  },
  {
    id: 'backups',
    label: 'Backups',
    description: 'Zstandard system snapshots, scheduled cron jobs & atomic restore',
    icon: 'Archive',
    iconComponent: Archive,
    shortcut: '7',
    primaryMobile: false
  }
];

export const NAV_SHORTCUTS = NAV_ITEMS.reduce((acc, item) => {
  acc[item.shortcut] = item.id;
  return acc;
}, {});

export function getNavItem(id) {
  // Support aliases: 'telemetry' -> 'overview', 'domains' -> 'vhosts'
  const normalized = id === 'telemetry' ? 'overview' : id === 'domains' ? 'vhosts' : id;
  return NAV_ITEMS.find(item => item.id === normalized) || NAV_ITEMS[0];
}
