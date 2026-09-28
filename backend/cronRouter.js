const express = require('express');
const router = express.Router();
const { spawn } = require('node:child_process');
const cronEngine = require('./cronEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');
const db = require('./db');

/**
 * GET /api/cron
 * Retrieves current active user crontabs and systemd timers.
 */
router.get('/', async (req, res) => {
  try {
    const crontab = cronEngine.getCrontab();
    const systemd = cronEngine.getSystemdTimers();
    res.json({
      success: true,
      crontab,
      systemd
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/cron
 * Creates a new scheduled cron job wrapped with cronWrapper.js.
 */
router.post('/', requireRole(['superadmin', 'operator'], 'cron'), async (req, res) => {
  try {
    const { schedule, command } = req.body || {};
    if (!schedule || !command) {
      return res.status(400).json({ success: false, error: 'Both schedule and command are required.' });
    }

    const job = cronEngine.addCronJob(schedule, command);

    auditLogger.logEvent({
      action: 'CRON_JOB_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: command,
      payload: { schedule, command },
      severity: 'INFO'
    });

    res.status(201).json({
      success: true,
      message: 'Cron job scheduled successfully.',
      job
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/cron
 * Removes an existing cron job from the system crontab.
 */
router.delete('/', requireRole(['superadmin', 'operator'], 'cron'), async (req, res) => {
  try {
    const command = req.body?.command || req.query.command;
    if (!command) {
      return res.status(400).json({ success: false, error: 'Command to delete is required.' });
    }

    const deleted = cronEngine.deleteCronJob(command);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Target cron job was not found in crontab.' });
    }

    auditLogger.logEvent({
      action: 'CRON_JOB_DELETE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: command,
      payload: { command },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: 'Cron job removed successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/cron/history
 * Returns the last 100 job execution logs from SQLite cron_history table.
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const history = cronEngine.getCronHistory(limit);
    res.json({
      success: true,
      history
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/cron/run
 * Immediately triggers a command and streams standard output and errors via chunked transfer.
 */
router.post('/run', requireRole(['superadmin', 'operator'], 'cron'), (req, res) => {
  const { command } = req.body || {};
  if (!command || typeof command !== 'string' || !command.trim()) {
    return res.status(400).send('Error: A valid command is required to run.\n');
  }

  const cleanCmd = command.trim();

  // Set HTTP chunked streaming headers (not SSE)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  res.write(`[NexusControl] Initiating live execution: ${cleanCmd}\n`);
  res.write(`[NexusControl] Started at: ${new Date().toISOString()}\n`);
  res.write('------------------------------------------------------------\n\n');

  const startTime = Date.now();
  let stdoutData = '';
  let stderrData = '';

  const child = spawn(cleanCmd, {
    shell: true,
    env: process.env
  });

  child.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString();
    res.write(chunk);
  });

  child.stderr.on('data', (chunk) => {
    stderrData += chunk.toString();
    res.write(chunk);
  });

  child.on('error', (err) => {
    const durationMs = Date.now() - startTime;
    const errMsg = `\n[NexusControl Execution Error]: ${err.message}\n`;
    stderrData += errMsg;
    res.write(errMsg);

    try {
      db.recordCronExecution(cleanCmd, 1, stdoutData, stderrData, durationMs);
    } catch {}

    res.end();
  });

  child.on('close', (code, signal) => {
    const durationMs = Date.now() - startTime;
    const exitCode = typeof code === 'number' ? code : (signal ? 128 : 0);

    res.write(`\n------------------------------------------------------------\n`);
    res.write(`[NexusControl] Process exited with code ${exitCode} in ${durationMs}ms\n`);

    try {
      db.recordCronExecution(cleanCmd, exitCode, stdoutData, stderrData, durationMs);
    } catch (dbErr) {
      console.error('[cronRouter] Failed to record run history:', dbErr.message);
    }

    res.end();
  });

  req.on('close', () => {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  });
});

module.exports = router;
