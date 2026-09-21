const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = crypto;

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

let selectHeadStmt;
let insertStmt;
let selectAllForVerifyStmt;
let countStmt;

/**
 * Deterministically serialize any JS value into canonical JSON with alphabetically sorted keys
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Calculate SHA-256 hash chaining event data with prev_hash
 */
function computeEventHash(prevHash, eventData) {
  const canonicalData = canonicalStringify({
    id: eventData.id,
    timestamp: Number(eventData.timestamp),
    action: String(eventData.action),
    user: String(eventData.user),
    ip: String(eventData.ip),
    user_agent: String(eventData.user_agent || ''),
    target_resource: String(eventData.target_resource || ''),
    payload: String(eventData.payload || '')
  });
  return crypto.createHash('sha256').update(prevHash + ':' + canonicalData).digest('hex');
}

function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      action TEXT NOT NULL,
      user TEXT NOT NULL,
      ip TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      target_resource TEXT,
      payload TEXT,
      prev_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_ip ON audit_logs(ip);
  `);
  selectHeadStmt = db.prepare('SELECT event_hash FROM audit_logs ORDER BY rowid DESC LIMIT 1');
  insertStmt = db.prepare(`
    INSERT INTO audit_logs (id, timestamp, action, user, ip, user_agent, target_resource, payload, prev_hash, event_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  selectAllForVerifyStmt = db.prepare('SELECT rowid, * FROM audit_logs ORDER BY rowid ASC');
  countStmt = db.prepare('SELECT COUNT(*) as total FROM audit_logs');
}

initDb();

/**
 * Append an immutable event to the tamper-evident audit log
 */
function logEvent({
  action,
  user = 'root',
  ip = '127.0.0.1',
  userAgent = 'system',
  targetResource = '',
  payload = ''
}) {
  try {
    const headRow = selectHeadStmt.get();
    const prevHash = headRow ? headRow.event_hash : '000000';
    const id = randomUUID();
    const timestamp = Date.now();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const targetStr = typeof targetResource === 'string' ? targetResource : JSON.stringify(targetResource);

    const resolvedUser = (typeof user === 'object' && user !== null) ? (user.username || 'unknown') : String(user || 'root');

    const eventData = {
      id,
      timestamp,
      action: String(action),
      user: resolvedUser,
      ip: String(ip),
      user_agent: String(userAgent),
      target_resource: targetStr,
      payload: payloadStr
    };

    const eventHash = computeEventHash(prevHash, eventData);

    insertStmt.run(
      id,
      timestamp,
      eventData.action,
      eventData.user,
      eventData.ip,
      eventData.user_agent,
      eventData.target_resource,
      eventData.payload,
      prevHash,
      eventHash
    );

    return {
      id,
      action: eventData.action,
      user: eventData.user,
      prevHash,
      eventHash,
      timestamp
    };
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Failed to record event:', err);
    return null;
  }
}

/**
 * Cryptographically verify the entire audit log chain from Genesis to Head
 */
function verifyAuditChain() {
  const rows = selectAllForVerifyStmt.all();
  if (!rows || rows.length === 0) {
    return {
      valid: true,
      count: 0,
      headHash: '000000',
      message: 'Audit log is empty (Genesis state).'
    };
  }

  let expectedPrevHash = '000000';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // 1. Validate hash chain link
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        brokenIndex: i,
        logId: row.id,
        action: row.action,
        timestamp: row.timestamp,
        reason: `Previous hash broken: expected '${expectedPrevHash}', but found '${row.prev_hash}'`,
        expectedHash: expectedPrevHash,
        actualHash: row.prev_hash
      };
    }

    // 2. Recompute current event hash from payload & metadata
    const recomputedHash = computeEventHash(row.prev_hash, {
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      user: row.user,
      ip: row.ip,
      user_agent: row.user_agent,
      target_resource: row.target_resource,
      payload: row.payload
    });

    if (row.event_hash !== recomputedHash) {
      return {
        valid: false,
        brokenIndex: i,
        logId: row.id,
        action: row.action,
        timestamp: row.timestamp,
        reason: `Data tampering detected: record content does not match cryptographic event hash.`,
        expectedHash: recomputedHash,
        actualHash: row.event_hash
      };
    }

    expectedPrevHash = row.event_hash;
  }

  return {
    valid: true,
    count: rows.length,
    headHash: expectedPrevHash,
    message: `Audit chain cryptographically verified: ${rows.length} block(s) intact.`
  };
}

/**
 * Query audit logs with filtering and pagination (newest first)
 */
function getAuditLogs({ limit = 50, offset = 0, action = null, ip = null, search = null }) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (action && action.trim()) {
    query += ' AND action = ?';
    params.push(action.trim());
  }

  if (ip && ip.trim()) {
    query += ' AND ip LIKE ?';
    params.push(`%${ip.trim()}%`);
  }

  if (search && search.trim()) {
    query += ' AND (action LIKE ? OR target_resource LIKE ? OR payload LIKE ? OR user LIKE ?)';
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  // Count total matching
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countRes = db.prepare(countQuery).get(...params);
  const total = countRes ? countRes.total : 0;

  query += ' ORDER BY rowid DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);

  return {
    logs: rows,
    total,
    limit: Number(limit),
    offset: Number(offset)
  };
}

module.exports = {
  get db() { return db; },
  initDb,
  logEvent,
  verifyAuditChain,
  getAuditLogs,
  computeEventHash,
  canonicalStringify
};
