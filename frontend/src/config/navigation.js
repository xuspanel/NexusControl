import {
  LayoutDashboard,
  FolderGit2,
  Terminal,
  Boxes,
  Globe,
  ShieldCheck,
  Archive,
  Users,
  Shield,
  Bell,
  Sparkles,
  Wand2,
  Database,
  Zap,
  Clock,
  Layers,
  ShieldAlert
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
  },
  {
    id: 'network',
    label: 'Zero Trust VPN',
    description: 'WireGuard encrypted mesh tunnel, peer provisioning & QR mobile onboarding',
    icon: 'Shield',
    iconComponent: Shield,
    shortcut: '9',
    primaryMobile: false,
    roles: ['superadmin']
  },
  {
    id: 'alerts',
    label: 'Notifications & Alerts',
    description: 'Real-time Webhook alerting to Telegram & Discord for health & security events',
    icon: 'Bell',
    iconComponent: Bell,
    shortcut: '0',
    primaryMobile: false,
    roles: ['superadmin']
  },
  {
    id: 'updates',
    label: 'System Updates',
    description: 'Live version tracking, upstream changelog & safe update procedure',
    icon: 'Sparkles',
    iconComponent: Sparkles,
    shortcut: 'u',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'wizard',
    label: 'Optimization Wizard',
    description: 'Heuristic tool audit, dormant daemon detector & deep purge cleaner',
    icon: 'Wand2',
    iconComponent: Wand2,
    shortcut: 'w',
    primaryMobile: false,
    roles: ['superadmin']
  },
  {
    id: 'database',
    label: 'PostgreSQL',
    description: 'Postgres clusters, database catalog supervisor & Superuser pool',
    icon: 'Database',
    iconComponent: Database,
    shortcut: 'd',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'redis',
    label: 'Redis Cache',
    description: 'In-memory key-value cache, keyspace inspector, TTL & raw CLI',
    icon: 'Zap',
    iconComponent: Zap,
    shortcut: 'r',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'cron',
    label: 'Cron & Tasks',
    description: 'Crontab supervisor, systemd timers, visual scheduler & execution logs',
    icon: 'Clock',
    iconComponent: Clock,
    shortcut: 'c',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'process',
    label: 'App Manager',
    description: 'PaaS application runner, systemd supervisor, automated restarts & live logs',
    icon: 'Layers',
    iconComponent: Layers,
    shortcut: 'p',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  },
  {
    id: 'security',
    label: 'Firewall & Shield',
    description: 'Host firewall (UFW/Firewalld), port rules & Fail2ban intrusion defense',
    icon: 'ShieldAlert',
    iconComponent: ShieldAlert,
    shortcut: 'f',
    primaryMobile: false,
    roles: ['superadmin', 'operator', 'viewer']
  }
];

export const NAV_SHORTCUTS = NAV_ITEMS.reduce((acc, item) => {
  acc[item.shortcut] = item.id;
  return acc;
}, {});

export function getNavItem(id) {
  // Support aliases: 'telemetry' -> 'overview', 'domains' -> 'vhosts', 'vpn' -> 'network', 'wireguard' -> 'network', 'settings' -> 'updates', 'optimizer' -> 'wizard', 'postgres' -> 'database', 'cache' -> 'redis', 'tasks' -> 'cron', 'crontab' -> 'cron', 'apps' -> 'process', 'applications' -> 'process', 'paas' -> 'process', 'firewall' -> 'security', 'fail2ban' -> 'security', 'intrusion' -> 'security'
  const normalized = id === 'telemetry' ? 'overview' : id === 'domains' ? 'vhosts' : (id === 'vpn' || id === 'wireguard') ? 'network' : id === 'settings' ? 'updates' : id === 'optimizer' ? 'wizard' : id === 'postgres' ? 'database' : id === 'cache' ? 'redis' : (id === 'tasks' || id === 'crontab') ? 'cron' : (id === 'apps' || id === 'applications' || id === 'paas') ? 'process' : (id === 'firewall' || id === 'fail2ban' || id === 'intrusion') ? 'security' : id;
  return NAV_ITEMS.find(item => item.id === normalized) || NAV_ITEMS[0];
}

export function getNavItemsForRole(role, granularPolicies = null) {
  const activeRole = role || 'viewer';
  if (activeRole === 'superadmin') {
    return NAV_ITEMS;
  }
  if (activeRole === 'custom') {
    const modules = granularPolicies?.modules || {};
    return NAV_ITEMS.filter(item => Boolean(modules[item.id]));
  }
  return NAV_ITEMS.filter(item => !item.roles || item.roles.includes(activeRole));
}

