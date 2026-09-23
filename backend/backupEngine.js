const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const dbBackupAdapter = require('./dbBackupAdapter');
const s3Replication = require('./s3Replication');
const gdriveReplication = require('./gdriveReplication');
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

/**
 * Resolve or generate 32-byte AES-256-GCM encryption key
 */
function getOrCreateEncryptionKey() {
  if (process.env.BACKUP_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(process.env.BACKUP_ENCRYPTION_KEY).digest();
  }

  // Check .env in parent or current directory
  const envPaths = [
    path.join(__dirname, '../.env'),
    path.join(__dirname, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^BACKUP_ENCRYPTION_KEY=(.+)$/m);
        if (match && match[1].trim()) {
          const key = match[1].trim();
          process.env.BACKUP_ENCRYPTION_KEY = key;
          return crypto.createHash('sha256').update(key).digest();
        }
      } catch {}
    }
  }

  // Generate new key and append to root .env
  const generated = crypto.randomBytes(32).toString('hex');
  process.env.BACKUP_ENCRYPTION_KEY = generated;

  try {
    const rootEnvPath = path.join(__dirname, '../.env');
    if (fs.existsSync(rootEnvPath)) {
      fs.appendFileSync(rootEnvPath, `\nBACKUP_ENCRYPTION_KEY=${generated}\n`);
    }
  } catch (err) {
    console.warn('[BackupEngine] Could not persist BACKUP_ENCRYPTION_KEY to .env:', err.message);
  }

  return crypto.createHash('sha256').update(generated).digest();
}

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
 * Execute tar with Zstandard compression and stream through AES-256-GCM cipher
 * Appends 28-byte footer: [IV (12 bytes)] + [Auth Tag (16 bytes)]
 */
