const fs = require('node:fs');
const path = require('node:path');
const { execSync, exec } = require('node:child_process');

const DEFAULT_DUMP_DIR = '/tmp/nexus_db_dumps';

/**
 * Check if a systemd unit is currently active
 */
function isSystemdServiceActive(serviceName) {
  try {
    const status = execSync(`systemctl is-active ${serviceName} 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 2000
    }).trim();
    return status === 'active';
  } catch {
    return false;
  }
}

/**
 * Detect running database engines via native Unix domain sockets & systemd
 */
function detectDatabases() {
  // 1. MySQL / MariaDB Detection
  const mysqlSockets = [
    '/var/run/mysqld/mysqld.sock',
    '/run/mysqld/mysqld.sock',
    '/tmp/mysql.sock'
  ];
  const mysqlSocketFound = mysqlSockets.some((s) => {
    try {
      return fs.existsSync(s);
    } catch {
      return false;
    }
  });
  const mysqlServiceActive =
    isSystemdServiceActive('mysql') ||
    isSystemdServiceActive('mysqld') ||
    isSystemdServiceActive('mariadb');
  const isMysqlActive = mysqlSocketFound || mysqlServiceActive;

  // 2. PostgreSQL Detection
  const pgSockets = [
    '/var/run/postgresql/.s.PGSQL.5432',
    '/run/postgresql/.s.PGSQL.5432',
    '/tmp/.s.PGSQL.5432'
  ];
  let pgSocketFound = pgSockets.some((s) => {
    try {
      return fs.existsSync(s);
    } catch {
      return false;
    }
  });

  // Also check if any socket in /var/run/postgresql exists
  if (!pgSocketFound && fs.existsSync('/var/run/postgresql')) {
    try {
      const files = fs.readdirSync('/var/run/postgresql');
      pgSocketFound = files.some((f) => f.startsWith('.s.PGSQL.'));
    } catch {}
  }

  const pgServiceActive = isSystemdServiceActive('postgresql');
  const isPostgresActive = pgSocketFound || pgServiceActive;

  return {
    mysql: isMysqlActive,
    postgres: isPostgresActive
  };
}

/**
 * Execute command asynchronously returning a promise
 */
function execPromise(cmd, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Dump detected active databases into targetDir
 */
async function performDatabaseDumps(dumpDir = DEFAULT_DUMP_DIR) {
  const dbs = detectDatabases();
  if (!dbs.mysql && !dbs.postgres) {
    return { dumped: [], dumpDir: null };
  }

  try {
    if (!fs.existsSync(dumpDir)) {
      fs.mkdirSync(dumpDir, { recursive: true, mode: 0o700 });
    }
    fs.chmodSync(dumpDir, 0o700);
  } catch (err) {
    console.error('[DBAdapter] Failed to initialize dump directory:', err.message);
    return { dumped: [], dumpDir: null };
  }

  const dumped = [];

  // MySQL Dump
  if (dbs.mysql) {
    const mysqlDumpFile = path.join(dumpDir, 'mysql_dump.sql');
    try {
      await execPromise(`mysqldump --all-databases --routines --events > "${mysqlDumpFile}"`);
      dumped.push('mysql');
    } catch (err) {
      console.warn('[DBAdapter] Warning: MySQL dump attempt failed (may require configured client auth):', err.message);
      // Clean up failed partial file if exists
      if (fs.existsSync(mysqlDumpFile)) {
        try { fs.unlinkSync(mysqlDumpFile); } catch {}
      }
    }
  }

  // PostgreSQL Dump
  if (dbs.postgres) {
    const pgDumpFile = path.join(dumpDir, 'postgres_dump.sql');
    try {
      // Try sudo -u postgres pg_dumpall first, fallback to pg_dumpall
      try {
        await execPromise(`sudo -u postgres pg_dumpall > "${pgDumpFile}"`);
      } catch {
        await execPromise(`pg_dumpall > "${pgDumpFile}"`);
      }
      dumped.push('postgres');
    } catch (err) {
      console.warn('[DBAdapter] Warning: PostgreSQL dump attempt failed:', err.message);
      if (fs.existsSync(pgDumpFile)) {
        try { fs.unlinkSync(pgDumpFile); } catch {}
      }
    }
  }

  return {
    dumped,
    dumpDir: dumped.length > 0 ? dumpDir : null
  };
}

/**
 * Remove temporary database dumps
 */
function cleanupDatabaseDumps(dumpDir = DEFAULT_DUMP_DIR) {
  if (!dumpDir || !fs.existsSync(dumpDir)) return;
  try {
    fs.rmSync(dumpDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[DBAdapter] Failed to clean up ${dumpDir}:`, err.message);
  }
}

module.exports = {
  detectDatabases,
  performDatabaseDumps,
  cleanupDatabaseDumps,
  DEFAULT_DUMP_DIR
};
