const path = require('node:path');
const crypto = require('node:crypto');
const cron = require('node-cron');
const { DatabaseSync } = require('node:sqlite');
const backupEngine = require('./backupEngine');
const auditLogger = require('./auditLogger');
const { randomUUID } = crypto;

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

// In-memory registry of active cron tasks: Map<jobId, ScheduledTask>
const scheduledTasks = new Map();

let insertJobStmt;
let selectAllJobsStmt;
let selectJobByIdStmt;
let updateJobLastRunStmt;
let updateJobActiveStmt;
let deleteJobStmt;
let selectJobBackupsOldestFirstStmt;

function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_schedule TEXT NOT NULL,
      target_paths TEXT NOT NULL,
      retention_limit INTEGER NOT NULL DEFAULT 7,
      created_at INTEGER NOT NULL,
      last_run INTEGER,
      next_run INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_active ON backup_jobs(is_active);
  `);

  insertJobStmt = db.prepare(`
    INSERT INTO backup_jobs (id, name, cron_schedule, target_paths, retention_limit, created_at, last_run, next_run, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  selectAllJobsStmt = db.prepare(`
    SELECT * FROM backup_jobs ORDER BY created_at DESC
  `);

  selectJobByIdStmt = db.prepare(`
    SELECT * FROM backup_jobs WHERE id = ?
  `);

  updateJobLastRunStmt = db.prepare(`
    UPDATE backup_jobs SET last_run = ? WHERE id = ?
  `);

  updateJobActiveStmt = db.prepare(`
    UPDATE backup_jobs SET is_active = ? WHERE id = ?
  `);

  deleteJobStmt = db.prepare(`
    DELETE FROM backup_jobs WHERE id = ?
  `);

  selectJobBackupsOldestFirstStmt = db.prepare(`
    SELECT * FROM backups WHERE job_id = ? ORDER BY created_at ASC
  `);
}

// Initialize tables
initDb();

/**
 * Enforce retention policy for a specific backup profile
 */
async function enforceRetentionPolicy(jobId, retentionLimit) {
  if (!jobId || !retentionLimit || retentionLimit < 1) return [];

  const existingBackups = selectJobBackupsOldestFirstStmt.all(jobId);
  if (existingBackups.length <= retentionLimit) {
    return [];
  }

  const overflowCount = existingBackups.length - retentionLimit;
  const toPrune = existingBackups.slice(0, overflowCount);
  const pruned = [];

  for (const b of toPrune) {
    try {
      backupEngine.deleteBackup(b.filename);
      pruned.push(b.filename);

      // Cryptographic Audit Ledger Hook
      auditLogger.logEvent({
        action: 'BACKUP_DELETE',
        user: 'system_scheduler',
        ip: '127.0.0.1',
        targetResource: b.filename,
        payload: {
          jobId,
          retentionLimit,
          reason: 'retention_policy_prune'
        }
      });
    } catch (err) {
      console.error(`[Scheduler] Failed to prune overflow backup ${b.filename}:`, err.message);
    }
  }

  return pruned;
}

/**
 * Execute a scheduled backup job
 */
async function executeJob(jobId) {
  const job = selectJobByIdStmt.get(jobId);
  if (!job) {
    console.warn(`[Scheduler] Job ${jobId} not found during scheduled trigger.`);
    return;
  }

  const targetPaths = (() => {
    try {
      return JSON.parse(job.target_paths);
    } catch {
      return [job.target_paths];
    }
  })();

  try {
    const backup = await backupEngine.createBackup(job.name, targetPaths, 'auto', jobId);

    updateJobLastRunStmt.run(Date.now(), jobId);

    // Cryptographic Audit Ledger Hook
    auditLogger.logEvent({
      action: 'BACKUP_CREATE_AUTO',
      user: 'system_scheduler',
      ip: '127.0.0.1',
      targetResource: backup.filename,
      payload: {
        jobId,
        name: job.name,
        sizeBytes: backup.sizeBytes,
        paths: targetPaths
      }
    });

    // Enforce retention policy after successful auto backup
    await enforceRetentionPolicy(jobId, job.retention_limit);

    return backup;
  } catch (err) {
    console.error(`[Scheduler] Error running automated backup for job ${job.name} (${jobId}):`, err.message);
    throw err;
  }
}

/**
 * Register a single job with node-cron in memory
 */
