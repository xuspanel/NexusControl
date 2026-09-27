const { Pool } = require('pg');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let pgPool = null;

/**
 * Checks if the psql binary is available on the system PATH
 */
function isPsqlInstalled() {
  try {
    execSync('command -v psql 2>/dev/null', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Securely bootstraps a dedicated NexusControl superuser with peer authentication,
 * writes the PG_SUPER_URI connection string to backend/.env, and initializes the connection pool.
 */
function initPostgresSuperuser() {
  try {
    // 1. Check if Postgres is installed on the host
    if (!isPsqlInstalled()) {
      console.log('[Postgres] psql not found on host PATH.');
      return false;
    }

    // 2. Check if we already have the URI in process.env or .env file
    let pgUri = process.env.PG_SUPER_URI;
    if (!pgUri) {
      console.log('[Postgres] Bootstrapping NexusControl Superuser...');
      const pwd = crypto.randomBytes(16).toString('hex');

      // Create superuser via OS peer authentication (handles existing role cleanly)
      try {
        execSync(
          `sudo -u postgres psql -c "DO \\$\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexuscontrol') THEN CREATE ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}'; ELSE ALTER ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}'; END IF; END \\$\\$;"`,
          { stdio: 'ignore', timeout: 5000 }
        );
      } catch (err) {
        // Fallback for direct role creation
        try {
          execSync(
            `sudo -u postgres psql -c "CREATE ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}';"`,
            { stdio: 'ignore', timeout: 5000 }
          );
        } catch (innerErr) {
          execSync(
            `sudo -u postgres psql -c "ALTER ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}';"`,
            { stdio: 'ignore', timeout: 5000 }
          );
        }
      }

      pgUri = `postgresql://nexuscontrol:${pwd}@127.0.0.1:5432/postgres`;

      // Persist to backend/.env
      const backendEnvPath = path.resolve(__dirname, '.env');
      if (fs.existsSync(backendEnvPath)) {
        fs.appendFileSync(backendEnvPath, `\nPG_SUPER_URI=${pgUri}\n`);
      }

      // Persist to root .env if it exists
      const rootEnvPath = path.resolve(__dirname, '../.env');
      if (fs.existsSync(rootEnvPath)) {
        fs.appendFileSync(rootEnvPath, `\nPG_SUPER_URI=${pgUri}\n`);
      }

      process.env.PG_SUPER_URI = pgUri;
      console.log('[Postgres] NexusControl Superuser bootstrapped successfully.');
    }

    // 3. Initialize the connection pool
    if (!pgPool) {
      pgPool = new Pool({
        connectionString: pgUri,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      // Handle unexpected idle client errors
      pgPool.on('error', (err) => {
        console.error('[Postgres] Unexpected error on idle client:', err.message);
      });
    }

    return true;
  } catch (error) {
    console.log('[Postgres] Not installed or inactive on host:', error.message);
    return false;
  }
}

/**
 * Returns the active connection pool, attempting initialization if necessary
 */
function getPool() {
  if (!pgPool) {
    initPostgresSuperuser();
  }
  return pgPool;
}

/**
 * Queries current PostgreSQL status and metadata
 */
async function getStatus() {
  const installed = isPsqlInstalled();
  if (!installed) {
    return {
      installed: false,
      active: false,
      message: 'PostgreSQL is not installed on this VPS.'
    };
  }

  const pool = getPool();
  if (!pool) {
    return {
      installed: true,
      active: false,
      message: 'PostgreSQL is installed but connection pool could not be initialized. Daemon may be stopped.'
    };
  }

  try {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT version(), 
               current_user,
               current_database() as database,
               inet_server_port() as port,
               (SELECT count(*) FROM pg_database WHERE datistemplate = false) as db_count
      `);
      const row = res.rows[0];
      return {
        installed: true,
        active: true,
        version: row.version,
        currentUser: row.current_user,
        database: row.database,
        port: row.port || 5432,
        dbCount: parseInt(row.db_count, 10),
        uriConfigured: Boolean(process.env.PG_SUPER_URI)
      };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      installed: true,
      active: false,
      error: err.message,
      message: 'PostgreSQL service is currently unreachable or inactive.'
    };
  }
}

/**
 * Lists all user databases, excluding templates, with size, owner, and encoding
 */
async function listDatabases() {
  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL engine is not active or initialized.');
  }

  const query = `
    SELECT d.datname as name, 
           pg_catalog.pg_get_userbyid(d.datdba) as owner,
           pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size,
           pg_database_size(d.datname) as size_bytes,
           pg_encoding_to_char(d.encoding) as charset
    FROM pg_catalog.pg_database d
    WHERE d.datistemplate = false
    ORDER BY d.datname ASC;
  `;

  const { rows } = await pool.query(query);
  return rows;
}

/**
 * Validates a PostgreSQL identifier (database name) to prevent SQL injection
 */
function validateIdentifier(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Database name is required.');
  }
  const cleanName = name.trim();
  // Standard Postgres identifier: 1-63 chars, letters, numbers, underscores
  const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
  if (!identifierRegex.test(cleanName)) {
    throw new Error(
      'Invalid database name. Database names must start with a letter or underscore and contain only alphanumeric characters and underscores (max 63 characters).'
    );
  }
  return cleanName;
}

/**
 * Creates a new PostgreSQL database
 */
async function createDatabase(name, owner = null) {
  const cleanName = validateIdentifier(name);
  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL engine is not active or initialized.');
  }

  let sql = `CREATE DATABASE "${cleanName}"`;
  if (owner) {
    const cleanOwner = validateIdentifier(owner);
    sql += ` OWNER "${cleanOwner}"`;
  }

  await pool.query(sql);
  return { name: cleanName };
}

/**
 * Safely drops a PostgreSQL database with force termination of open connections
 */
async function dropDatabase(name) {
  const cleanName = validateIdentifier(name);

  // Guard protected system databases
  const protectedDbs = ['postgres', 'template0', 'template1'];
  if (protectedDbs.includes(cleanName.toLowerCase())) {
    throw new Error(`Cannot drop protected system database "${cleanName}".`);
  }

  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL engine is not active or initialized.');
  }

  // First terminate any active connections to this database
  try {
    await pool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid();
    `, [cleanName]);
  } catch (termErr) {
    console.warn('[Postgres] Connection termination warning:', termErr.message);
  }

  // Attempt DROP DATABASE (FORCE supported in PG 13+)
  try {
    await pool.query(`DROP DATABASE "${cleanName}" WITH (FORCE);`);
  } catch (forceErr) {
    // Fallback standard drop
    await pool.query(`DROP DATABASE "${cleanName}";`);
  }

  return { name: cleanName, dropped: true };
}

/**
 * Cleanly closes the pool
 */
async function closePool() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

module.exports = {
  initPostgresSuperuser,
  getPool,
  getStatus,
  listDatabases,
  createDatabase,
  dropDatabase,
  closePool,
  isPsqlInstalled
};
