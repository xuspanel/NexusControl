const request = require('supertest');
const { app } = require('../server');

describe('System Telemetry & SSE Streaming Integration', () => {
  const authHeader = { Authorization: 'Bearer test-token' };

  test('GET /api/stream returns text/event-stream headers and streams initial payload', (done) => {
    const http = require('node:http');
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const req = http.get(`http://127.0.0.1:${port}/api/stream`, {
        headers: authHeader
      }, (res) => {
        expect(res.headers['content-type']).toContain('text/event-stream');
        expect(res.statusCode).toBe(200);

        res.on('data', (chunk) => {
          const text = chunk.toString();
          if (text.includes('data:')) {
            expect(text).toContain('timestamp');
            try { res.destroy(); } catch {}
            try { req.destroy(); } catch {}
            try { server.closeAllConnections?.(); } catch {}
            server.close(done);
          }
        });
      });

      req.on('error', () => {
        try { server.closeAllConnections?.(); } catch {}
        try { server.close(); } catch {}
      });
    });
  });

  test('GET /api/system/profile returns host hardware specifications', async () => {
    const res = await request(app)
      .get('/api/system/profile')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.hostname).toBeDefined();
    expect(res.body.cpuCores).toBeGreaterThan(0);
    expect(res.body.totalMemory).toBeGreaterThan(0);
  });

  test('GET /api/system/processes returns top running processes', async () => {
    const res = await request(app)
      .get('/api/system/processes')
      .query({ limit: 5 })
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].pid).toBeDefined();
  });
});