function registerCronJob(job) {
  // Stop existing running task if registered
  if (scheduledTasks.has(job.id)) {
    try {
      scheduledTasks.get(job.id).stop();
    } catch {}
    scheduledTasks.delete(job.id);
  }

  if (!job.is_active) {
    return;
  }

  if (!cron.validate(job.cron_schedule)) {
    console.warn(`[Scheduler] Invalid cron schedule '${job.cron_schedule}' for job ${job.name} (${job.id})`);
    return;
  }

  const task = cron.schedule(job.cron_schedule, async () => {
    try {
      await executeJob(job.id);
    } catch (err) {
      console.error(`[Scheduler] Cron execution failed for job ${job.id}:`, err);
    }
  });

  scheduledTasks.set(job.id, task);
}

/**
 * Initialize all registered active jobs from DB
 */
function initScheduler(databaseInstance) {
  if (databaseInstance) {
    initDb(databaseInstance);
  }

  // Clear existing in-memory tasks
  for (const [id, task] of scheduledTasks.entries()) {
    try {
      task.stop();
    } catch {}
  }
  scheduledTasks.clear();

  const jobs = selectAllJobsStmt.all();
  for (const job of jobs) {
    registerCronJob(job);
  }

  console.log(`[Scheduler] Initialized background backup scheduler with ${scheduledTasks.size} active cron jobs.`);
}

/**
 * Create a new scheduled backup profile
 */
function createJob(name, cronSchedule, targetPaths, retentionLimit = 7) {
  if (!name || typeof name !== 'string') {
    throw new Error('Job name is required.');
  }

  if (!cronSchedule || !cron.validate(cronSchedule)) {
    throw new Error(`Invalid cron schedule expression: '${cronSchedule}'`);
  }

  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    throw new Error('At least one valid target path is required.');
  }

  // Verify all target paths exist
  const fs = require('node:fs');
  for (const p of targetPaths) {
    if (!p || typeof p !== 'string' || !path.isAbsolute(p)) {
      throw new Error(`Target path '${p}' must be an absolute path.`);
    }
    if (!fs.existsSync(p)) {
      throw new Error(`Target path does not exist: ${p}`);
    }
  }

  const safeRetention = Math.max(1, Math.min(100, parseInt(retentionLimit, 10) || 7));
  const id = randomUUID();
  const now = Date.now();

  insertJobStmt.run(
    id,
    name.trim(),
    cronSchedule.trim(),
    JSON.stringify(targetPaths),
    safeRetention,
    now,
    null,
    null,
    1
  );

  const job = {
    id,
    name: name.trim(),
    cron_schedule: cronSchedule.trim(),
    target_paths: JSON.stringify(targetPaths),
    retention_limit: safeRetention,
    created_at: now,
    last_run: null,
    next_run: null,
    is_active: 1
  };

  registerCronJob(job);

  return {
    id,
    name: job.name,
    cronSchedule: job.cron_schedule,
    targetPaths,
    retentionLimit: safeRetention,
    createdAt: now,
    lastRun: null,
    isActive: true
  };
}

/**
 * Delete a scheduled job
 */
function deleteJob(jobId) {
  if (scheduledTasks.has(jobId)) {
    try {
      scheduledTasks.get(jobId).stop();
    } catch {}
    scheduledTasks.delete(jobId);
  }

  deleteJobStmt.run(jobId);
  return { success: true, id: jobId };
}

/**
 * Toggle active state of a job
 */
function toggleJob(jobId, isActive) {
  const numericActive = isActive ? 1 : 0;
  updateJobActiveStmt.run(numericActive, jobId);

  const job = selectJobByIdStmt.get(jobId);
  if (job) {
    registerCronJob(job);
  }

  return { success: true, id: jobId, isActive: !!numericActive };
}

/**
 * List all backup jobs
 */
function listJobs() {
  const rows = selectAllJobsStmt.all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cronSchedule: row.cron_schedule,
    targetPaths: (() => {
      try {
        return JSON.parse(row.target_paths);
      } catch {
        return [row.target_paths];
      }
    })(),
    retentionLimit: row.retention_limit,
    createdAt: row.created_at,
    lastRun: row.last_run,
    isActive: !!row.is_active
  }));
}

/**
 * Get count of active jobs in memory
 */
function getActiveTaskCount() {
  return scheduledTasks.size;
}

module.exports = {
  initDb,
  initScheduler,
  registerCronJob,
  createJob,
  deleteJob,
  toggleJob,
  listJobs,
  executeJob,
  enforceRetentionPolicy,
  getActiveTaskCount
};
