const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcrypt');

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

let selectUserByUsernameStmt;
let selectUserByIdStmt;
let selectAllUsersStmt;
let insertUserStmt;
let updateUserRoleStmt;
let updateUserPasswordStmt;
let updateUserLastLoginStmt;
let deleteUserStmt;
let countUsersStmt;
let countSuperadminsStmt;
let updateUserPoliciesStmt;

const VALID_ROLES = ['superadmin', 'operator', 'viewer', 'custom'];

function formatPolicies(policies) {
  if (!policies) return null;
  if (typeof policies === 'string') {
    try {
      JSON.parse(policies);
      return policies;
    } catch {
      return null;
    }
  }
  return JSON.stringify(policies);
}

function parsePolicies(policiesStr) {
  if (!policiesStr) return null;
  if (typeof policiesStr === 'object') return policiesStr;
  try {
    return JSON.parse(policiesStr);
  } catch {
    return null;
  }
}

function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      totp_secret TEXT,
      granular_policies TEXT,
      created_at INTEGER NOT NULL,
      last_login INTEGER
    );
  `);

  try {
    db.exec(`ALTER TABLE users ADD COLUMN granular_policies TEXT;`);
  } catch {}

  const smtpColumns = [
    'ALTER TABLE alerts_config ADD COLUMN smtp_host TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_port INTEGER DEFAULT 587;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_user TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_pass TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_from TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN alert_email_address TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN email_enabled INTEGER DEFAULT 0;'
  ];
  for (const sql of smtpColumns) {
    try { db.exec(sql); } catch {}
  }

  selectUserByUsernameStmt = db.prepare(`
    SELECT * FROM users WHERE username = ? COLLATE NOCASE
  `);

  selectUserByIdStmt = db.prepare(`
    SELECT * FROM users WHERE id = ?
  `);

  selectAllUsersStmt = db.prepare(`
    SELECT id, username, role, 
           CASE WHEN totp_secret IS NOT NULL AND length(totp_secret) > 0 THEN 1 ELSE 0 END as totp_enabled,
           granular_policies,
           created_at, last_login 
    FROM users 
    ORDER BY created_at ASC
  `);

  insertUserStmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, totp_secret, granular_policies, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  updateUserRoleStmt = db.prepare(`
    UPDATE users SET role = ?, granular_policies = ? WHERE id = ?
  `);

  updateUserPoliciesStmt = db.prepare(`
    UPDATE users SET granular_policies = ? WHERE id = ?
  `);

  updateUserPasswordStmt = db.prepare(`
    UPDATE users SET password_hash = ? WHERE id = ?
  `);

  updateUserLastLoginStmt = db.prepare(`
    UPDATE users SET last_login = ? WHERE id = ?
  `);

  deleteUserStmt = db.prepare(`
    DELETE FROM users WHERE id = ?
  `);

  countUsersStmt = db.prepare(`
    SELECT COUNT(*) as count FROM users
  `);

  countSuperadminsStmt = db.prepare(`
    SELECT COUNT(*) as count FROM users WHERE role = 'superadmin'
  `);

  seedInitialAdmin();
}

/**
 * Check if the users table is empty.
 * If empty, seed initial superadmin from legacy ADMIN_PASSWORD and TOTP_SECRET.
 */
function seedInitialAdmin() {
  try {
    const res = countUsersStmt.get();
    if (!res || res.count === 0) {
      const legacyPassword = process.env.ADMIN_PASSWORD || 'nexus2026!';
      const legacyTotpSecret = process.env.ADMIN_TOTP_SECRET || process.env.TOTP_SECRET || null;
      const saltRounds = 10;
      const passwordHash = bcrypt.hashSync(legacyPassword, saltRounds);
      const adminId = crypto.randomUUID();
      const now = Date.now();

      insertUserStmt.run(
        adminId,
        'admin',
        passwordHash,
        'superadmin',
        legacyTotpSecret,
        null,
        now,
        null
      );
      console.log('[RBAC SEED] Seeded initial superadmin user (admin) from legacy environment credentials.');
    }
  } catch (err) {
    console.error('[RBAC SEED ERROR] Failed to seed initial superadmin:', err.message);
  }
}

initDb();

function getUserByUsername(username) {
  if (!username) return null;
  const row = selectUserByUsernameStmt.get(username.trim());
  if (!row) return null;
  return {
    ...row,
    granular_policies: parsePolicies(row.granular_policies)
  };
}

function getUserById(id) {
  if (!id) return null;
  const row = selectUserByIdStmt.get(id);
  if (!row) return null;
  return {
    ...row,
    granular_policies: parsePolicies(row.granular_policies)
  };
}

function getAllUsers() {
  const rows = selectAllUsersStmt.all();
  return rows.map(r => ({
    ...r,
    granular_policies: parsePolicies(r.granular_policies)
  }));
}

function countUsers() {
  const res = countUsersStmt.get();
  return res ? res.count : 0;
}

function createUser({ username, password, role = 'operator', totpSecret = null, granular_policies = null }) {
  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new Error('Username is required.');
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 32) {
    throw new Error('Username must be between 3 and 32 characters.');
  }

  if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
    throw new Error('Username can only contain alphanumeric characters, underscores, hyphens, and dots.');
  }

  if (getUserByUsername(cleanUsername)) {
    throw new Error(`Username '${cleanUsername}' already exists.`);
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(', ')}.`);
  }

  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const formattedPolicies = formatPolicies(granular_policies);

  insertUserStmt.run(
    id,
    cleanUsername,
    passwordHash,
    role,
    totpSecret || null,
    formattedPolicies,
    now,
    null
  );

  return {
    id,
    username: cleanUsername,
    role,
    granular_policies: parsePolicies(formattedPolicies),
    totp_enabled: Boolean(totpSecret),
    created_at: now,
    last_login: null
  };
}

