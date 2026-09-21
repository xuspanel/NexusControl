import {
  LayoutDashboard,
  FolderGit2,
  Terminal,
  Boxes,
  Globe,
  ShieldCheck,
  Archive,
  Users
} from 'lucide-react';

/**
 * Centralized Navigation Registry for NexusControl Adaptive Tri-Mode Navigation
 * With Granular Multi-User Role-Based Access Control (RBAC) Mapping
 */
export const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Real-time telemetry, hardware gauges, systemd units & processes',
    icon: 'LayoutDashboard',
    iconComponent: LayoutDashboard,
    shortcut: '1',
    primaryMobile: true,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'files',
    label: 'Files',
    description: 'Enterprise file manager, Monaco code editor, permissions & trash',
    icon: 'FolderGit2',
    iconComponent: FolderGit2,
    shortcut: '2',
    primaryMobile: true,
    roles: ['superadmin', 'operator']
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Persistent root bash pseudo-terminal sessions with xterm WebGL',
    icon: 'Terminal',
    iconComponent: Terminal,
    shortcut: '3',
    primaryMobile: true,
    roles: ['superadmin']
  },
  {
    id: 'docker',
    label: 'Docker',
    description: 'Container orchestration, live CPU/RAM stats, inspect & lifecycle',
    icon: 'Boxes',
    iconComponent: Boxes,
    shortcut: '4',
    primaryMobile: true,
    roles: ['superadmin', 'operator']
  },
  {
    id: 'vhosts',
    label: 'Domains & Proxy',
    description: 'Virtual hosts, reverse proxy, static sites & Let\'s Encrypt SSL',
    icon: 'Globe',
    iconComponent: Globe,
    shortcut: '5',
    primaryMobile: false,
    roles: ['superadmin', 'operator']
  },
  {
    id: 'audit',
    label: 'Audit Log',
    description: 'Tamper-evident SHA-256 cryptographic ledger & integrity verification',
    icon: 'ShieldCheck',
    iconComponent: ShieldCheck,
    shortcut: '6',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'backups',
    label: 'Backups',
    description: 'Zstandard system snapshots, scheduled cron jobs & atomic restore',
    icon: 'Archive',
    iconComponent: Archive,
    shortcut: '7',
    primaryMobile: false,
    roles: ['superadmin', 'operator']
  },
  {
    id: 'users',
    label: 'Users & Roles',
    description: 'Multi-user role-based access control, TOTP 2FA onboarding & team administration',
    icon: 'Users',
    iconComponent: Users,
    shortcut: '8',
    primaryMobile: false,
    roles: ['superadmin']
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

export function getNavItemsForRole(role) {
  const activeRole = role || 'viewer';
  return NAV_ITEMS.filter(item => !item.roles || item.roles.includes(activeRole));
}
