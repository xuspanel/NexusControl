const express = require('express');
const router = express.Router();
const postgresEngine = require('./postgresEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

/**
 * GET /api/postgres/status
 * Returns whether PostgreSQL is installed, active, and connection pool status.
 */
router.get('/status', async (req, res) => {
  try {
    const status = await postgresEngine.getStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/postgres/databases
 * Lists all databases on the PostgreSQL instance, excluding templates.
 */
router.get('/databases', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const databases = await postgresEngine.listDatabases();
    res.json({ success: true, databases });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/postgres/databases
 * Creates a new PostgreSQL database.
 */
router.post('/databases', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  const { name, owner } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Database name is required.' });
  }

  try {
    const result = await postgresEngine.createDatabase(name.trim(), owner);

    // Cryptographic audit ledger
    auditLogger.logEvent({
      action: 'POSTGRES_DB_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.name,
      payload: {
        database: result.name,
        owner: owner || 'default'
      },
      severity: 'INFO'
    });

    res.status(201).json({
      success: true,
      message: `Database "${result.name}" created successfully.`,
      database: result.name
    });
  } catch (err) {
    const isValidationError = err.message.includes('Invalid database name') || err.message.includes('required');
    res.status(isValidationError ? 400 : 500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/postgres/databases/:name
 * Drops a PostgreSQL database.
 */
router.delete('/databases/:name', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  const { name } = req.params;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Database name is required.' });
  }

  try {
    const result = await postgresEngine.dropDatabase(name.trim());

    // Cryptographic audit ledger
    auditLogger.logEvent({
      action: 'POSTGRES_DB_DROP',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.name,
      payload: {
        database: result.name
      },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: `Database "${result.name}" dropped successfully.`,
      database: result.name
    });
  } catch (err) {
    const isProtected = err.message.includes('Cannot drop protected');
    const isValidationError = err.message.includes('Invalid database name');
    res.status(isProtected || isValidationError ? 400 : 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
