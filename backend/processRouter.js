const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const processEngine = require('./processEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

/**
 * GET /api/process
 * List all nc-app- services with their live stats (Status, PID, CPU, RAM, Uptime).
 */
router.get('/', async (req, res) => {
  try {
    const apps = await processEngine.getApps();
    res.json({
      success: true,
      apps
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/process
 * Provision a new managed application service.
 * Accepts: { name, cmd, cwd, env }
 */
router.post('/', requireRole(['superadmin', 'operator'], 'process'), async (req, res) => {
  try {
    const { name, cmd, cwd, env } = req.body || {};
    if (!name || !cmd) {
      return res.status(400).json({
        success: false,
        error: 'Both "name" and "cmd" parameters are required.'
      });
    }

    const app = await processEngine.createApp(name, cmd, cwd, env);

    auditLogger.logEvent({
      action: 'PROCESS_APP_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `nc-app-${app.name}.service`,
      payload: { name: app.name, cmd, cwd: app.cwd },
      severity: 'INFO'
    });

    res.status(201).json({
      success: true,
      message: `Application "${app.name}" deployed and started successfully.`,
      app
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/process/:name/action
 * Control an application unit: { action: "start" | "stop" | "restart" }
 */
router.post('/:name/action', requireRole(['superadmin', 'operator'], 'process'), async (req, res) => {
  try {
    const { name } = req.params;
    const { action } = req.body || {};

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required ("start", "stop", or "restart").'
      });
    }

    const result = await processEngine.controlApp(name, action);

    auditLogger.logEvent({
      action: `PROCESS_APP_${action.toUpperCase()}`,
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `nc-app-${name}.service`,
      payload: { name, action },
      severity: 'INFO'
    });

    res.json({
      success: true,
      message: `Application "${name}" command "${action}" completed successfully.`,
      result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/process/:name
 * Tear down and delete the managed application unit.
 */
router.delete('/:name', requireRole(['superadmin', 'operator'], 'process'), async (req, res) => {
  try {
    const { name } = req.params;
    await processEngine.deleteApp(name);

    auditLogger.logEvent({
      action: 'PROCESS_APP_DELETE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `nc-app-${name}.service`,
      payload: { name },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: `Application "${name}" unit deleted successfully.`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/process/:name/env
 * Retrieve environment variables from /opt/NexusControl/apps/[name]/.env
 */
router.get('/:name/env', requireRole(['superadmin', 'operator', 'viewer'], 'process'), async (req, res) => {
  try {
    const { name } = req.params;
    const envData = await processEngine.getAppEnv(name);
    res.json({
      success: true,
      name,
      ...envData
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/process/:name/env
 * Update environment variables in /opt/NexusControl/apps/[name]/.env and restart service.
 */
router.put('/:name/env', requireRole(['superadmin', 'operator'], 'process'), async (req, res) => {
  try {
    const { name } = req.params;
    const { env, raw } = req.body || {};

    const payload = env !== undefined ? env : raw;
    await processEngine.setAppEnv(name, payload);

    auditLogger.logEvent({
      action: 'PROCESS_APP_ENV_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `nc-app-${name}.service`,
      payload: { name },
      severity: 'NOTICE'
    });

    res.json({
      success: true,
      message: `Environment variables updated and "${name}" service restarted.`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/process/:name/logs
 * Stream chunked journalctl logs in real-time.
 */
router.get('/:name/logs', requireRole(['superadmin', 'operator', 'viewer'], 'process'), async (req, res) => {
  try {
    const { name } = req.params;
    const cleanName = processEngine.validateAppName(name);
    const unitName = `nc-app-${cleanName}.service`;

    // Set chunked transfer headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    res.write(`[NexusControl PaaS] Streaming logs for ${unitName}...\n`);
    res.write(`[NexusControl PaaS] Connected at: ${new Date().toISOString()}\n`);
    res.write('================================================================================\n\n');

    // Spawn journalctl with follow flag and last 100 entries
    const child = spawn('journalctl', ['-u', unitName, '-n', '100', '-f', '--no-tail']);

    child.stdout.on('data', (chunk) => {
      res.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      res.write(chunk);
    });

    child.on('error', (err) => {
      res.write(`\n[NexusControl Error]: Failed to spawn journalctl: ${err.message}\n`);
      res.end();
    });

    child.on('close', (code) => {
      res.write(`\n[NexusControl]: Stream closed (exit code ${code})\n`);
      res.end();
    });

    req.on('close', () => {
      if (!child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {}
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      res.write(`\n[Error]: ${err.message}\n`);
      res.end();
    }
  }
});

module.exports = router;
