const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { app } = require('../server');
const gdriveReplication = require('../gdriveReplication');
const auditLogger = require('../auditLogger');

describe('Native Google Drive OAuth2 Replication Engine', () => {
  const authHeader = { Authorization: 'Bearer test-token' };
  const testDir = path.join('/tmp', `gdrive_test_${Date.now()}`);
  const testArchive = path.join(testDir, 'test_backup.tar.zst.enc');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testArchive, 'dummy-encrypted-payload-for-gdrive-stream');
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  beforeEach(() => {
    gdriveReplication._clearTokenCache();
  });

  describe('Configuration Schema & Secret Masking', () => {
    test('Initializes with default empty or configured state', () => {
      const config = gdriveReplication.getGDriveConfig();
      expect(config).toHaveProperty('configured');
      expect(config).toHaveProperty('clientId');
      expect(config).toHaveProperty('clientSecret');
      expect(config).toHaveProperty('refreshToken');
      expect(config).toHaveProperty('folderId');
      expect(config).toHaveProperty('active');
    });

    test('Validates required fields when saving configuration', () => {
      expect(() => {
        gdriveReplication.saveGDriveConfig({ clientId: '' });
      }).toThrow('Google OAuth2 Client ID is required');

      expect(() => {
        gdriveReplication.saveGDriveConfig({ clientId: 'test-client-id', clientSecret: '' });
      }).toThrow('Google OAuth2 Client Secret is required');

      expect(() => {
        gdriveReplication.saveGDriveConfig({
          clientId: 'test-client-id',
          clientSecret: 'secret123',
          refreshToken: ''
        });
      }).toThrow('Google OAuth2 Refresh Token is required');
    });

    test('Saves configuration and returns masked secrets', () => {
      const saved = gdriveReplication.saveGDriveConfig({
        clientId: 'my-client-id.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-supersecretkey123',
        refreshToken: '1//04refreshtokenvalue999',
        folderId: 'folder_abc_123',
        active: true
      });

      expect(saved.configured).toBe(true);
      expect(saved.clientId).toBe('my-client-id.apps.googleusercontent.com');
      expect(saved.clientSecret).toMatch(/^••••••••/);
      expect(saved.refreshToken).toMatch(/^••••••••/);
      expect(saved.folderId).toBe('folder_abc_123');
      expect(saved.active).toBe(true);

      const raw = gdriveReplication.getRawGDriveConfig();
      expect(raw.client_secret).toBe('GOCSPX-supersecretkey123');
      expect(raw.refresh_token).toBe('1//04refreshtokenvalue999');
    });

    test('Preserves existing unmasked secrets when masked string is provided', () => {
      const updated = gdriveReplication.saveGDriveConfig({
        clientId: 'updated-client-id.apps.googleusercontent.com',
        clientSecret: '••••••••y123',
        refreshToken: '••••••••e999',
        folderId: 'folder_new_456',
        active: false
      });

      expect(updated.clientId).toBe('updated-client-id.apps.googleusercontent.com');
      expect(updated.folderId).toBe('folder_new_456');
      expect(updated.active).toBe(false);

      const raw = gdriveReplication.getRawGDriveConfig();
      expect(raw.client_secret).toBe('GOCSPX-supersecretkey123');
      expect(raw.refresh_token).toBe('1//04refreshtokenvalue999');
    });
  });

  describe('OAuth2 Token Refresh & Resumable Upload Flow (Mocked)', () => {
    const originalFetch = global.fetch;
    const originalHttpsRequest = https.request;

    afterEach(() => {
      global.fetch = originalFetch;
      https.request = originalHttpsRequest;
      gdriveReplication._clearTokenCache();
    });

    test('refreshAccessToken exchanges refresh token for access token', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token-xyz',
          expires_in: 3600,
          token_type: 'Bearer'
        })
      });

      const config = {
        client_id: 'test-client',
        client_secret: 'test-secret',
        refresh_token: 'test-refresh'
      };

      const token = await gdriveReplication.refreshAccessToken(config);
      expect(token).toBe('mock-access-token-xyz');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('refreshAccessToken throws on invalid OAuth2 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Bad Request'
        })
      });

      const config = {
        client_id: 'test-client',
        client_secret: 'test-secret',
        refresh_token: 'test-refresh'
      };

      await expect(gdriveReplication.refreshAccessToken(config)).rejects.toThrow('Google OAuth2 Error: invalid_grant - Bad Request');
    });

    test('initiateResumableUpload retrieves Location header from Google Drive', async () => {
      const mockLocation = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (header) => (header.toLowerCase() === 'location' ? mockLocation : null)
        }
      });

      const location = await gdriveReplication.initiateResumableUpload(
        'mock-token',
        'backup.tar.zst.enc',
        1024,
        'folder_123'
      );

      expect(location).toBe(mockLocation);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            'X-Upload-Content-Length': '1024'
          })
        })
      );
    });

    test('streamFileToUploadLocation streams payload via native https without buffering', async () => {
      // Mock https.request stream
      https.request = jest.fn((options, callback) => {
        const req = new EventEmitter();
        req.destroy = jest.fn();
        req.end = jest.fn();
        req.write = jest.fn();

        const res = new EventEmitter();
        res.statusCode = 200;

        process.nextTick(() => {
          callback(res);
          res.emit('data', JSON.stringify({ id: 'gdrive_file_98765', name: 'test_backup.tar.zst.enc' }));
          res.emit('end');
        });

        return req;
      });

      const stat = fs.statSync(testArchive);
      const result = await gdriveReplication.streamFileToUploadLocation(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc',
        testArchive,
        stat.size
      );

      expect(result).toHaveProperty('id', 'gdrive_file_98765');
      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Length': stat.size,
            'Content-Type': 'application/octet-stream'
          })
        }),
        expect.any(Function)
      );
    });

    test('uploadToGoogleDrive executes full flow and logs audit event', async () => {
      // Enable GDrive active
      gdriveReplication.saveGDriveConfig({
        clientId: 'client-active',
        clientSecret: 'secret-active',
        refreshToken: 'refresh-active',
        folderId: 'test-folder',
        active: true
      });

      // Mock fetch for token refresh & resumable init
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-abc', expires_in: 3600 })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header) => (header.toLowerCase() === 'location' ? 'https://www.googleapis.com/upload/session123' : null)
          }
        });

      // Mock https.request for stream upload
      https.request = jest.fn((options, callback) => {
        const req = new EventEmitter();
        req.destroy = jest.fn();
        req.end = jest.fn();
        req.write = jest.fn();

        const res = new EventEmitter();
        res.statusCode = 200;
        process.nextTick(() => {
          callback(res);
          res.emit('data', JSON.stringify({ id: 'file_uploaded_gdrive_123', name: path.basename(testArchive) }));
          res.emit('end');
        });
        return req;
      });

      const result = await gdriveReplication.uploadToGoogleDrive(testArchive);
      expect(result.uploaded).toBe(true);
      expect(result.driveFileId).toBe('file_uploaded_gdrive_123');

      // Verify audit log has BACKUP_GDRIVE_UPLOAD_SUCCESS and ledger is cryptographically valid
      const ledgerVerification = auditLogger.verifyAuditChain();
      expect(ledgerVerification.valid).toBe(true);

      const logs = auditLogger.getAuditLogs({ action: 'BACKUP_GDRIVE_UPLOAD_SUCCESS', limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      expect(logs.logs[0].target_resource).toBe(path.basename(testArchive));
    });

    test('uploadToGoogleDrive skips upload when active is 0', async () => {
      gdriveReplication.saveGDriveConfig({
        clientId: 'client-disabled',
        clientSecret: 'secret-disabled',
        refreshToken: 'refresh-disabled',
        folderId: 'test-folder',
        active: false
      });

      const result = await gdriveReplication.uploadToGoogleDrive(testArchive);
      expect(result.uploaded).toBe(false);
      expect(result.reason).toBe('gdrive_replication_disabled');
    });
  });

  describe('REST API Endpoints & Audit Logging', () => {
    test('GET /api/backups/gdrive returns current masked configuration', async () => {
      const res = await request(app)
        .get('/api/backups/gdrive')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config).toHaveProperty('configured');
      expect(res.body.config).toHaveProperty('clientId');
      expect(res.body.config).toHaveProperty('clientSecret');
    });

    test('POST /api/backups/gdrive saves configuration and writes audit log', async () => {
      const payload = {
        clientId: 'api-client.apps.googleusercontent.com',
        clientSecret: 'api-client-secret-999',
        refreshToken: 'api-refresh-token-888',
        folderId: 'folder_rest_api',
        active: true
      };

      const res = await request(app)
        .post('/api/backups/gdrive')
        .set(authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config.clientId).toBe(payload.clientId);
      expect(res.body.config.active).toBe(true);
      expect(res.body.config.clientSecret).toMatch(/^••••••••/);

      // Verify audit log
      const logs = auditLogger.getAuditLogs({ action: 'BACKUP_GDRIVE_CONFIG_UPDATE', limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      const parsedPayload = JSON.parse(logs.logs[0].payload);
      expect(parsedPayload.clientId).toBe(payload.clientId);
    });

    test('POST /api/backups/gdrive/test executes connectivity check', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn()
        // token refresh
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'test-access-token', expires_in: 3600 })
        })
        // folder check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'f123', name: 'MyBackupsFolder' })
        });

      try {
        const res = await request(app)
          .post('/api/backups/gdrive/test')
          .set(authHeader)
          .send({
            clientId: 'test-client',
            clientSecret: 'test-secret',
            refreshToken: 'test-refresh',
            folderId: 'f123'
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('MyBackupsFolder');
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('POST /api/backups/gdrive/test returns error when credentials fail', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'invalid_client', error_description: 'Unauthorized' })
      });

      try {
        const res = await request(app)
          .post('/api/backups/gdrive/test')
          .set(authHeader)
          .send({
            clientId: 'bad-client',
            clientSecret: 'bad-secret',
            refreshToken: 'bad-refresh'
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Google OAuth2 Error: invalid_client - Unauthorized');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
