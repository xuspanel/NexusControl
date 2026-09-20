const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = crypto;

const DEFAULT_BACKUP_DIR = '/opt/nexus_backups';
let backupDir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

let insertBackupStmt;
let selectAllBackupsStmt;
let selectBackupByFilenameStmt;
let deleteBackupStmt;
let selectBackupsByJobStmt;
let countBackupsByJobStmt;

function ensureBackupDir() {
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    }
    // Strict 0700 root-only permissions
    fs.chmodSync(backupDir, 0o700);
  } catch (err) {
    console.error(`[BackupEngine] Failed to ensure backup directory ${backupDir}:`, err.message);
  }
}

function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      type TEXT NOT NULL,
      job_id TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      paths TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
    CREATE INDEX IF NOT EXISTS idx_backups_job_id ON backups(job_id);
  `);

  insertBackupStmt = db.prepare(`
    INSERT INTO backups (id, filename, name, size_bytes, type, job_id, status, created_at, paths)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  selectAllBackupsStmt = db.prepare(`
    SELECT * FROM backups ORDER BY created_at DESC
  `);

  selectBackupByFilenameStmt = db.prepare(`
    SELECT * FROM backups WHERE filename = ?
  `);

  deleteBackupStmt = db.prepare(`
    DELETE FROM backups WHERE filename = ?
  `);

  selectBackupsByJobStmt = db.prepare(`
    SELECT * FROM backups WHERE job_id = ? ORDER BY created_at ASC
  `);

  countBackupsByJobStmt = db.prepare(`
    SELECT COUNT(*) as count FROM backups WHERE job_id = ?
  `);
}

// Initial bootstrap
ensureBackupDir();
initDb();

function setBackupDir(newDir) {
  backupDir = newDir;
  ensureBackupDir();
}

function getBackupDir() {
  return backupDir;
}

/**
 * Execute tar with Zstandard compression
 */
function runTarCreate(destPath, targetPaths) {
  return new Promise((resolve, reject) => {
    // Arguments: --zstd -cpf <destPath> <targetPaths...>
    const args = ['--zstd', '-cpf', destPath, ...targetPaths];
    const proc = spawn('tar', args);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn tar: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar --zstd creation failed with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

/**
 * Execute tar extraction with Zstandard
 */
function runTarExtract(archivePath, stagingDir) {
  return new Promise((resolve, reject) => {
    const args = ['--zstd', '-xpf', archivePath, '-C', stagingDir];
    const proc = spawn('tar', args);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn tar extract: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar --zstd extraction failed with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

/**
 * Create a snapshot using Zstandard compression
 */
async function createBackup(name, targetPaths, type = 'manual', jobId = null) {
  ensureBackupDir();

  if (!name || typeof name !== 'string') {
    throw new Error('Backup name is required.');
  }

  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    throw new Error('At least one valid target path must be specified.');
  }

  // Validate that all target paths exist
  for (const p of targetPaths) {
    if (!p || typeof p !== 'string' || !path.isAbsolute(p)) {
      throw new Error(`Target path '${p}' must be a non-empty absolute path.`);
    }
    if (!fs.existsSync(p)) {
      throw new Error(`Target path does not exist: ${p}`);
    }
  }

  const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'snapshot';
  const timestamp = Date.now();
  const filename = `nexus_backup_${safeName}_${timestamp}.tar.zst`;
  const archivePath = path.join(backupDir, filename);

  const backupId = randomUUID();

  try {
    await runTarCreate(archivePath, targetPaths);

    const stats = fs.statSync(archivePath);
    const sizeBytes = stats.size;

    insertBackupStmt.run(
      backupId,
      filename,
      name.trim(),
      sizeBytes,
      type,
      jobId || null,
      'completed',
      timestamp,
      JSON.stringify(targetPaths)
    );

    return {
      id: backupId,
      filename,
      name: name.trim(),
      sizeBytes,
      type,
      jobId,
      status: 'completed',
      createdAt: timestamp,
      paths: targetPaths
    };
  } catch (err) {
    // If archive was partially created, clean it up
    if (fs.existsSync(archivePath)) {
      try {
        fs.unlinkSync(archivePath);
      } catch {}
    }
    throw err;
  }
}

/**
 * Restore a backup archive into destinationPath with atomic staging
 */
async function restoreBackup(filename, destinationPath) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Valid filename is required.');
  }

  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith('.tar.zst')) {
    throw new Error('Invalid backup archive filename.');
  }

  const archivePath = path.join(backupDir, safeFilename);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Backup archive does not exist: ${safeFilename}`);
  }

  if (!destinationPath || typeof destinationPath !== 'string' || !path.isAbsolute(destinationPath)) {
    throw new Error('Valid absolute destination path is required.');
  }

  // Temporary staging directory
  const stagingId = `nexus_restore_stage_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const stagingDir = path.join('/tmp', stagingId);

  try {
    fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });

    // Step 1: Extract into staging
    await runTarExtract(archivePath, stagingDir);

    // Step 2: Ensure destination directory exists
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath, { recursive: true });
    }

    // Step 3: Atomic or recursive copy from staging to destination
    // Using cpSync recursive to copy contents of stagingDir into destinationPath
    fs.cpSync(stagingDir, destinationPath, { recursive: true, preserveTimestamps: true });

    return {
      success: true,
      filename: safeFilename,
      destinationPath,
      restoredAt: Date.now()
    };
  } finally {
    // Step 4: Always clean up staging directory
    if (fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`[BackupEngine] Failed to remove staging dir ${stagingDir}:`, cleanupErr.message);
      }
    }
  }
}

