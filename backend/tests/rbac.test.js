const request = require('supertest');
const { app } = require('../server');
const db = require('../db');
const auth = require('../auth');
const auditLogger = require('../auditLogger');

describe('Multi-User Role-Based Access Control (RBAC) Test Suite', () => {
  let superadminToken;
  let operatorToken;
  let viewerToken;

  beforeAll(async () => {
    // Generate signed JWTs for tests
    superadminToken = auth.generateToken({ id: 'admin-id', username: 'admin', role: 'superadmin' });
    operatorToken = auth.generateToken({ id: 'operator-id', username: 'devops_bob', role: 'operator' });
    viewerToken = auth.generateToken({ id: 'viewer-id', username: 'auditor_alice', role: 'viewer' });
  });

  describe('Database Seeding and User Repository', () => {
    test('Default superadmin is seeded on initialization', () => {
      const admin = db.getUserByUsername('admin');
      expect(admin).toBeDefined();
      expect(admin.role).toBe('superadmin');
    });

    test('Can create a new operator user in the database', () => {
      const user = db.createUser({ username: 'test_operator', password: 'TempPass123!', role: 'operator' });
      expect(user).toBeDefined();
      expect(user.username).toBe('test_operator');
      expect(user.role).toBe('operator');

      const fetched = db.getUserByUsername('test_operator');
      expect(fetched).toBeDefined();
      expect(fetched.role).toBe('operator');
    });
  });

  describe('Superadmin Route Access & User Management', () => {
    test('Superadmin can access GET /api/users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.some(u => u.username === 'admin')).toBe(true);
    });

    test('Superadmin can create a user via POST /api/users', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({
          username: 'new_operator',
          password: 'ComplexPassword123!',
          role: 'operator'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe('new_operator');
      expect(res.body.user.role).toBe('operator');
      expect(res.body.qrCodeDataUrl).toBeDefined();
    });

    test('Superadmin can access terminal presets check', async () => {
      const res = await request(app)
        .get('/api/terminal/presets')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.presets)).toBe(true);
    });
  });

  describe('Operator Role Boundary Enforcement', () => {
    test('Operator is strictly forbidden (HTTP 403) from accessing /api/users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Operator is strictly forbidden (HTTP 403) from terminal endpoints', async () => {
      const res = await request(app)
        .get('/api/terminal/presets')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Operator has access to Docker routes', async () => {
      const res = await request(app)
        .get('/api/docker/containers')
        .set('Authorization', `Bearer ${operatorToken}`);

      // 200 or 500 depending on docker daemon in test environment, but NOT 403
      expect(res.status).not.toBe(403);
    });

    test('Operator has access to Backup routes', async () => {
      const res = await request(app)
        .get('/api/backups')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Viewer Role Boundary Enforcement', () => {
    test('Viewer can access telemetry profile', async () => {
      const res = await request(app)
        .get('/api/system/profile')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    test('Viewer can access audit log verification', async () => {
      const res = await request(app)
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    test('Viewer is strictly forbidden (HTTP 403) from Docker routes', async () => {
      const res = await request(app)
        .get('/api/docker/containers')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Viewer is strictly forbidden (HTTP 403) from VHost routes', async () => {
      const res = await request(app)
        .get('/api/vhosts')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Viewer is strictly forbidden (HTTP 403) from Backup routes', async () => {
      const res = await request(app)
        .get('/api/backups')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Viewer is strictly forbidden (HTTP 403) from File Manager routes', async () => {
      const res = await request(app)
        .get('/api/files/list')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('Viewer is strictly forbidden (HTTP 403) from Terminal routes', async () => {
      const res = await request(app)
        .get('/api/terminal/presets')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });

  describe('Audit Trail Attribution', () => {
    test('Audit events record authenticated user identity', async () => {
      const testEvent = auditLogger.logEvent({ action: 'TEST_RBAC_EVENT', payload: { sample: 123 }, user: 'auditor_alice' });
      expect(testEvent.user).toBe('auditor_alice');
    });
  });
});
