const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, 'metrics.db');
const db = new DatabaseSync(dbPath);

// Initialize table & indexes
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS telemetry (
    timestamp INTEGER PRIMARY KEY,
    cpu REAL,
    mem REAL,
    disk REAL,
    net_rx REAL,
    net_tx REAL,
    disk_read REAL,
    disk_write REAL,
    ping REAL
  );
  CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);
`);

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO telemetry (timestamp, cpu, mem, disk, net_rx, net_tx, disk_read, disk_write, ping)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const pruneStmt = db.prepare(`
  DELETE FROM telemetry WHERE timestamp < ?
`);

function recordTelemetry(data) {
  try {
    const ts = data.timestamp || Date.now();
    const cpu = data.cpu?.usage || 0;
    const mem = data.memory?.usedPct || 0;
    const disk = data.disk?.usedPct || 0;
    const netRx = data.network?.rxRateBytesSec || 0;
    const netTx = data.network?.txRateBytesSec || 0;
    const diskRead = data.disk?.readBytesSec || 0;
    const diskWrite = data.disk?.writeBytesSec || 0;
    const ping = data.network?.pingLatencyMs || 0;

    insertStmt.run(ts, cpu, mem, disk, netRx, netTx, diskRead, diskWrite, ping);
  } catch (err) {
    console.error('Failed to record telemetry history:', err.message);
  }
}

// Prune older than 30 days
function pruneOldRecords() {
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    pruneStmt.run(thirtyDaysAgo);
  } catch (err) {
    console.error('Failed to prune telemetry records:', err.message);
  }
}

// Run prune once an hour
setInterval(pruneOldRecords, 3600000).unref();

function getHistory(range = '1h') {
  const now = Date.now();
  let timeWindow = 3600000; // 1 hour
  let bucketSize = 30000;   // 30 seconds

  switch (range) {
    case '6h':
      timeWindow = 6 * 3600000;
      bucketSize = 180000; // 3 minutes
      break;
    case '24h':
      timeWindow = 24 * 3600000;
      bucketSize = 900000; // 15 minutes
      break;
    case '7d':
      timeWindow = 7 * 24 * 3600000;
      bucketSize = 3600000; // 1 hour
      break;
    case '1h':
    default:
      timeWindow = 3600000;
      bucketSize = 30000; // 30 seconds
      break;
  }

  const startTime = now - timeWindow;

  try {
    const query = `
      SELECT 
        (CAST(timestamp / ${bucketSize} AS INTEGER) * ${bucketSize}) as bucket_time,
        ROUND(AVG(cpu), 1) as cpu,
        ROUND(AVG(mem), 1) as mem,
        ROUND(AVG(disk), 1) as disk,
        ROUND(AVG(net_rx), 0) as net_rx,
        ROUND(AVG(net_tx), 0) as net_tx,
        ROUND(AVG(disk_read), 0) as disk_read,
        ROUND(AVG(disk_write), 0) as disk_write,
        ROUND(AVG(ping), 1) as ping
      FROM telemetry
      WHERE timestamp >= ?
      GROUP BY bucket_time
      ORDER BY bucket_time ASC
    `;

    const stmt = db.prepare(query);
    const rows = stmt.all(startTime);
    return rows.map(r => ({
      timestamp: r.bucket_time,
      cpu: r.cpu,
      mem: r.mem,
      disk: r.disk,
      netRx: r.net_rx,
      netTx: r.net_tx,
      diskRead: r.disk_read,
      diskWrite: r.disk_write,
      ping: r.ping
    }));
  } catch (err) {
    console.error('History query error:', err.message);
    return [];
  }
}

module.exports = {
  recordTelemetry,
  getHistory
};