/**
 * Delete a backup archive and its DB record
 */
function deleteBackup(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Valid filename is required.');
  }

  const safeFilename = path.basename(filename);
  if (safeFilename !== filename) {
    throw new Error('Invalid filename for deletion.');
  }

  const archivePath = path.join(backupDir, safeFilename);
  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
  }

  deleteBackupStmt.run(safeFilename);

  return { success: true, filename: safeFilename };
}

/**
 * List all recorded backups
 */
function listBackups() {
  const rows = selectAllBackupsStmt.all();
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    name: row.name,
    sizeBytes: row.size_bytes,
    type: row.type,
    jobId: row.job_id,
    status: row.status,
    createdAt: row.created_at,
    paths: (() => {
      try {
        return JSON.parse(row.paths);
      } catch {
        return [row.paths];
      }
    })(),
    existsOnDisk: fs.existsSync(path.join(backupDir, row.filename))
  }));
}

/**
 * Get disk storage stats for backups
 */
function getStorageStats() {
  ensureBackupDir();
  const backups = listBackups();
  const totalSizeBytes = backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);

  let freeBytes = 0;
  try {
    const statvfs = fs.statfsSync(backupDir);
    freeBytes = statvfs.bavail * statvfs.bsize;
  } catch {
    freeBytes = 50 * 1024 * 1024 * 1024; // Fallback estimate
  }

  return {
    repository: backupDir,
    backupCount: backups.length,
    totalSizeBytes,
    freeSizeBytes: freeBytes
  };
}

/**
 * Safe resolve file path for streaming download
 */
function getArchiveFilePath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename required.');
  }
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith('.tar.zst')) {
    throw new Error('Invalid archive filename.');
  }
  const fullPath = path.join(backupDir, safeFilename);
  if (!fs.existsSync(fullPath)) {
    throw new Error('Archive not found on disk.');
  }
  return fullPath;
}

module.exports = {
  ensureBackupDir,
  initDb,
  setBackupDir,
  getBackupDir,
  createBackup,
  restoreBackup,
  deleteBackup,
  listBackups,
  getStorageStats,
  getArchiveFilePath,
  runTarCreate,
  runTarExtract
};
