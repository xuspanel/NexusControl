const { WebSocketServer } = require('ws');
const url = require('node:url');
const terminalSessions = require('./terminalSessions');
const auditLogger = require('./auditLogger');

function setupTerminalWebSocket(server, auth, ipWhitelist) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;

      if (pathname !== '/api/terminal/ws') {
        return; // Ignore other upgrade requests
      }

      // 1. IP Whitelist Security Evaluation
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = forwarded ? forwarded.split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket.remoteAddress || '');
      
      if (!ipWhitelist.isIpAllowed(clientIp)) {
        console.warn(`[TERMINAL WS BLOCKED] Untrusted IP ${clientIp} rejected at WebSocket upgrade`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // 2. Authentication Token Validation
      let token = parsedUrl.query?.token;

      if (!token && req.headers['authorization']) {
        const authHeader = req.headers['authorization'];
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7).trim();
        }
      }

      if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const c of cookies) {
          const [name, val] = c.trim().split('=');
          if (name === 'nx_token') {
            token = val;
            break;
          }
        }
      }

      // Also support token passed in Sec-WebSocket-Protocol header
      if (!token && req.headers['sec-websocket-protocol']) {
        const protocols = req.headers['sec-websocket-protocol'].split(',').map(p => p.trim());
        // Find if any protocol matches token format
        for (const p of protocols) {
          if (auth.verifyToken(p)) {
            token = p;
            break;
          }
        }
      }

      const user = auth.verifyToken(token);
      if (!token || !user) {
        console.warn(`[TERMINAL WS UNAUTHORIZED] Missing or invalid session token from IP ${clientIp}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // 3. Strict RBAC Gate: Only superadmin role can access interactive root Terminal shell
      if (user.role !== 'superadmin') {
        console.warn(`[TERMINAL WS FORBIDDEN] User '${user.username}' (role: ${user.role}) denied root Terminal access from IP ${clientIp}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      req.user = user;

      // Upgrade to WebSocket
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (err) {
      console.error('[TERMINAL WS UPGRADE ERROR]', err);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const query = parsedUrl.query || {};

    const requestedSessionId = query.sessionId;
    const cols = parseInt(query.cols, 10) || 80;
    const rows = parseInt(query.rows, 10) || 24;
    const title = query.title;

    let session = null;
    if (requestedSessionId) {
      session = terminalSessions.getOrCreateSession(requestedSessionId, { cols, rows, title });
    } else {
      session = terminalSessions.createSession({ cols, rows, title });
    }

    terminalSessions.attachClient(session.id, ws);
    console.log(`[TERMINAL WS CONNECTED] Client attached to session ${session.id}`);

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1');
    auditLogger.logEvent({
      action: 'TERMINAL_SESSION_CONNECT',
      user: req.user?.username || 'root',
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'WebSocket',
      targetResource: session.id,
      payload: { cols, rows, title: session.title, isNew: !requestedSessionId }
    });

    ws.on('message', (message) => {
      try {
        let msg = null;
        try {
          msg = JSON.parse(message);
        } catch {
          // If raw string, treat as terminal input
          msg = { type: 'input', data: message.toString('utf8') };
        }

        switch (msg.type) {
          case 'input':
            if (msg.data !== undefined) {
              terminalSessions.write(ws.sessionId, msg.data);
            }
            break;

          case 'resize':
            if (msg.cols && msg.rows) {
              terminalSessions.resize(ws.sessionId, parseInt(msg.cols, 10), parseInt(msg.rows, 10));
            }
            break;

          case 'attach':
            if (msg.sessionId) {
              terminalSessions.detachClient(ws.sessionId, ws);
              const targetSession = terminalSessions.getOrCreateSession(msg.sessionId, { cols: msg.cols, rows: msg.rows });
              terminalSessions.attachClient(targetSession.id, ws);
            }
            break;

          case 'kill':
            if (msg.sessionId) {
              terminalSessions.destroySession(msg.sessionId);
            }
            break;

          case 'ping':
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('[TERMINAL WS MESSAGE ERROR]', err);
      }
    });

    ws.on('close', () => {
      if (ws.sessionId) {
        terminalSessions.detachClient(ws.sessionId, ws);
      }
    });

    ws.on('error', (err) => {
      console.error('[TERMINAL WS SOCKET ERROR]', err.message);
    });
  });

  return wss;
}

module.exports = {
  setupTerminalWebSocket
};
