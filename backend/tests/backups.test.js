const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const backupEngine = require('../backupEngine');
const scheduler = require('../scheduler');
const auditLogger = require('../auditLogger');

describe('Enterprise Automated Backup & Snapshot Engine Integration', () => {
  const authHeader = { Authorization: 'Bearer test-token' };
  const testBaseDir = path.join('/tmp', `nexus_backups_test_${Date.now()}`);
  const testRepoDir = path.join(testBaseDir, 'repo');
  const testSourceDir = path.join(testBaseDir, 'source');
  const testRestoreDir = path.join(testBaseDir, 'restored');

  beforeAll(() => {
    fs.mkdirSync(testRepoDir, { recursive: true });
    fs.mkdirSync(testSourceDir, { recursive: true });
    fs.mkdirSync(testRestoreDir, { recursive: true });

    // Seed test source files
    fs.writeFileSync(path.join(testSourceDir, 'config.json'), JSON.stringify({ name: 'NexusControl', env: 'test' }));
    fs.writeFileSync(path.join(testSourceDir, 'server.log'), 'Log entry: system initialized successfully.\n');

    backupEngine.setBackupDir(testRepoDir);
  });

  afterAll(() => {
    if (fs.existsSync(testBaseDir)) {
      try {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('Storage Architecture & Directory Hardening', () => {
    test('Ensures backup directory exists with strict 0700 permissions', () => {
      backupEngine.ensureBackupDir();
      const stat = fs.statSync(testRepoDir);
      // Mode on Unix: 0o700 is 16832 (directory + rwx------)
      const permissions = (stat.mode & 0o777).toString(8);
      expect(permissions).toBe('700');
    });

    test('getStorageStats calculates repository disk metrics', () => {
      const stats = backupEngine.getStorageStats();
      expect(stats).toHaveProperty('repository');
      expect(stats).toHaveProperty('backupCount');
      expect(stats).toHaveProperty('totalSizeBytes');
      expect(typeof stats.freeSizeBytes).toBe('number');
    });
  });

  describe('Zstandard Compression & Snapshot Execution Pipeline', () => {
    test('Rejects snapshot creation with nonexistent target paths', async () => {
      await expect(
        backupEngine.createBackup('invalid_backup', ['/nonexistent/directory/that/does/not/exist'])
      ).rejects.toThrow(/Target path does not exist/);
    });

    test('Creates native Zstandard (.tar.zst) archive and records DB row', async () => {
      const backup = await backupEngine.createBackup('system_test', [testSourceDir], 'manual');

      expect(backup).toBeDefined();
      expect(backup.filename).toMatch(/^nexus_backup_system_test_\d+\.tar\.zst$/);
      expect(backup.type).toBe('manual');
      expect(backup.status).toBe('completed');
      expect(backup.sizeBytes).toBeGreaterThan(0);

      const filePath = path.join(testRepoDir, backup.filename);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('listBackups returns created archives with metadata', () => {
      const list = backupEngine.listBackups();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('filename');
      expect(list[0]).toHaveProperty('sizeBytes');
      expect(list[0].existsOnDisk).toBe(true);
    });
  });

  describe('Atomic Staging Restoration Pipeline', () => {
    test('Rejects restoration attempts with path traversal or invalid filename', async () => {
      await expect(
        backupEngine.restoreBackup('../../etc/passwd', testRestoreDir)
      ).rejects.toThrow(/Invalid backup archive filename/);
    });

    test('Restores archive into destination via atomic staging', async () => {
      const backups = backupEngine.listBackups();
      const targetArchive = backups[0];

      const result = await backupEngine.restoreBackup(targetArchive.filename, testRestoreDir);
      expect(result.success).toBe(true);
      expect(result.destinationPath).toBe(testRestoreDir);

      // Verify files exist in testRestoreDir
      const restoredFiles = fs.readdirSync(testRestoreDir);
      expect(restoredFiles.length).toBeGreaterThan(0);

      // Verify temporary staging directory was cleaned up
      const tmpDirs = fs.readdirSync('/tmp');
      const orphanStaging = tmpDirs.filter(d => d.startsWith('nexus_restore_stage_'));
      expect(orphanStaging.length).toBe(0);
    });
  });

  describe('Scheduler & Retention Policy Enforcer', () => {
    let testJobId = null;

    test('Rejects job creation with invalid cron expressions', () => {
      expect(() => {
        scheduler.createJob('Bad Cron Job', 'not-a-cron-expression', [testSourceDir], 5);
      }).toThrow(/Invalid cron schedule expression/);
    });

    test('Registers scheduled backup job with target paths and retention limit', () => {
      const job = scheduler.createJob('Nightly Source Backup', '0 2 * * *', [testSourceDir], 2);
      expect(job.id).toBeDefined();
      expect(job.name).toBe('Nightly Source Backup');
      expect(job.retentionLimit).toBe(2);
      testJobId = job.id;

      const allJobs = scheduler.listJobs();
      expect(allJobs.some(j => j.id === testJobId)).toBe(true);
    });

    test('Enforces retention limit by pruning oldest archives when limit is exceeded', async () => {
      // Create 3 backups assigned to testJobId (retention limit is 2)
      const b1 = await backupEngine.createBackup('retention_test_1', [testSourceDir], 'auto', testJobId);
      // Small sleep so timestamp differs
      await new Promise(r => setTimeout(r, 20));
      const b2 = await backupEngine.createBackup('retention_test_2', [testSourceDir], 'auto', testJobId);
      await new Promise(r => setTimeout(r, 20));
      const b3 = await backupEngine.createBackup('retention_test_3', [testSourceDir], 'auto', testJobId);

      // Currently 3 backups exist for testJobId. Enforce retention limit of 2:
      const pruned = await scheduler.enforceRetentionPolicy(testJobId, 2);

      expect(pruned.length).toBe(1);
      expect(pruned[0]).toBe(b1.filename);

      // b1 file must be deleted from disk
      expect(fs.existsSync(path.join(testRepoDir, b1.filename))).toBe(false);

      // b2 and b3 must still exist
      expect(fs.existsSync(path.join(testRepoDir, b2.filename))).toBe(true);
      expect(fs.existsSync(path.join(testRepoDir, b3.filename))).toBe(true);
    });

    test('Toggles job active status and unregisters cron job on delete', () => {
      const toggled = scheduler.toggleJob(testJobId, false);
      expect(toggled.isActive).toBe(false);

      const deleted = scheduler.deleteJob(testJobId);
      expect(deleted.success).toBe(true);

      const allJobs = scheduler.listJobs();
      expect(allJobs.some(j => j.id === testJobId)).toBe(false);
    });
  });

  describe('REST API Endpoints & Cryptographic Audit Ledger', () => {
    let createdFilename = null;
    let apiJobId = null;

    test('GET /api/backups returns available archives and disk usage stats', async () => {
      const res = await request(app)
        .get('/api/backups')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('backups');
      expect(res.body).toHaveProperty('stats');
      expect(Array.isArray(res.body.backups)).toBe(true);
    });

    test('POST /api/backups/manual triggers immediate snapshot', async () => {
      const res = await request(app)
        .post('/api/backups/manual')
        .set(authHeader)
        .send({
          name: 'api_manual_snap',
          targetPaths: [testSourceDir]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.backup.name).toBe('api_manual_snap');
      createdFilename = res.body.backup.filename;
    });

    test('GET /api/backups/:filename/download streams binary archive', async () => {
      const res = await request(app)
        .get(`/api/backups/${encodeURIComponent(createdFilename)}/download`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    });

    test('POST /api/backups/:filename/restore restores archive', async () => {
      const apiRestoreDir = path.join(testBaseDir, 'api_restored');
      const res = await request(app)
        .post(`/api/backups/${encodeURIComponent(createdFilename)}/restore`)
        .set(authHeader)
        .send({ destinationPath: apiRestoreDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.existsSync(apiRestoreDir)).toBe(true);
    });

    test('POST /api/backups/jobs creates scheduled backup profile', async () => {
      const res = await request(app)
        .post('/api/backups/jobs')
        .set(authHeader)
        .send({
          name: 'Daily WebRoot',
          cronSchedule: '0 0 * * *',
          targetPaths: [testSourceDir],
          retentionLimit: 7
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.job.name).toBe('Daily WebRoot');
      apiJobId = res.body.job.id;
    });

    test('GET /api/backups/jobs lists scheduled jobs', async () => {
      const res = await request(app)
        .get('/api/backups/jobs')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.jobs)).toBe(true);
      expect(res.body.jobs.some(j => j.id === apiJobId)).toBe(true);
    });

    test('DELETE /api/backups/:filename deletes archive file and DB record', async () => {
      const res = await request(app)
        .delete(`/api/backups/${encodeURIComponent(createdFilename)}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.existsSync(path.join(testRepoDir, createdFilename))).toBe(false);
    });

    test('Cryptographic Audit Log: BACKUP mutations are chained in SHA-256 ledger', () => {
      const verification = auditLogger.verifyAuditChain();
      expect(verification.valid).toBe(true);

      const data = auditLogger.getAuditLogs({ limit: 50 });
      const backupActions = data.logs.filter(r => r.action.startsWith('BACKUP_'));
      expect(backupActions.length).toBeGreaterThan(0);

      const actionsLogged = backupActions.map(r => r.action);
      expect(actionsLogged).toContain('BACKUP_CREATE_MANUAL');
      expect(actionsLogged).toContain('BACKUP_RESTORE');
      expect(actionsLogged).toContain('BACKUP_DELETE');
    });
  });
});
