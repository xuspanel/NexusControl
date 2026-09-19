const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const { randomUUID } = crypto;

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

// Seed default presets if empty
const countStmt = db.prepare('SELECT COUNT(*) as count FROM terminal_presets');
const countResult = countStmt.get();

if (!countResult || countResult.count === 0) {
  const defaultPresets = [
    { title: 'Interactive Process Viewer (htop)', command: 'htop', category: 'System', description: 'Real-time interactive process viewer' },
    { title: 'Disk Filesystem Usage (df -h)', command: 'df -h', category: 'System', description: 'Human-readable disk space breakdown' },
    { title: 'Memory Breakdown (free -m)', command: 'free -m', category: 'System', description: 'Display RAM and swap metrics in MB' },
    { title: 'System Uptime & Load (uptime)', command: 'uptime', category: 'System', description: 'System running duration and load averages' },
    { title: 'Tail Syslog (tail -f /var/log/syslog)', command: 'tail -f /var/log/syslog', category: 'System', description: 'Follow the live system log output' },
    { title: 'Docker Containers (docker ps -a)', command: 'docker ps -a', category: 'Docker', description: 'List all running and stopped containers' },
    { title: 'Docker Live Stats (docker stats)', command: 'docker stats --no-stream', category: 'Docker', description: 'Snapshot container CPU and RAM usage' },
    { title: 'Listening Ports & Daemons (ss -tulpn)', command: 'ss -tulpn', category: 'Network', description: 'Display listening TCP/UDP sockets' },
    { title: 'Firewall Status (ufw status verbose)', command: 'ufw status verbose', category: 'Network', description: 'Check active UFW packet rules' },
    { title: 'Network Interfaces & IPs (ip a)', command: 'ip a', category: 'Network', description: 'Show all network interface addresses' }
  ];

  const insertDefault = db.prepare(`
    INSERT INTO terminal_presets (id, title, command, category, description, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);

  for (const p of defaultPresets) {
    insertDefault.run(uuidv4(), p.title, p.command, p.category, p.description || '', Date.now());
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
  deletePreset
};
