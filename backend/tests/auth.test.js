const request = require('supertest');
const { app } = require('../server');
const auth = require('../auth');

describe('Authentication & Perimeter Defense Integration', () => {
  const masterPassword = process.env.ADMIN_PASSWORD || 'TestPassword123!';
  const whitelistedExternalIp = '192.168.1.50';
  const blockedExternalIp = '203.0.113.195';

  test('IP Whitelist Interceptor rejects unwhitelisted IP with HTTP 403', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Forwarded-For', blockedExternalIp);

    expect(res.status).toBe(403);
    expect(res.text).toContain('403 Access Denied');
  });

  test('Step 1 Handshake rejects invalid master password with HTTP 401', async () => {
    const res = await request(app)
      .post('/api/auth/step1')
      .send({ password: 'IncorrectPassword999!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid master password');
  });

  test('Step 1 Handshake succeeds with valid password and returns 2FA challenge', async () => {
    const res = await request(app)
      .post('/api/auth/step1')
      .send({ password: masterPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.step).toBe('2FA_REQUIRED');
    expect(res.body.tempToken).toBeDefined();
    expect(typeof res.body.tempToken).toBe('string');
  });

  test('Rate Limiter enforces brute-force protection (HTTP 429) after excessive attempts', async () => {
    let lastStatus = 0;
    // authLimiter threshold is 20 requests per 15 minutes for non-loopback IPs
    for (let i = 0; i < 22; i++) {
      const res = await request(app)
        .post('/api/auth/step1')
        .set('X-Forwarded-For', whitelistedExternalIp)
        .send({ password: 'wrong' });
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
  }, 15000);

  test('Protected endpoint returns HTTP 401 when token is missing or invalid', async () => {
    const res = await request(app)
      .get('/api/auth/check');

    expect(res.status).toBe(401);
  });

  test('Protected endpoint succeeds when valid test token context is injected', async () => {
    const res = await request(app)
      .get('/api/auth/check')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });
});
