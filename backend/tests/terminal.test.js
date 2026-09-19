const WebSocket = require('ws');
const http = require('node:http');
const { app } = require('../server');
const auth = require('../auth');
const ipWhitelist = require('../ipWhitelist');
const { setupTerminalWebSocket } = require('../terminalWs');
const terminalSessions = require('../terminalSessions');

describe('Enterprise Terminal WebSocket & PTY Session Integration', () => {
  let testHttpServer;
  let serverPort;

  beforeAll((done) => {
    testHttpServer = http.createServer(app);
    setupTerminalWebSocket(testHttpServer, auth, ipWhitelist);
    testHttpServer.listen(0, '127.0.0.1', () => {
      serverPort = testHttpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (testHttpServer) {
      try { testHttpServer.closeAllConnections?.(); } catch {}
      testHttpServer.close(done);
    } else {
      done();
    }
  });

  test('Spins up mock WebSocket client, authenticates, requests PTY session, and asserts session is tracked in memory', (done) => {
    const wsUrl = `ws://127.0.0.1:${serverPort}/api/terminal/ws?token=test-token&cols=80&rows=24&title=jest-pty-test`;
    const client = new WebSocket(wsUrl);

    client.on('open', () => {
      setTimeout(() => {
        const sessions = terminalSessions.listSessions();
        expect(Array.isArray(sessions)).toBe(true);
        expect(sessions.length).toBeGreaterThanOrEqual(1);

        const activeSession = sessions.find((s) => s.title === 'jest-pty-test');
        expect(activeSession).toBeDefined();
        expect(activeSession.id).toBeDefined();
        expect(activeSession.cols).toBe(80);
        expect(activeSession.rows).toBe(24);
        expect(activeSession.isAlive).toBe(true);

        client.close();
        terminalSessions.destroySession(activeSession.id);
        done();
      }, 300);
    });

    client.on('error', (err) => {
      done(err);
    });
  });

  test('WebSocket upgrade rejects unauthenticated connections with HTTP 401', (done) => {
    const wsUrl = `ws://127.0.0.1:${serverPort}/api/terminal/ws?token=invalid-unauthorized-token`;
    const client = new WebSocket(wsUrl);

    client.on('unexpected-response', (req, res) => {
      expect(res.statusCode).toBe(401);
      done();
    });

    client.on('error', () => {
      // Handshake rejection is expected
    });

    client.on('open', () => {
      client.close();
      done(new Error('Connection should have been rejected by upgrade gatekeeper'));
    });
  });
});
