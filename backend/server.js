require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const express = require('express');
const http = require('node:http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const fs = require('node:fs');

const collector = require('./collector');
const osAdapter = require('./osAdapter');
const history = require('./history');
const services = require('./services');
const security = require('./security');
const auth = require('./auth');
const filesRouter = require('./filesRouter');
const trash = require('./trash');
const uploadEngine = require('./upload');
const terminalRouter = require('./terminalRouter');
const { setupTerminalWebSocket } = require('./terminalWs');
const ipWhitelist = require('./ipWhitelist');
const { ipWhitelistMiddleware } = ipWhitelist;
const auditLogger = require('./auditLogger');
const auditRouter = require('./auditRouter');
const dockerRouter = require('./dockerRouter');
const dockerEngine = require('./dockerEngine');
const vhostRouter = require('./vhostRouter');
const backupRouter = require('./backupRouter');
const scheduler = require('./scheduler');
const userRouter = require('./userRouter');
const wireguardRouter = require('./wireguardRouter');
const alertRouter = require('./alertRouter');

// Ensure system storage directories exist on boot
trash.initTrash().then(() => console.log('[BOOT] Trash directory initialized at /opt/NexusControl/.trash')).catch(err => console.error('[BOOT ERROR] Trash init:', err));
uploadEngine.initUploads().then(() => console.log('[BOOT] Uploads directory initialized at /opt/NexusControl/.uploads')).catch(err => console.error('[BOOT ERROR] Uploads init:', err));

const app = express();
const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';

// Trust Nginx reverse proxy headers (X-Forwarded-For, X-Real-IP)
app.set('trust proxy', 'loopback');

// 1. Root Hardening: Helmet Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Vite React SPA scripts
  crossOriginEmbedderPolicy: false
}));

// 2. IP Whitelisting Perimeter Defense (Must run before ALL routes)
app.use(ipWhitelistMiddleware);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.raw({ limit: '100mb' }));

// 3. Brute-Force Rate Limiter for Authentication (20 attempts per 15 minutes for external IPs)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.clientIp === '127.0.0.1',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

// Set of connected SSE clients
const sseClients = new Set();

// Telemetry loop (runs every 1.5 seconds)
let latestTelemetry = collector.getFullTelemetry();
const telemetryTimer = setInterval(() => {
  try {
    latestTelemetry = collector.getFullTelemetry();
    history.recordTelemetry(latestTelemetry);

    // Push to SSE clients
    if (sseClients.size > 0) {
      const payload = `data: ${JSON.stringify(latestTelemetry)}\n\n`;
      for (const client of sseClients) {
        client.write(payload);
      }
    }
  } catch (err) {
    console.error('Error in telemetry loop:', err);
  }
}, 1500);
telemetryTimer.unref?.();

// SSE Heartbeat keep-alive every 15 seconds
const keepaliveTimer = setInterval(() => {
  if (sseClients.size > 0) {
    for (const client of sseClients) {
      client.write(': keepalive\n\n');
    }
  }
}, 15000);
keepaliveTimer.unref?.();

// --- Multi-Step Defense-in-Depth Authentication Pipeline ---

// Step 1: Username & Password Verification (defaults to admin if omitted)
app.post('/api/auth/step1', authLimiter, (req, res) => {
  const { username = 'admin', password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const result = auth.handleStep1Password(password, req.clientIp, username);
  if (!result.success) {
    auditLogger.logEvent({
      action: 'AUTH_STEP1_FAILED',
      user: username || 'unknown',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      payload: { reason: result.error }
    });
    return res.status(401).json({ error: result.error });
  }

  auditLogger.logEvent({
    action: result.step === 'COMPLETE' ? 'AUTH_LOGIN_SUCCESS' : 'AUTH_STEP1_SUCCESS',
    user: result.user?.username || result.username || username || 'admin',
    ip: req.clientIp,
    userAgent: req.headers['user-agent']
  });

  res.json(result);
});

// Legacy /api/auth/login alias -> redirects to Step 1
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username = 'admin', password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const result = auth.handleStep1Password(password, req.clientIp, username);
  if (!result.success) {
    auditLogger.logEvent({
      action: 'AUTH_LOGIN_FAILED',
      user: username || 'unknown',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      payload: { reason: result.error }
    });
    return res.status(401).json({ error: result.error });
  }

  auditLogger.logEvent({
    action: result.step === 'COMPLETE' ? 'AUTH_LOGIN_SUCCESS' : 'AUTH_STEP1_SUCCESS',
    user: result.user?.username || result.username || username || 'admin',
    ip: req.clientIp,
    userAgent: req.headers['user-agent']
  });

  res.json(result);
});

