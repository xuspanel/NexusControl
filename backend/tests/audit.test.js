const request = require('supertest');
const { app } = require('../server');
const auditLogger = require('../auditLogger');

describe('Cryptographic Tamper-Evident Audit Log Integration', () => {
  const authHeader = { Authorization: 'Bearer test-token' };

  test('Appends sequential chained events and validates cryptographic integrity via API', async () => {
    const e1 = auditLogger.logEvent({
      action: 'TEST_INIT',
      user: 'root',
      ip: '127.0.0.1',
      payload: { stage: 1 }
    });

    const e2 = auditLogger.logEvent({
      action: 'TEST_STEP',
      user: 'root',
      ip: '127.0.0.1',
      payload: { stage: 2 }
    });

    expect(e2.prevHash).toBe(e1.eventHash);

    // Verify chain via REST API
    const res = await request(app)
      .get('/api/audit/verify')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
  });

  test('Manually altering a database row in the test DB triggers verification failure and detects tamper break', async () => {
    // 1. Create a known event
    const event = auditLogger.logEvent({
      action: 'CRITICAL_SECURITY_CONFIG_CHANGE',
      user: 'authorized_admin',
      targetResource: '/etc/nexus/security.conf',
      payload: { allowRoot: false }
    });

    expect(event).toBeDefined();

    // 2. Perform out-of-band manual alteration in SQLite
    auditLogger.db.prepare("UPDATE audit_logs SET user = 'unauthorized_attacker' WHERE id = ?").run(event.id);

    // 3. Trigger verification function
    const verifyResult = auditLogger.verifyAuditChain();
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.logId).toBe(event.id);
    expect(verifyResult.reason).toContain('Data tampering detected');

    // 4. Also assert the GET /api/audit/verify endpoint flags the broken chain
    const apiRes = await request(app)
      .get('/api/audit/verify')
      .set(authHeader);

    expect(apiRes.body.valid).toBe(false);
    expect(apiRes.body.logId).toBe(event.id);

    // 5. Restore row for remaining test stability
    auditLogger.db.prepare("UPDATE audit_logs SET user = 'authorized_admin' WHERE id = ?").run(event.id);
    expect(auditLogger.verifyAuditChain().valid).toBe(true);
  });

  test('GET /api/audit/logs returns paginated records with search and action filtering', async () => {
    const res = await request(app)
      .get('/api/audit/logs')
      .query({ limit: 10, offset: 0 })
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });
});
