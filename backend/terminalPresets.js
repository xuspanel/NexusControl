const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const { randomUUID } = crypto;
const osAdapter = require('./osAdapter');

const dbPath = path.join(__dirname, 'metrics.db');
const db = new DatabaseSync(dbPath);

// Initialize table & default presets
db.exec(`
  CREATE TABLE IF NOT EXISTS terminal_presets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    command TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_presets_category ON terminal_presets(category);
`);

// Gracefully add description column if table already existed without it
try {
  db.exec('ALTER TABLE terminal_presets ADD COLUMN description TEXT;');
} catch (e) {
  // Column already exists
}

function getDefaultPresetsForOs(osFamily) {
  const commonSystemPresets = [
    { title: 'Interactive Process Viewer (htop)', command: 'htop', category: 'System', description: 'Real-time interactive process viewer' },
    { title: 'Disk Filesystem Usage (df -h)', command: 'df -h', category: 'System', description: 'Human-readable disk space breakdown' },
    { title: 'Memory Breakdown (free -m)', command: 'free -m', category: 'System', description: 'Display RAM and swap metrics in MB' },
    { title: 'System Uptime & Load (uptime)', command: 'uptime', category: 'System', description: 'System running duration and load averages' }
  ];

  const commonDockerNetworkPresets = [
    { title: 'Docker Containers (docker ps -a)', command: 'docker ps -a', category: 'Docker', description: 'List all running and stopped containers' },
    { title: 'Docker Live Stats (docker stats)', command: 'docker stats --no-stream', category: 'Docker', description: 'Snapshot container CPU and RAM usage' },
    { title: 'Listening Ports & Daemons (ss -tulpn)', command: 'ss -tulpn', category: 'Network', description: 'Display listening TCP/UDP sockets' },
    { title: 'Network Interfaces & IPs (ip a)', command: 'ip a', category: 'Network', description: 'Show all network interface addresses' }
  ];

  if (osFamily === 'rhel') {
    return [
      ...commonSystemPresets,
      { title: 'Tail System Log (tail -f /var/log/messages)', command: 'tail -f /var/log/messages', category: 'System', description: 'Follow the live system messages log' },
      { title: 'Check Package Updates (dnf check-update)', command: 'dnf check-update', category: 'Packages', description: 'Query available RPM package updates' },
      { title: 'Apply Package Updates (dnf update -y)', command: 'dnf update -y', category: 'Packages', description: 'Download and install available RPM package upgrades' },
      { title: 'Firewall Status (firewall-cmd --list-all)', command: 'firewall-cmd --state && firewall-cmd --list-all', category: 'Network', description: 'Check firewalld state and active zone rules' },
      ...commonDockerNetworkPresets
    ];
  }

  // Default to Debian / Ubuntu
  return [
    ...commonSystemPresets,
    { title: 'Tail Syslog (tail -f /var/log/syslog)', command: 'tail -f /var/log/syslog', category: 'System', description: 'Follow the live system log output' },
    { title: 'Check Package Updates (apt update)', command: 'apt update && apt list --upgradable', category: 'Packages', description: 'Refresh APT repository index and list upgradable packages' },
    { title: 'Apply Package Updates (apt upgrade -y)', command: 'apt upgrade -y', category: 'Packages', description: 'Download and install available DEB package upgrades' },
    { title: 'Firewall Status (ufw status verbose)', command: 'ufw status verbose', category: 'Network', description: 'Check active UFW packet rules' },
    ...commonDockerNetworkPresets
  ];
}

// Ensure default presets exist
const countStmt = db.prepare('SELECT COUNT(*) as count FROM terminal_presets');
const countResult = countStmt.get();

const insertDefault = db.prepare(`
  INSERT INTO terminal_presets (id, title, command, category, description, is_default, created_at)
  VALUES (?, ?, ?, ?, ?, 1, ?)
`);

if (!countResult || countResult.count === 0) {
  const presets = getDefaultPresetsForOs(osAdapter.OS_FAMILY);
  for (const p of presets) {
    insertDefault.run(randomUUID(), p.title, p.command, p.category, p.description || '', Date.now());
  }
} else {
  // Sync OS-specific package manager and firewall presets if missing
  const allExisting = db.prepare('SELECT command FROM terminal_presets').all();
  const existingCmds = new Set(allExisting.map(r => r.command));

  const osPresets = getDefaultPresetsForOs(osAdapter.OS_FAMILY);
  for (const p of osPresets) {
    if (!existingCmds.has(p.command)) {
      // Check if it's an OS-specific preset that should be added
      if (p.category === 'Packages' || p.command.includes('firewall-cmd') || p.command.includes('dnf') || p.command.includes('apt')) {
        insertDefault.run(randomUUID(), p.title, p.command, p.category, p.description || '', Date.now());
        existingCmds.add(p.command);
      }
    }
  }
}

const selectAllStmt = db.prepare('SELECT * FROM terminal_presets ORDER BY is_default DESC, category ASC, title ASC');
const insertStmt = db.prepare(`
  INSERT INTO terminal_presets (id, title, command, category, description, is_default, created_at)
  VALUES (?, ?, ?, ?, ?, 0, ?)
`);
const deleteStmt = db.prepare('DELETE FROM terminal_presets WHERE id = ?');
const getByIdStmt = db.prepare('SELECT * FROM terminal_presets WHERE id = ?');

function getAllPresets() {
  return selectAllStmt.all();
}

function addPreset({ title, command, category = 'Custom', description = '' }) {
  if (!title || !command) throw new Error('title and command are required.');
  const id = randomUUID();
  const createdAt = Date.now();
  insertStmt.run(id, title.trim(), command.trim(), (category || 'Custom').trim(), (description || '').trim(), createdAt);
  return getByIdStmt.get(id);
}

function deletePreset(id) {
  if (!id) throw new Error('id is required.');
  deleteStmt.run(id);
  return { success: true, id };
}

module.exports = {
  getAllPresets,
  addPreset,
  deletePreset,
  getDefaultPresetsForOs
};