function runEncryptedTarCreate(destPath, targetPaths) {
  return new Promise((resolve, reject) => {
    const key = getOrCreateEncryptionKey();
    const iv = crypto.randomBytes(12); // NIST 12-byte IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    // tar --zstd -cpf - <targetPaths...>
    const tarArgs = ['--zstd', '-cpf', '-', ...targetPaths];
    const tarProc = spawn('tar', tarArgs);
    const fileOut = fs.createWriteStream(destPath);

    let stderr = '';
    tarProc.stderr.on('data', (d) => { stderr += d.toString(); });

    let settled = false;
    const handleError = (err) => {
      if (settled) return;
      settled = true;
      try { tarProc.kill(); } catch {}
      try { fileOut.destroy(); } catch {}
      reject(err);
    };

    tarProc.on('error', handleError);
    cipher.on('error', handleError);
    fileOut.on('error', handleError);

    // Pipe tar stdout -> cipher -> fileOut
    cipher.pipe(fileOut, { end: false });

    cipher.on('end', () => {
      // Append Auth Tag (16 bytes) and IV (12 bytes) as 28-byte footer
      const authTag = cipher.getAuthTag();
      const footer = Buffer.concat([iv, authTag]); // 12 + 16 = 28 bytes
      fileOut.end(footer, () => {
        // Output file closed
      });
    });

    tarProc.stdout.pipe(cipher);

    tarProc.on('close', (code) => {
      if (code !== 0 && !settled) {
        handleError(new Error(`tar command failed with code ${code}: ${stderr.trim()}`));
      }
    });

    fileOut.on('finish', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
  });
}

/**
 * Execute extraction with streaming AES-256-GCM decryption into tar -x
 */
function runEncryptedTarExtract(archivePath, stagingDir) {
  return new Promise((resolve, reject) => {
    // Read the last 28 bytes for IV and Auth Tag
    let stat;
    try {
      stat = fs.statSync(archivePath);
      if (stat.size < 28) {
        return reject(new Error('Archive size is smaller than cryptographic footer (corrupted).'));
      }
    } catch (err) {
      return reject(err);
    }

    const fd = fs.openSync(archivePath, 'r');
    const footerBuf = Buffer.alloc(28);
    fs.readSync(fd, footerBuf, 0, 28, stat.size - 28);
    fs.closeSync(fd);

    const iv = footerBuf.subarray(0, 12);
    const authTag = footerBuf.subarray(12, 28);

    const key = getOrCreateEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    // tar --zstd -xpf - -C <stagingDir>
    const tarArgs = ['--zstd', '-xpf', '-', '-C', stagingDir];
    const tarProc = spawn('tar', tarArgs);

    let stderr = '';
    tarProc.stderr.on('data', (d) => { stderr += d.toString(); });

    let settled = false;
    const handleError = (err) => {
      if (settled) return;
      settled = true;
      try { tarProc.kill(); } catch {}
      reject(err);
    };

    decipher.on('error', (err) => {
      handleError(new Error(`AES-256-GCM authentication failed: ${err.message}`));
    });

    tarProc.on('error', handleError);

    // Read ciphertext only (excluding 28-byte footer)
    const readStream = fs.createReadStream(archivePath, {
      start: 0,
      end: stat.size - 28 - 1
    });

    readStream.on('error', handleError);

    // Pipe readStream -> decipher -> tarProc.stdin
    readStream.pipe(decipher).pipe(tarProc.stdin);

    tarProc.on('close', (code) => {
      if (code === 0 && !settled) {
        settled = true;
        resolve();
      } else if (!settled) {
        handleError(new Error(`tar extraction failed with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

/**
 * Legacy unencrypted tar extract fallback
 */
function runLegacyTarExtract(archivePath, stagingDir) {
  return new Promise((resolve, reject) => {
    const args = ['--zstd', '-xpf', archivePath, '-C', stagingDir];
    const proc = spawn('tar', args);

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => { reject(new Error(`Failed to spawn tar extract: ${err.message}`)); });

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
 * Create an encrypted snapshot using Zstandard and AES-256-GCM
 * Automatically invokes database adapter to hot-dump MySQL/PostgreSQL
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
  const filename = `nexus_backup_${safeName}_${timestamp}.tar.zst.enc`;
  const archivePath = path.join(backupDir, filename);

  const backupId = randomUUID();

  // 1. Hot-dump detected databases (MySQL / MariaDB / PostgreSQL)
  let dbDumpResult = null;
  const finalTargetPaths = [...targetPaths];

  try {
    dbDumpResult = await dbBackupAdapter.performDatabaseDumps();
    if (dbDumpResult && dbDumpResult.dumpDir && dbDumpResult.dumped.length > 0) {
      finalTargetPaths.push(dbDumpResult.dumpDir);
    }

    // 2. Stream tar through AES-256-GCM into archive
    await runEncryptedTarCreate(archivePath, finalTargetPaths);

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

    const backupRecord = {
      id: backupId,
      filename,
      name: name.trim(),
      sizeBytes,
      type,
      jobId,
      status: 'completed',
      createdAt: timestamp,
      paths: targetPaths,
      isEncrypted: true,
      databasesIncluded: dbDumpResult?.dumped || []
    };

    // 3. Multi-Cloud Off-Site Replication Hooks (Asynchronous)
    s3Replication.uploadToS3(archivePath).catch((s3Err) => {
      // S3 error already logged to auditLogger in s3Replication
      console.warn(`[BackupEngine] S3 cloud replication note: ${s3Err.message}`);
      try {
        const alertEngine = require('./alertEngine');
        alertEngine.sendAlert('❌ S3 Backup Replication Failed', `Cloud replication to S3 failed for ${name}: ${s3Err.message}`, 'error', 'backup').catch(() => {});
      } catch {}
    });

    gdriveReplication.uploadToGoogleDrive(archivePath).catch((gdErr) => {
      // GDrive error already logged to auditLogger in gdriveReplication
      console.warn(`[BackupEngine] Google Drive replication note: ${gdErr.message}`);
      try {
        const alertEngine = require('./alertEngine');
        alertEngine.sendAlert('❌ Google Drive Replication Failed', `Cloud replication to Google Drive failed for ${name}: ${gdErr.message}`, 'error', 'backup').catch(() => {});
      } catch {}
    });

    return backupRecord;
  } catch (err) {
    try {
      const alertEngine = require('./alertEngine');
      alertEngine.sendAlert('❌ Backup Creation Failed', `Backup archive generation failed: ${err.message}`, 'error', 'backup').catch(() => {});
    } catch {}
    if (fs.existsSync(archivePath)) {
      try { fs.unlinkSync(archivePath); } catch {}
    }
    throw err;
  } finally {
    // 4. Always clean up temporary database dump files immediately
    if (dbDumpResult && dbDumpResult.dumpDir) {
      dbBackupAdapter.cleanupDatabaseDumps(dbDumpResult.dumpDir);
    }
  }
}

/**
 * Restore a backup archive into destinationPath with atomic staging & decryption
 */
async function restoreBackup(filename, destinationPath) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Valid filename is required.');
  }

  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename) {
    throw new Error('Invalid backup archive filename.');
  }

  if (!safeFilename.endsWith('.tar.zst.enc') && !safeFilename.endsWith('.tar.zst')) {
    throw new Error('Invalid backup archive filename extension.');
  }

  const archivePath = path.join(backupDir, safeFilename);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Backup archive does not exist: ${safeFilename}`);
  }

  if (!destinationPath || typeof destinationPath !== 'string' || !path.isAbsolute(destinationPath)) {
    throw new Error('Valid absolute destination path is required.');
  }

  // Temporary atomic staging directory
  const stagingId = `nexus_restore_stage_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const stagingDir = path.join('/tmp', stagingId);

  try {
    fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });

    // Step 1: Extract into staging (decrypted or legacy)
    if (safeFilename.endsWith('.tar.zst.enc')) {
      await runEncryptedTarExtract(archivePath, stagingDir);
    } else {
      await runLegacyTarExtract(archivePath, stagingDir);
    }

    // Step 2: Ensure destination directory exists
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath, { recursive: true });
    }

    // Step 3: Copy from staging to destination
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
    isEncrypted: row.filename.endsWith('.enc'),
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
  if (safeFilename !== filename) {
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
  getOrCreateEncryptionKey,
  createBackup,
  restoreBackup,
  deleteBackup,
  listBackups,
  getStorageStats,
  getArchiveFilePath,
  runEncryptedTarCreate,
  runEncryptedTarExtract,
  runLegacyTarExtract
};