function updateUserRole(id, newRole, granularPolicies = undefined) {
  if (!VALID_ROLES.includes(newRole)) {
    throw new Error(`Invalid role '${newRole}'. Must be one of: ${VALID_ROLES.join(', ')}.`);
  }

  const user = getUserById(id);
  if (!user) {
    throw new Error('User not found.');
  }

  if (user.role === 'superadmin' && newRole !== 'superadmin') {
    const superadminCount = countSuperadminsStmt.get()?.count || 0;
    if (superadminCount <= 1) {
      throw new Error('Cannot demote the last remaining superadmin.');
    }
  }

  let formattedPolicies;
  if (granularPolicies !== undefined) {
    formattedPolicies = formatPolicies(granularPolicies);
  } else if (newRole !== 'custom') {
    formattedPolicies = null;
  } else {
    formattedPolicies = formatPolicies(user.granular_policies);
  }

  updateUserRoleStmt.run(newRole, formattedPolicies, id);
  return {
    ...user,
    role: newRole,
    granular_policies: parsePolicies(formattedPolicies)
  };
}

function updateUserPolicies(id, granularPolicies) {
  const user = getUserById(id);
  if (!user) {
    throw new Error('User not found.');
  }

  const formatted = formatPolicies(granularPolicies);
  updateUserPoliciesStmt.run(formatted, id);
  return {
    ...user,
    granular_policies: parsePolicies(formatted)
  };
}

function updateUserPassword(id, newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateUserPasswordStmt.run(passwordHash, id);
  return true;
}

function updateUserLastLogin(id) {
  if (!id) return;
  try {
    updateUserLastLoginStmt.run(Date.now(), id);
  } catch {}
}

function deleteUser(id, requestingUserId = null) {
  const user = getUserById(id);
  if (!user) {
    throw new Error('User not found.');
  }

  if (requestingUserId && user.id === requestingUserId) {
    throw new Error('You cannot delete your own account.');
  }

  if (user.role === 'superadmin') {
    const superadminCount = countSuperadminsStmt.get()?.count || 0;
    if (superadminCount <= 1) {
      throw new Error('Cannot delete the last remaining superadmin.');
    }
  }

  deleteUserStmt.run(id);
  return { success: true, id, username: user.username };
}

module.exports = {
  get db() { return db; },
  initDb,
  VALID_ROLES,
  getUserByUsername,
  getUserById,
  getAllUsers,
  countUsers,
  createUser,
  updateUserRole,
  updateUserPolicies,
  updateUserPassword,
  updateUserLastLogin,
  deleteUser,
  seedInitialAdmin,
  parsePolicies,
  formatPolicies
};

