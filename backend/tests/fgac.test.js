const request = require('supertest');
const { app } = require('../server');
const db = require('../db');
const auth = require('../auth');
const auditLogger = require('../auditLogger');

describe('Fine-Grained Access Control (FGAC) Policy Engine & Jailing Test Suite', () => {
  let superadminToken;
  let customUser;
  let customToken;
  let customUserNoDocker;
  let customNoDockerToken;

  beforeAll(async () => {
    // 1. Create a custom user with restricted module and jailed directories/containers
    const policy = {
      modules: {
        overview: true,
        files: true,
        docker: true,
        terminal: false,
        vhosts: false,
        backups: false,
        audit: false
      },
      resources: {
        allowed_directories: ['/var/www/html', '/opt/nexus-demo-data'],
        allowed_containers: ['nexus-demo-service']
      }
    };

    customUser = db.createUser({
      username: 'jailed_dev',
      password: 'StrongPassword123!',
      role: 'custom',
      granular_policies: policy
    });

    customToken = auth.generateToken(customUser);

    // 2. Create another custom user with docker: false
    customUserNoDocker = db.createUser({
      username: 'web_only_dev',
      password: 'StrongPassword123!',
      role: 'custom',
      granular_policies: {
        modules: { overview: true, files: true, docker: false, terminal: false },
        resources: { allowed_directories: ['/var/www/html'], allowed_containers: [] }
      }
    });

    customNoDockerToken = auth.generateToken(customUserNoDocker);

    // 3. Superadmin token
    superadminToken = auth.generateToken({ id: 'admin-id', username: 'admin', role: 'superadmin' });
  });

  describe('Database Schema & Policy Storage', () => {
    test('Stores and parses granular policies correctly in SQLite', () => {
      const fetched = db.getUserByUsername('jailed_dev');
      expect(fetched).toBeDefined();
      expect(fetched.role).toBe('custom');
      expect(fetched.granular_policies).toBeDefined();
      expect(fetched.granular_policies.modules.files).toBe(true);
      expect(fetched.granular_policies.modules.docker).toBe(true);
      expect(fetched.granular_policies.resources.allowed_directories).toContain('/var/www/html');
      expect(fetched.granular_policies.resources.allowed_containers).toContain('nexus-demo-service');
    });

    test('JWT token carries granular_policies payload', () => {
      const decoded = auth.verifyToken(customToken);
      expect(decoded.role).toBe('custom');
      expect(decoded.granular_policies).toBeDefined();
      expect(decoded.granular_policies.modules.files).toBe(true);
    });
  });

  describe('Module-Level Access Control Enforcement', () => {
    test('Custom user is denied access (HTTP 403) to disabled module (Terminal)', async () => {
      const res = await request(app)
        .get('/api/terminal/presets')
        .set('Authorization', `Bearer ${customToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Access to module 'terminal' denied by policy");
    });

    test('Custom user is denied access (HTTP 403) to disabled module (Docker) for web_only_dev', async () => {
      const res = await request(app)
        .get('/api/docker/containers')
        .set('Authorization', `Bearer ${customNoDockerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Access to module 'docker' denied by policy");
    });

    test('SuperAdmin bypasses all module restrictions (God Mode)', async () => {
      const res = await request(app)
        .get('/api/terminal/presets')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('File System Directory Jail & Traversal Defense', () => {
    test('Allowed directory access proceeds without 403 jail violation', async () => {
      const res = await request(app)
        .get('/api/files/list')
        .query({ path: '/var/www/html' })
        .set('Authorization', `Bearer ${customToken}`);

      // Should succeed or return 500 if directory does not exist on test runner, but NOT 403
      expect(res.status).not.toBe(403);
    });

    test('Accessing directory outside policy (/etc/) returns HTTP 403 and logs SECURITY_VIOLATION', async () => {
      const res = await request(app)
        .get('/api/files/list')
        .query({ path: '/etc' })
        .set('Authorization', `Bearer ${customToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Path outside allowed directory policy');

      // Verify audit trail logged SECURITY_VIOLATION
      const auditRes = await request(app)
        .get('/api/audit/logs?limit=5')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(auditRes.status).toBe(200);
      const violations = auditRes.body.logs.filter(l => l.action === 'SECURITY_VIOLATION');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].user).toBe('jailed_dev');
    });

    test('CRITICAL SECURITY: Traversal attempt (/var/www/html/../../etc/passwd) returns HTTP 403 and triggers SECURITY_VIOLATION', async () => {
      const maliciousPath = '/var/www/html/../../etc/passwd';
      const res = await request(app)
        .get('/api/files/read')
        .query({ path: maliciousPath })
        .set('Authorization', `Bearer ${customToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Path outside allowed directory policy');

      // Verify audit trail logged explicit security violation
      const auditRes = await request(app)
        .get('/api/audit/logs?limit=5')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(auditRes.status).toBe(200);
      const traversalEvent = auditRes.body.logs.find(
        l => l.action === 'SECURITY_VIOLATION' && l.target_resource === maliciousPath
      );
      expect(traversalEvent).toBeDefined();
      expect(traversalEvent.user).toBe('jailed_dev');
    });

    test('Write operation to unauthorized directory (/tmp/hack.sh) is blocked with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/files/save')
        .set('Authorization', `Bearer ${customToken}`)
        .send({ path: '/tmp/hack.sh', content: 'echo hacked' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Path outside allowed directory policy');
    });
  });

  describe('Docker Container Jail & Mutation Guard', () => {
    test('Unauthorized container mutation (/containers/unauthorized-db/action) returns HTTP 403 and triggers SECURITY_VIOLATION', async () => {
      const res = await request(app)
        .post('/api/docker/containers/unauthorized-db/action')
        .set('Authorization', `Bearer ${customToken}`)
        .send({ action: 'restart' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Container 'unauthorized-db' is not permitted by policy");

      // Verify audit trail logged SECURITY_VIOLATION
      const auditRes = await request(app)
        .get('/api/audit/logs?limit=5')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(auditRes.status).toBe(200);
      const violation = auditRes.body.logs.find(
        l => l.action === 'SECURITY_VIOLATION' && l.target_resource === 'container:unauthorized-db'
      );
      expect(violation).toBeDefined();
      expect(violation.user).toBe('jailed_dev');
    });

    test('Unauthorized container delete (/containers/unauthorized-db) returns HTTP 403 and triggers SECURITY_VIOLATION', async () => {
      const res = await request(app)
        .delete('/api/docker/containers/unauthorized-db')
        .set('Authorization', `Bearer ${customToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Container 'unauthorized-db' is not permitted by policy");
    });

    test('Wildcard container access allows targeting any container', async () => {
      const wildcardUser = db.createUser({
        username: 'wildcard_dev',
        password: 'StrongPassword123!',
        role: 'custom',
        granular_policies: {
          modules: { docker: true },
          resources: { allowed_containers: ['*'] }
        }
      });
      const wildcardToken = auth.generateToken(wildcardUser);

      const res = await request(app)
        .get('/api/docker/containers/any-container-id')
        .set('Authorization', `Bearer ${wildcardToken}`);

      // Should not be rejected by policy (might be 404 or 500 from docker engine, but NOT 403)
      expect(res.status).not.toBe(403);
    });
  });

  describe('Immediate Policy Revocation & Real-time Refresh', () => {
    test('Updating user policy in database immediately revokes module without re-login', async () => {
      // 1. Verify user currently has files access
      let res = await request(app)
        .get('/api/files/list')
        .query({ path: '/var/www/html' })
        .set('Authorization', `Bearer ${customToken}`);
      expect(res.status).not.toBe(403);

      // 2. Superadmin revokes files module in database
      const updatedPolicy = {
        modules: { overview: true, files: false, docker: true },
        resources: { allowed_directories: [], allowed_containers: ['nexus-demo-service'] }
      };
      db.updateUserPolicies(customUser.id, updatedPolicy);

      // 3. User uses their SAME existing token -> Immediately blocked with 403!
      res = await request(app)
        .get('/api/files/list')
        .query({ path: '/var/www/html' })
        .set('Authorization', `Bearer ${customToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Access to module 'files' denied by policy");
    });
  });
});
