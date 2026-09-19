const pty = require('node-pty');
const crypto = require('node:crypto');
const { randomUUID } = crypto;

class OutputRingBuffer {
  constructor(maxBytes = 256 * 1024) { // 256 KB buffer
    this.maxBytes = maxBytes;
    this.chunks = [];
    this.currentBytes = 0;
  }

  write(data) {
    const str = typeof data === 'string' ? data : data.toString('utf8');
    const bytes = Buffer.byteLength(str, 'utf8');
    this.chunks.push(str);
    this.currentBytes += bytes;

    while (this.currentBytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      this.currentBytes -= Buffer.byteLength(removed, 'utf8');
    }
  }

  getAll() {
    return this.chunks.join('');
  }

  clear() {
    this.chunks = [];
    this.currentBytes = 0;
  }
}

class TerminalSessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> session object
    this.SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours persistence
  }

  createSession(options = {}) {
    const sessionId = options.sessionId || randomUUID();
    const cols = parseInt(options.cols, 10) || 80;
    const rows = parseInt(options.rows, 10) || 24;
    const title = options.title || `bash-${sessionId.substring(0, 6)}`;

    const ptyProcess = pty.spawn('/bin/bash', ['-i'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: '/root',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
        HOME: '/root'
      }
    });

    const ringBuffer = new OutputRingBuffer(256 * 1024);

    const session = {
      id: sessionId,
      title,
      ptyProcess,
      ringBuffer,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      cols,
      rows,
      clients: new Set(),
      ttlTimer: null,
      isAlive: true
    };

    ptyProcess.onData((data) => {
      session.lastActivity = Date.now();
      session.ringBuffer.write(data);

      // Broadcast output to all attached clients
      const payload = JSON.stringify({ type: 'output', data });
      for (const client of session.clients) {
        if (client.readyState === 1 /* OPEN */) {
          try {
            client.send(payload);
          } catch (err) {
            console.error(`[PTY BROADCAST ERROR] session ${sessionId}:`, err.message);
          }
        }
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[PTY EXIT] Session ${sessionId} exited (code: ${exitCode}, signal: ${signal})`);
      session.isAlive = false;
      this.destroySession(sessionId);
    });

    this.sessions.set(sessionId, session);
    console.log(`[PTY SPAWN] Spawned session ${sessionId} (${title}) cols=${cols} rows=${rows}`);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getOrCreateSession(sessionId, options = {}) {
    let session = this.getSession(sessionId);
    if (!session || !session.isAlive) {
      session = this.createSession({ ...options, sessionId });
    }
    return session;
  }

  attachClient(sessionId, ws) {
    const session = this.getSession(sessionId);
    if (!session || !session.isAlive) return false;

    // Cancel 24h TTL timer since client reconnected
    if (session.ttlTimer) {
      clearTimeout(session.ttlTimer);
      session.ttlTimer = null;
      console.log(`[PTY RESUME] Session ${sessionId} reconnected. TTL timer cancelled.`);
    }

    session.clients.add(ws);
    ws.sessionId = sessionId;

    // Send session init metadata
    ws.send(JSON.stringify({
      type: 'session_init',
      sessionId: session.id,
      title: session.title,
      cols: session.cols,
      rows: session.rows
    }));

    // Replay existing ring buffer history to client
    const buffered = session.ringBuffer.getAll();
    if (buffered) {
      ws.send(JSON.stringify({ type: 'output', data: buffered }));
    }

    return true;
  }

  detachClient(sessionId, ws) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.clients.delete(ws);
    console.log(`[PTY DETACH] Client disconnected from session ${sessionId}. Remaining clients: ${session.clients.size}`);

    // If no clients left, start the 24-hour persistence timer
    if (session.clients.size === 0 && session.isAlive && !session.ttlTimer) {
      console.log(`[PTY PERSISTENCE] Session ${sessionId} idle. 24h TTL timer started.`);
      session.ttlTimer = setTimeout(() => {
        console.log(`[PTY TTL EXPIRED] Killing idle session ${sessionId} after 24 hours.`);
        this.destroySession(sessionId);
      }, this.SESSION_TTL_MS);
    }
  }

  write(sessionId, data) {
    const session = this.getSession(sessionId);
    if (session && session.isAlive && session.ptyProcess) {
      session.ptyProcess.write(data);
      session.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  resize(sessionId, cols, rows) {
    const session = this.getSession(sessionId);
    if (session && session.isAlive && session.ptyProcess) {
      try {
        session.cols = cols;
        session.rows = rows;
        session.ptyProcess.resize(cols, rows);
        return true;
      } catch (err) {
        console.error(`[PTY RESIZE ERROR] session ${sessionId}:`, err.message);
      }
    }
    return false;
  }

  destroySession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return false;

    if (session.ttlTimer) {
      clearTimeout(session.ttlTimer);
      session.ttlTimer = null;
    }

    // Inform clients session was closed
    for (const client of session.clients) {
      if (client.readyState === 1) {
        try {
          client.send(JSON.stringify({ type: 'session_closed', sessionId }));
          client.close();
        } catch {}
      }
    }
    session.clients.clear();

    if (session.isAlive && session.ptyProcess) {
      try {
        session.ptyProcess.kill();
      } catch {}
    }

    this.sessions.delete(sessionId);
    console.log(`[PTY DESTROYED] Session ${sessionId} cleaned up.`);
    return true;
  }

  listSessions() {
    const list = [];
    for (const [id, s] of this.sessions.entries()) {
      list.push({
        id,
        title: s.title,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        connectedClients: s.clients.size,
        cols: s.cols,
        rows: s.rows,
        isAlive: s.isAlive
      });
    }
    return list;
  }
}

const sessionManager = new TerminalSessionManager();
module.exports = sessionManager;