// Step 2: 2FA TOTP Verification
app.post('/api/auth/step2-2fa', authLimiter, async (req, res) => {
  const { tempToken, totpCode } = req.body || {};
  if (!tempToken || !totpCode) {
    return res.status(400).json({ error: 'tempToken and totpCode are required.' });
  }

  const result = await auth.handleStep2Totp(tempToken, totpCode, req.clientIp);
  if (!result.success) {
    auditLogger.logEvent({
      action: 'AUTH_2FA_FAILED',
      user: 'root',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      payload: { reason: result.error }
    });
    const statusCode = result.status || 401;
    return res.status(statusCode).json({
      error: result.error,
      tempToken: result.tempToken,
      step: result.step,
      maskedEmail: result.maskedEmail
    });
  }

  if (result.authenticated || result.step === 'COMPLETE') {
    auditLogger.logEvent({
      action: 'AUTH_LOGIN_SUCCESS',
      user: result.user?.username || 'admin',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      payload: { method: 'totp' }
    });
  }

  res.json(result);
});

// Step 3: Email OTP Verification (New Session / IP)
app.post('/api/auth/step3-email-otp', authLimiter, (req, res) => {
  const { tempToken, emailOtp } = req.body || {};
  if (!tempToken || !emailOtp) {
    return res.status(400).json({ error: 'tempToken and emailOtp are required.' });
  }

  const result = auth.handleStep3EmailOtp(tempToken, emailOtp, req.clientIp);
  if (!result.success) {
    auditLogger.logEvent({
      action: 'AUTH_EMAIL_OTP_FAILED',
      user: 'admin',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      payload: { reason: result.error }
    });
    return res.status(401).json({ error: result.error });
  }

  auditLogger.logEvent({
    action: 'AUTH_LOGIN_SUCCESS',
    user: result.user?.username || 'admin',
    ip: req.clientIp,
    userAgent: req.headers['user-agent'],
    payload: { method: 'email_otp' }
  });

  res.json(result);
});

app.get('/api/auth/check', auth.authMiddleware, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

app.post('/api/auth/logout', auth.authMiddleware, (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    auth.revokeToken(authHeader.slice(7).trim());
  }
  auditLogger.logEvent({
    action: 'AUTH_LOGOUT',
    user: req.user?.username || 'system',
    ip: req.clientIp,
    userAgent: req.headers['user-agent']
  });
  res.json({ success: true });
});

