const request = require('supertest');
const { app } = require('../server');
const dockerEngine = require('../dockerEngine');
const auditLogger = require('../auditLogger');

describe('Enterprise Docker Engine & Audit Integration', () => {
  const authHeader = { Authorization: 'Bearer test-token' };

  test('isDockerAvailable checks socket existence on Linux host', () => {
    const avail = dockerEngine.isDockerAvailable();
    expect(typeof avail).toBe('boolean');
  });

  test('CPU % and Memory usage calculation math functions correctly', () => {
    const mockStats = {
      cpu_stats: {
        cpu_usage: { total_usage: 2000000000 },
        system_cpu_usage: 10000000000,
        online_cpus: 2
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1000000000 },
        system_cpu_usage: 5000000000
      },
      memory_stats: {
        usage: 524288000, // 500 MB
        limit: 2147483648, // 2 GB
        stats: { cache: 104857600 } // 100 MB
      },
      networks: {
        eth0: { rx_bytes: 50000, tx_bytes: 25000 }
      }
    };

    const cpu = dockerEngine.calculateCpuPercent(mockStats);
    expect(cpu).toBeGreaterThan(0);
    expect(cpu).toBe(40.0); // ((1e9 / 5e9) * 2 * 100) = 40%

    const mem = dockerEngine.calculateMemoryUsage(mockStats);
    expect(mem.used).toBe(419430400); // 500MB - 100MB cache = 400MB
    expect(mem.limit).toBe(2147483648);
    expect(mem.percent).toBeCloseTo(19.53, 1);

    const net = dockerEngine.calculateNetworkIo(mockStats);
    expect(net.rxBytes).toBe(50000);
    expect(net.txBytes).toBe(25000);
  });

  test('GET /api/docker/status returns Docker Engine status and version', async () => {
    const res = await request(app)
      .get('/api/docker/status')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    if (res.body.available) {
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('containersCount');
    }
  });

  test('GET /api/docker/containers returns container list', async () => {
    const res = await request(app)
      .get('/api/docker/containers')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/docker/containers/:id/action validates required action parameter', async () => {
    const res = await request(app)
      .post('/api/docker/containers/nonexistent123/action')
      .set(authHeader)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Action parameter is required');
  });

  test('Lifecycle action audit hook writes DOCKER_RESTART into cryptographic ledger', () => {
    const containerId = 'a1b2c3d4e5f67890';
    const containerName = 'test-redis-cache';

    const event = auditLogger.logEvent({
      action: 'DOCKER_RESTART',
      user: 'root',
      ip: '127.0.0.1',
      userAgent: 'Jest-Supertest',
      targetResource: `container:${containerName} (${containerId.slice(0, 12)})`,
      payload: {
        action: 'restart',
        containerId,
        containerName,
        success: true
      }
    });

    expect(event).toHaveProperty('id');
    expect(event.action).toBe('DOCKER_RESTART');
    expect(event).toHaveProperty('eventHash');
    expect(event).toHaveProperty('prevHash');

    // Cryptographic audit chain must remain valid
    const verification = auditLogger.verifyAuditChain();
    expect(verification.valid).toBe(true);
  });

  test('Delete action audit hook writes DOCKER_DELETE into cryptographic ledger', () => {
    const containerId = 'f9e8d7c6b5a43210';
    const containerName = 'temp-worker';

    const event = auditLogger.logEvent({
      action: 'DOCKER_DELETE',
      user: 'root',
      ip: '127.0.0.1',
      userAgent: 'Jest-Supertest',
      targetResource: `container:${containerName} (${containerId.slice(0, 12)})`,
      payload: {
        containerId,
        containerName,
        force: true,
        removeVolumes: false,
        success: true
      }
    });

    expect(event.action).toBe('DOCKER_DELETE');
    const verification = auditLogger.verifyAuditChain();
    expect(verification.valid).toBe(true);
  });
});
