const express = require('express');
const path = require('node:path');
const backupEngine = require('./backupEngine');
const scheduler = require('./scheduler');
const auditLogger = require('./auditLogger');
const dbBackupAdapter = require('./dbBackupAdapter');
const s3Replication = require('./s3Replication');

const router = express.Router();

/**
 * GET /api/backups
 * List all backup archives and storage statistics
 */
router.get('/', (req, res) => {
  try {
    const backups = backupEngine.listBackups();
    const stats = backupEngine.getStorageStats();
    res.json({ backups, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/backups/manual
 * Trigger an immediate manual snapshot
 */
router.post('/manual', async (req, res) => {
  const { name, targetPaths } = req.body || {};

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Backup name is required.' });
  }

  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return res.status(400).json({ error: 'At least one target path is required.' });
  }

  try {
    const backup = await backupEngine.createBackup(name, targetPaths, 'manual');

    // Cryptographic Audit Ledger Hook
    auditLogger.logEvent({
      action: 'BACKUP_CREATE_MANUAL',
      user: 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: backup.filename,
      payload: {
        id: backup.id,
        name: backup.name,
        sizeBytes: backup.sizeBytes,
        paths: backup.paths
      }
    });

    res.status(201).json({ success: true, backup });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/backups/:filename/restore
 * Extract archive into destinationPath with atomic staging
 */
router.post('/:filename/restore', async (req, res) => {
  const { filename } = req.params;
  const { destinationPath } = req.body || {};

  if (!destinationPath || typeof destinationPath !== 'string') {
    return res.status(400).json({ error: 'Valid destinationPath is required.' });
  }

  try {
    const result = await backupEngine.restoreBackup(filename, destinationPath);

    // Cryptographic Audit Ledger Hook
    auditLogger.logEvent({
      action: 'BACKUP_RESTORE',
      user: 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: filename,
      payload: {
        destinationPath,
        restoredAt: result.restoredAt
      }
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/backups/:filename/download
 * Binary stream download of the .tar.zst archive
 */
router.get('/:filename/download', (req, res) => {
  const { filename } = req.params;

  try {
    const filePath = backupEngine.getArchiveFilePath(filename);
    res.download(filePath, filename, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to download backup archive.' });
      }
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * DELETE /api/backups/:filename
 * Delete a backup archive and purge its DB record
 */
router.delete('/:filename', (req, res) => {
  const { filename } = req.params;

  try {
    const result = backupEngine.deleteBackup(filename);

    // Cryptographic Audit Ledger Hook
    auditLogger.logEvent({
      action: 'BACKUP_DELETE',
      user: 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: filename,
      payload: { filename, reason: 'manual_user_deletion' }
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/backups/jobs
 * List all scheduled backup profiles
 */
router.get('/jobs', (req, res) => {
  try {
    const jobs = scheduler.listJobs();
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/backups/jobs
 * Register a new scheduled cron backup job
 */
router.post('/jobs', (req, res) => {
  const { name, cronSchedule, targetPaths, retentionLimit } = req.body || {};

  try {
    const job = scheduler.createJob(name, cronSchedule, targetPaths, retentionLimit);

    auditLogger.logEvent({
      action: 'BACKUP_JOB_CREATE',
      user: 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: job.id,
      payload: {
        name: job.name,
        cronSchedule: job.cronSchedule,
        targetPaths: job.targetPaths,
        retentionLimit: job.retentionLimit
      }
    });

    res.status(201).json({ success: true, job });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/backups/jobs/:id
 * Delete a scheduled backup job
 */
router.delete('/jobs/:id', (req, res) => {
  const { id } = req.params;

  try {
    scheduler.deleteJob(id);

    auditLogger.logEvent({
      action: 'BACKUP_JOB_DELETE',
      user: 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: id,
      payload: { id }
    });

    res.json({ success: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/backups/jobs/:id/toggle
 * Pause or resume a backup job
 */
router.post('/jobs/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body || {};

  try {
    const result = scheduler.toggleJob(id, !!isActive);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/backups/jobs/:id/run
 * Trigger immediate execution of a scheduled job
 */
router.post('/jobs/:id/run', async (req, res) => {
  const { id } = req.params;

  try {
    const backup = await scheduler.executeJob(id);
    res.json({ success: true, backup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/backups/detect-dbs
 * Check running MySQL/MariaDB and PostgreSQL instances
 */
router.get('/detect-dbs', (req, res) => {
  try {
    const databases = dbBackupAdapter.detectDatabases();
    res.json({ success: true, databases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/backups/s3
 * Retrieve current off-site S3 cloud configuration
 */
router.get('/s3', (req, res) => {
  try {
    const config = s3Replication.getS3Config();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/backups/s3
 * Save / update off-site S3 cloud configuration
 */
router.post('/s3', (req, res) => {
  const { provider, endpoint, region, bucket, accessKey, secretKey, active } = req.body || {};

  try {
    const config = s3Replication.saveS3Config({
      provider,
      endpoint,
      region,
      bucket,
      accessKey,
      secretKey,
      active
    });

    auditLogger.logEvent({
      action: 'BACKUP_S3_CONFIG_UPDATE',
      user: 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: bucket,
      payload: {
        provider,
        region,
        bucket,
        active: Boolean(active)
      }
    });

    res.json({ success: true, config });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/backups/s3/test
 * Test credentials and bucket connectivity
 */
router.post('/s3/test', async (req, res) => {
  const customConfig = req.body && req.body.bucket ? req.body : null;

  try {
    const result = await s3Replication.testS3Connection(customConfig);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