// Onboarding / Profile 2FA Setup
app.get('/api/auth/2fa/setup', auth.authMiddleware, async (req, res) => {
  try {
    const { generateSecret, generateURI } = require('otplib');
    const qrcode = require('qrcode');
    const totpSecret = generateSecret();
    const otpUri = generateURI({
      secret: totpSecret,
      label: req.user?.username || 'admin',
      issuer: 'NexusControl'
    });
    const qrCodeDataUrl = await qrcode.toDataURL(otpUri);
    res.json({ success: true, secret: totpSecret, otpUri, qrCodeDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/enable', auth.authMiddleware, (req, res) => {
  try {
    const { verifySync } = require('otplib');
    const db = require('./db');
    const { secret, code } = req.body || {};
    if (!secret || !code) {
      return res.status(400).json({ error: 'Secret and verification code are required.' });
    }
    const verifyResult = verifySync({ token: String(code).trim(), secret });
    const isValid = verifyResult === true || (verifyResult && verifyResult.valid === true);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid 2FA code. Please verify the 6-digit code in your authenticator app.' });
    }

    db.updateUser2FA(req.user.id, 1, secret);
    auditLogger.logEvent({
      action: '2FA_ENABLED',
      user: req.user?.username || 'admin',
      ip: req.clientIp,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Two-factor authentication successfully enabled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/disable', auth.authMiddleware, (req, res) => {
  try {
    const db = require('./db');
    db.updateUser2FA(req.user.id, 0, null);
    auditLogger.logEvent({
      action: '2FA_DISABLED',
      user: req.user?.username || 'admin',
      ip: req.clientIp,
      userAgent: req.headers['user-agent']
    });
    res.json({ success: true, message: 'Two-factor authentication disabled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE Stream Endpoint
app.get('/api/stream', auth.authMiddleware, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify(latestTelemetry)}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Protected System Endpoints
app.get('/api/system/profile', auth.authMiddleware, (req, res) => {
  try {
    const profile = collector.getSystemProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/metrics', auth.authMiddleware, (req, res) => {
  res.json(latestTelemetry);
});

app.get('/api/system/history', auth.authMiddleware, (req, res) => {
  try {
    const range = req.query.range || '1h';
    const data = history.getHistory(range);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/processes', auth.authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 15;
    const procs = await collector.getTopProcesses(limit);
    res.json(procs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/processes/signal', auth.authMiddleware, auth.requireRole(['superadmin', 'operator'], 'overview'), async (req, res) => {
  try {
    const { pid, signal } = req.body;
    if (pid === undefined) return res.status(400).json({ error: 'PID is required.' });
    const result = await services.dispatchProcessSignal(pid, signal || 'SIGTERM');
    auditLogger.logEvent({
      action: 'PROCESS_SIGNAL',
      user: req.user?.username || 'system',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      targetResource: `PID:${pid}`,
      payload: { signal: signal || 'SIGTERM', result }
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/system/services', auth.authMiddleware, async (req, res) => {
  try {
    if (!osAdapter.isSystemdAvailable()) {
      return res.status(501).json({
        supported: false,
        error: 'Systemd is not available or supported on this operating system (systemctl not found).'
      });
    }
    const list = await services.getAllServices();
    res.json(list);
  } catch (err) {
    if (err.statusCode === 501 || err.notImplemented) {
      return res.status(501).json({ supported: false, error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/services/action', auth.authMiddleware, auth.requireRole(['superadmin', 'operator'], 'overview'), async (req, res) => {
  try {
    if (!osAdapter.isSystemdAvailable()) {
      return res.status(501).json({
        supported: false,
        error: 'Systemd is not available or supported on this operating system (systemctl not found).'
      });
    }
    const { serviceId, action } = req.body;
    if (!serviceId || !action) {
      return res.status(400).json({ error: 'serviceId and action are required.' });
    }
    const result = await services.manageService(serviceId, action);
    auditLogger.logEvent({
      action: `SERVICE_${String(action).toUpperCase()}`,
      user: req.user?.username || 'system',
      ip: req.clientIp,
      userAgent: req.headers['user-agent'],
      targetResource: serviceId,
      payload: { action, result }
    });
    res.json(result);
  } catch (err) {
    if (err.statusCode === 501 || err.notImplemented) {
      return res.status(501).json({ supported: false, error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/system/security', auth.authMiddleware, async (req, res) => {
  try {
    const sec = await security.getSecurityOverview();
    res.json(sec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/logs', auth.authMiddleware, async (req, res) => {
  try {
    const { lines, level, search, unit } = req.query;
    const logs = await services.getJournalLogs({ lines, level, search, unit });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected User Management Endpoints (Superadmin only)
app.use('/api/users', auth.authMiddleware, auth.requireRole(['superadmin'], 'users'), userRouter);

// Protected Terminal Endpoints (Superadmin only)
app.use('/api/terminal', auth.authMiddleware, auth.requireRole(['superadmin'], 'terminal'), terminalRouter);

// Protected Files Manager Endpoints (Superadmin, Operator, Custom with files module)
app.use('/api/files', auth.authMiddleware, auth.requireRole(['superadmin', 'operator'], 'files'), filesRouter);

// Protected Enterprise Docker Engine Endpoints (Superadmin, Operator, Custom with docker module)
app.use('/api/docker', auth.authMiddleware, auth.requireRole(['superadmin', 'operator'], 'docker'), dockerRouter);

// Protected Enterprise Nginx vHost & Domain Manager Endpoints (Superadmin, Operator, Custom with vhosts module)
app.use('/api/vhosts', auth.authMiddleware, auth.requireRole(['superadmin', 'operator'], 'vhosts'), vhostRouter);

// Protected Automated Backup & Snapshot Engine Endpoints (Superadmin, Operator, Custom with backups module)
app.use('/api/backups', auth.authMiddleware, auth.requireRole(['superadmin', 'operator'], 'backups'), backupRouter);

// Protected Tamper-Evident Audit Log Endpoints (Superadmin, Operator, Viewer, Custom with audit module)
app.use('/api/audit', auth.authMiddleware, auth.requireRole(['superadmin', 'operator', 'viewer'], 'audit'), auditRouter);

// Protected Flagship Zero Trust Network (WireGuard) Endpoints (Superadmin only)
app.use('/api/wireguard', auth.authMiddleware, auth.requireRole(['superadmin'], 'network'), wireguardRouter);

// Protected Webhook Alerting Worker Endpoints (Superadmin only)
app.use('/api/alerts', auth.authMiddleware, auth.requireRole(['superadmin'], 'overview'), alertRouter);

if (process.env.NODE_ENV !== 'test') {
  dockerEngine.startBackgroundSampling(3500);
  scheduler.initScheduler();
}

// Health check endpoint for internal monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Static frontend serving
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API route not found.' });
    }
  });
}

const server = http.createServer(app);

// Attach Enterprise Terminal WebSocket Server with Bearer Auth & IP Whitelist validation
setupTerminalWebSocket(server, auth, ipWhitelist);

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[OS-Adapter] Detected OS: ${osAdapter.OS_PRETTY_NAME} (${osAdapter.OS_FAMILY.toUpperCase()} family) - systemd: ${osAdapter.isSystemdAvailable() ? 'available' : 'unavailable'}`);
    console.log(`NexusControl Hardened Backend daemon listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { app, server };
