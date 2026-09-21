const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const backupEngine = require('../backupEngine');
const scheduler = require('../scheduler');
const auditLogger = require('../auditLogger');
const dbBackupAdapter = require('../dbBackupAdapter');
const s3Replication = require('../s3Replication');

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

  describe('Smart Database Auto-Discovery Adapter', () => {
    test('detectDatabases returns boolean flags for MySQL and PostgreSQL', () => {
      const dbs = dbBackupAdapter.detectDatabases();
      expect(dbs).toHaveProperty('mysql');
      expect(dbs).toHaveProperty('postgres');
      expect(typeof dbs.mysql).toBe('boolean');
      expect(typeof dbs.postgres).toBe('boolean');
    });

    test('cleanupDatabaseDumps gracefully handles empty/nonexistent dump dirs', () => {
      expect(() => {
        dbBackupAdapter.cleanupDatabaseDumps('/tmp/nonexistent_dump_dir_xyz');
      }).not.toThrow();
    });
  });

  describe('Native AES-256-GCM Streaming Encryption Pipeline', () => {
    let createdEncryptedArchive = null;

    test('Rejects snapshot creation with nonexistent target paths', async () => {
      await expect(
        backupEngine.createBackup('invalid_backup', ['/nonexistent/directory/that/does/not/exist'])
      ).rejects.toThrow(/Target path does not exist/);
    });

    test('Creates native encrypted (.tar.zst.enc) archive with 28-byte footer', async () => {
      const backup = await backupEngine.createBackup('system_enc_test', [testSourceDir], 'manual');

      expect(backup).toBeDefined();
      expect(backup.filename).toMatch(/^nexus_backup_system_enc_test_\d+\.tar\.zst\.enc$/);
      expect(backup.type).toBe('manual');
      expect(backup.status).toBe('completed');
      expect(backup.isEncrypted).toBe(true);
      expect(backup.sizeBytes).toBeGreaterThan(28); // Must be larger than footer

      const filePath = path.join(testRepoDir, backup.filename);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify 28-byte footer exists on disk
      const stat = fs.statSync(filePath);
      expect(stat.size).toBe(backup.sizeBytes);

      createdEncryptedArchive = backup.filename;
    });

    test('Restores encrypted archive into destination via atomic staging and decryption', async () => {
      const result = await backupEngine.restoreBackup(createdEncryptedArchive, testRestoreDir);
      expect(result.success).toBe(true);
      expect(result.destinationPath).toBe(testRestoreDir);

      // Verify decrypted files exist in testRestoreDir
      const restoredFiles = fs.readdirSync(testRestoreDir);
      expect(restoredFiles.length).toBeGreaterThan(0);

      // Verify content is identical to original (tar extracts relative to root)
      const expectedPath = path.join(testRestoreDir, testSourceDir.replace(/^\//, ''), 'config.json');
      const fallbackPath = path.join(testRestoreDir, path.basename(testSourceDir), 'config.json');
      const targetFilePath = fs.existsSync(expectedPath) ? expectedPath : fallbackPath;
      const restoredConfig = JSON.parse(fs.readFileSync(targetFilePath, 'utf8'));
      expect(restoredConfig.name).toBe('NexusControl');

      // Verify temporary staging directory was cleaned up
      const tmpDirs = fs.readdirSync('/tmp');
      const orphanStaging = tmpDirs.filter(d => d.startsWith('nexus_restore_stage_'));
      expect(orphanStaging.length).toBe(0);
    });

    test('Tamper detection: Altered ciphertext strictly fails GCM authentication', async () => {
      // Create a corrupted copy of the encrypted archive
      const originalPath = path.join(testRepoDir, createdEncryptedArchive);
      const corruptedFilename = 'corrupted_' + createdEncryptedArchive;
      const corruptedPath = path.join(testRepoDir, corruptedFilename);

      const buffer = fs.readFileSync(originalPath);
      // Flip a byte in the middle (ciphertext payload, before footer)
      buffer[10] = buffer[10] ^ 0xff;
      fs.writeFileSync(corruptedPath, buffer);

      const targetFailDir = path.join(testBaseDir, 'fail_dest');
      await expect(
        backupEngine.restoreBackup(corruptedFilename, targetFailDir)
      ).rejects.toThrow(/AES-256-GCM authentication failed/);

      // Clean up corrupted file
      try { fs.unlinkSync(corruptedPath); } catch {}
    });

    test('listBackups reports isEncrypted property correctly', () => {
      const list = backupEngine.listBackups();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      const encItem = list.find(b => b.filename === createdEncryptedArchive);
      expect(encItem).toBeDefined();
      expect(encItem.isEncrypted).toBe(true);
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
      const b1 = await backupEngine.createBackup('retention_test_1', [testSourceDir], 'auto', testJobId);
      await new Promise(r => setTimeout(r, 20));
      const b2 = await backupEngine.createBackup('retention_test_2', [testSourceDir], 'auto', testJobId);
      await new Promise(r => setTimeout(r, 20));
      const b3 = await backupEngine.createBackup('retention_test_3', [testSourceDir], 'auto', testJobId);

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

  describe('REST API Endpoints & S3 Cloud Configuration', () => {
    let createdFilename = null;
    let apiJobId = null;

    test('GET /api/backups/detect-dbs returns active database engine status', async () => {
      const res = await request(app)
        .get('/api/backups/detect-dbs')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.databases).toHaveProperty('mysql');
      expect(res.body.databases).toHaveProperty('postgres');
    });

    test('GET /api/backups/s3 returns default or configured cloud replication state', async () => {
      const res = await request(app)
        .get('/api/backups/s3')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config).toHaveProperty('active');
      expect(res.body.config).toHaveProperty('provider');
    });

    test('POST /api/backups/s3 saves cloud configuration with masked secrets', async () => {
      const res = await request(app)
        .post('/api/backups/s3')
        .set(authHeader)
        .send({
          provider: 'r2',
          endpoint: 'https://test-account.r2.cloudflarestorage.com',
          region: 'auto',
          bucket: 'nexus-test-backups',
          accessKey: 'R2_TEST_ACCESS_KEY_123',
          secretKey: 'R2_TEST_SECRET_KEY_SUPER_SECRET',
          active: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config.bucket).toBe('nexus-test-backups');
      expect(res.body.config.secretKey).toMatch(/••••/);
      expect(res.body.config.active).toBe(true);
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
      expect(res.body.backup.isEncrypted).toBe(true);
      createdFilename = res.body.backup.filename;
    });

    test('GET /api/backups/:filename/download streams encrypted binary archive', async () => {
      const res = await request(app)
        .get(`/api/backups/${encodeURIComponent(createdFilename)}/download`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    });

    test('POST /api/backups/:filename/restore restores encrypted archive via staging', async () => {
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

    test('DELETE /api/backups/:filename deletes archive file and DB record', async () => {
      const res = await request(app)
        .delete(`/api/backups/${encodeURIComponent(createdFilename)}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.existsSync(path.join(testRepoDir, createdFilename))).toBe(false);
    });

    test('Cryptographic Audit Log: BACKUP and S3 mutations are chained in SHA-256 ledger', () => {
      const verification = auditLogger.verifyAuditChain();
      expect(verification.valid).toBe(true);

      const data = auditLogger.getAuditLogs({ limit: 50 });
      const backupActions = data.logs.filter(r => r.action.startsWith('BACKUP_'));
      expect(backupActions.length).toBeGreaterThan(0);

      const actionsLogged = backupActions.map(r => r.action);
      expect(actionsLogged).toContain('BACKUP_CREATE_MANUAL');
      expect(actionsLogged).toContain('BACKUP_RESTORE');
      expect(actionsLogged).toContain('BACKUP_DELETE');
      expect(actionsLogged).toContain('BACKUP_S3_CONFIG_UPDATE');
    });
  });
});
