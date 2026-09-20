const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { app } = require('../server');
const vhostEngine = require('../vhostEngine');
const portInspector = require('../portInspector');
const auditLogger = require('../auditLogger');

describe('Enterprise Nginx vHost & Domain Manager Integration', () => {
  const authHeader = { Authorization: 'Bearer test-token' };
  const testDir = path.join('/tmp', `nexus_vhost_test_${Date.now()}`);

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('RFC Domain Validation & Security Gate', () => {
    test('Accepts valid RFC-compliant domain names', () => {
      expect(vhostEngine.isValidDomain('example.com')).toBe(true);
      expect(vhostEngine.isValidDomain('sub.example.com')).toBe(true);
      expect(vhostEngine.isValidDomain('api-v2.cloud.co.uk')).toBe(true);
      expect(vhostEngine.isValidDomain('nexus-demo.xus.me')).toBe(true);
    });

    test('Strictly rejects invalid domain names and shell injection attempts', () => {
      expect(vhostEngine.isValidDomain('')).toBe(false);
      expect(vhostEngine.isValidDomain(null)).toBe(false);
      expect(vhostEngine.isValidDomain('example')).toBe(false);
      expect(vhostEngine.isValidDomain('.example.com')).toBe(false);
      expect(vhostEngine.isValidDomain('example..com')).toBe(false);
      expect(vhostEngine.isValidDomain('test.com; rm -rf /')).toBe(false);
      expect(vhostEngine.isValidDomain('test`whoami`.com')).toBe(false);
      expect(vhostEngine.isValidDomain('test$(id).com')).toBe(false);
      expect(vhostEngine.isValidDomain('domain.com && cat /etc/passwd')).toBe(false);
      expect(vhostEngine.isValidDomain('bad domain.com')).toBe(false);
    });
  });

  describe('Nginx Configuration Template Engine', () => {
    test('Renders Reverse Proxy template with WebSockets, SSE non-buffering, and real IP headers', () => {
      const template = vhostEngine.renderVHostTemplate('proxy.test.com', {
        type: 'proxy',
        target: 'http://127.0.0.1:8888',
        supportWebSocket: true,
        supportSse: true,
        clientMaxBodySize: '100M'
      });

      expect(template).toContain(vhostEngine.SIGNATURE_HEADER);
      expect(template).toContain('server_name proxy.test.com;');
      expect(template).toContain('proxy_pass http://127.0.0.1:8888;');
      expect(template).toContain('proxy_set_header Upgrade $http_upgrade;');
      expect(template).toContain('proxy_buffering off;');
      expect(template).toContain('proxy_cache off;');
      expect(template).toContain('proxy_set_header X-Real-IP $remote_addr;');
      expect(template).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
      expect(template).toContain('client_max_body_size 100M;');
    });

    test('Renders Static Site template with web root directory and try_files fallback', () => {
      const template = vhostEngine.renderVHostTemplate('static.test.com', {
        type: 'static',
        webRoot: '/var/www/static.test.com/html'
      });

      expect(template).toContain(vhostEngine.SIGNATURE_HEADER);
      expect(template).toContain('server_name static.test.com;');
      expect(template).toContain('root /var/www/static.test.com/html;');
      expect(template).toContain('try_files $uri $uri/ =404;');
    });

    test('Renders Redirect template with 301 / 302 HTTP status codes', () => {
      const template301 = vhostEngine.renderVHostTemplate('redirect.test.com', {
        type: 'redirect',
        target: 'https://newdomain.com',
        redirectCode: 301
      });

      expect(template301).toContain(vhostEngine.SIGNATURE_HEADER);
      expect(template301).toContain('return 301 https://newdomain.com$request_uri;');

      const template302 = vhostEngine.renderVHostTemplate('temp.test.com', {
        type: 'redirect',
        target: 'https://staging.newdomain.com',
        redirectCode: 302
      });

      expect(template302).toContain('return 302 https://staging.newdomain.com$request_uri;');
    });
  });

  describe('Pre-Flight DNS Check & REST Endpoints', () => {
    test('GET /api/vhosts/dns-check/:domain verifies domain A-records', async () => {
      const res = await request(app)
        .get('/api/vhosts/dns-check/example.com')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('domain', 'example.com');
      expect(res.body).toHaveProperty('expectedIp', vhostEngine.PUBLIC_IP);
      expect(res.body).toHaveProperty('matches');
    });

    test('GET /api/vhosts lists managed virtual hosts and SSL metadata', async () => {
      const res = await request(app)
        .get('/api/vhosts')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('POST /api/vhosts rejects missing or invalid domain names', async () => {
      const resMissing = await request(app)
        .post('/api/vhosts')
        .set(authHeader)
        .send({});

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.error).toContain('Domain name is required');

      const resInvalid = await request(app)
        .post('/api/vhosts')
        .set(authHeader)
        .send({ domain: 'invalid;rm -rf' });

      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.error).toContain('Invalid domain name format');
    });

    test('POST /api/vhosts/:domain/ssl rejects missing administrator email', async () => {
      const res = await request(app)
        .post('/api/vhosts/test.example.com/ssl')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Administrator email is required');
    });

    test('PUT /api/vhosts/:domain validates domain format', async () => {
      const res = await request(app)
        .put('/api/vhosts/invalid_domain;bad')
        .set(authHeader)
        .send({ type: 'proxy', target: 'http://127.0.0.1:8080' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid domain name format');
    });

    test('POST /api/vhosts/:domain/toggle rejects nonexistent domains', async () => {
      const res = await request(app)
        .post('/api/vhosts/nonexistent.domain.test/toggle')
        .set(authHeader);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No vHost found');
    });

    test('DELETE /api/vhosts/:domain rejects nonexistent domains', async () => {
      const res = await request(app)
        .delete('/api/vhosts/nonexistent.domain.test')
        .set(authHeader);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not exist');
    });
  });

  describe('Cryptographic Audit Log Chaining for vHost Mutations', () => {
    test('Logs VHOST_CREATE event into tamper-evident SHA-256 ledger', () => {
      const domain = 'service.company.internal.com';
      const event = auditLogger.logEvent({
        action: 'VHOST_CREATE',
        user: 'root',
        ip: '127.0.0.1',
        userAgent: 'Jest-Supertest',
        targetResource: `vhost:${domain}`,
        payload: {
          domain,
          type: 'proxy',
          target: 'http://127.0.0.1:8888',
          success: true
        }
      });

      expect(event).toHaveProperty('id');
      expect(event.action).toBe('VHOST_CREATE');
      expect(event).toHaveProperty('eventHash');
      expect(event).toHaveProperty('prevHash');

      const verification = auditLogger.verifyAuditChain();
      expect(verification.valid).toBe(true);
    });

    test('Logs VHOST_TOGGLE and VHOST_DELETE events into cryptographic ledger', () => {
      const domain = 'temp-worker.company.com';

      const toggleEvent = auditLogger.logEvent({
        action: 'VHOST_TOGGLE',
        user: 'root',
        ip: '127.0.0.1',
        userAgent: 'Jest-Supertest',
        targetResource: `vhost:${domain}`,
        payload: {
          domain,
          enabled: false,
          success: true
        }
      });

      expect(toggleEvent.action).toBe('VHOST_TOGGLE');

      const deleteEvent = auditLogger.logEvent({
        action: 'VHOST_DELETE',
        user: 'root',
        ip: '127.0.0.1',
        userAgent: 'Jest-Supertest',
        targetResource: `vhost:${domain}`,
        payload: {
          domain,
          success: true
        }
      });

      expect(deleteEvent.action).toBe('VHOST_DELETE');

      const sslEvent = auditLogger.logEvent({
        action: 'SSL_ISSUE',
        user: 'root',
        ip: '127.0.0.1',
        userAgent: 'Jest-Supertest',
        targetResource: `vhost:${domain}`,
        payload: {
          domain,
          email: 'admin@company.com',
          success: true
        }
      });

      expect(sslEvent.action).toBe('SSL_ISSUE');

      // Assert entire hash chain is mathematically intact
      const verification = auditLogger.verifyAuditChain();
      expect(verification.valid).toBe(true);
      expect(verification.count).toBeGreaterThan(0);
    });
  });

  describe('Smart Port Inspector & Auto-Allocator', () => {
    let dummyServer;
    const busyPort = 8997;

    beforeAll((done) => {
      dummyServer = net.createServer();
      dummyServer.listen(busyPort, '127.0.0.1', () => done());
    });

    afterAll((done) => {
      if (dummyServer) {
        dummyServer.close(() => done());
      } else {
        done();
      }
    });

    test('Listening on an active socket correctly reports available: false', async () => {
      const isAvailable = await portInspector.checkPortAvailable(busyPort);
      expect(isAvailable).toBe(false);
    });

    test('Unbound port in range 8080-9999 reports available: true', async () => {
      const nextFree = await portInspector.findNextAvailablePort(8080, 9999);
      expect(typeof nextFree).toBe('number');
      expect(nextFree).toBeGreaterThanOrEqual(8080);
      expect(nextFree).toBeLessThanOrEqual(9999);

      const isAvailable = await portInspector.checkPortAvailable(nextFree);
      expect(isAvailable).toBe(true);
    });

    test('GET /api/vhosts/inspect-port validates port and returns availability and suggestion', async () => {
      // 1. Busy port check
      const resBusy = await request(app)
        .get(`/api/vhosts/inspect-port?port=${busyPort}`)
        .set(authHeader);

      expect(resBusy.status).toBe(200);
      expect(resBusy.body).toHaveProperty('port', busyPort);
      expect(resBusy.body.available).toBe(false);
      expect(resBusy.body).toHaveProperty('suggestedPort');
      expect(typeof resBusy.body.suggestedPort).toBe('number');
      expect(resBusy.body.suggestedPort).not.toBe(busyPort);

      // 2. Invalid port check (out of range)
      const resInvalid = await request(app)
        .get('/api/vhosts/inspect-port?port=70000')
        .set(authHeader);

      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.error).toContain('Port must be an integer between 1 and 65535');
    });

    test('GET /api/vhosts/next-port returns recommended available port', async () => {
      const res = await request(app)
        .get('/api/vhosts/next-port')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('suggestedPort');
      expect(typeof res.body.suggestedPort).toBe('number');
      expect(res.body.suggestedPort).toBeGreaterThanOrEqual(8080);
    });

    test('POST /api/vhosts auto-assigns next available port when target is empty for Reverse Proxy', async () => {
      const spy = jest.spyOn(vhostEngine, 'createOrUpdateVHost').mockResolvedValueOnce({
        success: true,
        domain: 'auto-port.example.com',
        type: 'proxy',
        target: 'http://127.0.0.1:8080'
      });

      const res = await request(app)
        .post('/api/vhosts')
        .set(authHeader)
        .send({
          domain: 'auto-port.example.com',
          type: 'proxy'
          // target and upstreamPort omitted
        });

      expect(res.status).toBe(201);
      expect(spy).toHaveBeenCalled();
      const passedConfig = spy.mock.calls[0][1];
      expect(passedConfig.target).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      // Verify generated Nginx template syntax
      const template = vhostEngine.renderVHostTemplate('auto-port.example.com', passedConfig);
      expect(template).toContain(`proxy_pass ${passedConfig.target};`);
      expect(template).toContain('server_name auto-port.example.com;');

      spy.mockRestore();
    });
  });
});
