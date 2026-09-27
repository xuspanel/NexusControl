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

    auditLogger.logEvent({
      action: 'POSTGRES_DB_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.name,
      payload: { database: result.name, owner: owner || 'default' },
      severity: 'INFO'
    });

    res.status(201).json({
      success: true,
      message: `Database "${result.name}" created successfully.`,
      database: result.name
    });
  } catch (err) {
    const isValidationError = err.message.includes('Invalid') || err.message.includes('required');
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

    auditLogger.logEvent({
      action: 'POSTGRES_DB_DROP',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.name,
      payload: { database: result.name },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: `Database "${result.name}" dropped successfully.`,
      database: result.name
    });
  } catch (err) {
    const isProtected = err.message.includes('Cannot drop protected');
    const isValidationError = err.message.includes('Invalid');
    res.status(isProtected || isValidationError ? 400 : 500).json({ success: false, error: err.message });
  }
});

// ==========================================
// A. Database Config & Deep Introspection
// ==========================================

/**
 * GET /api/postgres/databases/:dbName/config
 * Retrieves owner, connection limits, comments, and live active connections
 */
router.get('/databases/:dbName/config', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const config = await postgresEngine.getDatabaseConfig(req.params.dbName);
    res.json({ success: true, config });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/postgres/databases/:dbName/config
 * Updates database owner, connection limit, or description comment
 */
router.put('/databases/:dbName/config', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const updated = await postgresEngine.updateDatabaseConfig(req.params.dbName, req.body || {});

    auditLogger.logEvent({
      action: 'POSTGRES_DB_CONFIG_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: req.params.dbName,
      payload: { database: req.params.dbName, updates: req.body },
      severity: 'INFO'
    });

    res.json({ success: true, message: 'Database configuration updated successfully.', config: updated });
  } catch (err) {
    res.status(err.message.includes('Invalid') ? 400 : 500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/postgres/databases/:dbName/privileges
 * Queries role table grants
 */
router.get('/databases/:dbName/privileges', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const privileges = await postgresEngine.getDatabasePrivileges(req.params.dbName);
    res.json({ success: true, privileges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/postgres/databases/:dbName/triggers
 * Queries triggers on tables
 */
router.get('/databases/:dbName/triggers', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const triggers = await postgresEngine.getDatabaseTriggers(req.params.dbName);
    res.json({ success: true, triggers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/postgres/databases/:dbName/relations
 * Queries foreign keys and table constraints
 */
router.get('/databases/:dbName/relations', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const relations = await postgresEngine.getDatabaseRelations(req.params.dbName);
    res.json({ success: true, relations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// B. Table & View Management
// ==========================================

/**
 * GET /api/postgres/databases/:dbName/tables
 * Lists tables, views, materialized views, sizes, and row estimates
 */
router.get('/databases/:dbName/tables', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const tables = await postgresEngine.listTables(req.params.dbName);
    res.json({ success: true, tables });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/postgres/databases/:dbName/tables/create
 * Generates and executes CREATE TABLE DDL
 */
router.post('/databases/:dbName/tables/create', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const result = await postgresEngine.createTable(req.params.dbName, req.body || {});

    auditLogger.logEvent({
      action: 'POSTGRES_TABLE_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${result.schema}.${result.name}`,
      payload: { database: req.params.dbName, table: result.name, schema: result.schema },
      severity: 'INFO'
    });

    res.status(201).json({ success: true, message: `Table "${result.name}" created successfully.`, table: result });
  } catch (err) {
    res.status(err.message.includes('required') || err.message.includes('Invalid') ? 400 : 500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/postgres/databases/:dbName/views/create
 * Generates and executes CREATE VIEW DDL
 */
router.post('/databases/:dbName/views/create', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const result = await postgresEngine.createView(req.params.dbName, req.body || {});

    auditLogger.logEvent({
      action: 'POSTGRES_VIEW_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${result.schema}.${result.name}`,
      payload: { database: req.params.dbName, view: result.name, type: result.type },
      severity: 'INFO'
    });

    res.status(201).json({ success: true, message: `View "${result.name}" created successfully.`, view: result });
  } catch (err) {
    res.status(err.message.includes('required') || err.message.includes('Invalid') ? 400 : 500).json({
      success: false,
      error: err.message
    });
  }
});

// ==========================================
// C. Database Dump Engine
// ==========================================

/**
 * GET /api/postgres/databases/:dbName/dump
 * Streams a raw pg_dump directly to the client without buffering
 */
router.get('/databases/:dbName/dump', requireRole(['superadmin', 'operator'], 'database'), (req, res) => {
  const { type = 'full' } = req.query;

  auditLogger.logEvent({
    action: 'POSTGRES_DB_DUMP',
    user: req.user?.username || 'system',
    ip: req.clientIp || req.ip,
    userAgent: req.headers['user-agent'],
    targetResource: req.params.dbName,
    payload: { database: req.params.dbName, type },
    severity: 'INFO'
  });

  try {
    postgresEngine.streamDatabaseDump(req.params.dbName, type, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// ==========================================
// D. Dynamic Data Grid & Inline CRUD
// ==========================================

/**
 * GET /api/postgres/databases/:dbName/tables/:tableName/data
 * Paginated table rows and count
 */
router.get('/databases/:dbName/tables/:tableName/data', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', limit = 50, offset = 0, orderBy, orderDir } = req.query;
    const result = await postgresEngine.getTableData(req.params.dbName, req.params.tableName, {
      schema,
      limit,
      offset,
      orderBy,
      orderDir
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/postgres/databases/:dbName/tables/:tableName/config
 * Table column definitions, types, defaults, and primary key status
 */
router.get('/databases/:dbName/tables/:tableName/config', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const { schema = 'public' } = req.query;
    const columns = await postgresEngine.getTableConfig(req.params.dbName, req.params.tableName, schema);
    res.json({ success: true, columns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/postgres/databases/:dbName/tables/:tableName/data
 * Inline Edit Safety: Updates row using dynamically detected Primary Key(s) in WHERE clause
 */
router.put('/databases/:dbName/tables/:tableName/data', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', primaryKeys, updates } = req.body || {};
    const updatedRow = await postgresEngine.updateTableRow(req.params.dbName, req.params.tableName, {
      schema,
      primaryKeys,
      updates
    });

    auditLogger.logEvent({
      action: 'POSTGRES_ROW_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName, primaryKeys, updates },
      severity: 'INFO'
    });

    res.json({ success: true, message: 'Row updated successfully.', row: updatedRow });
  } catch (err) {
    res.status(err.message.includes('required') || err.message.includes('Primary Key') ? 400 : 500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/postgres/databases/:dbName/tables/:tableName/data
 * Deletes a row safely via primary key
 */
router.delete('/databases/:dbName/tables/:tableName/data', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', primaryKeys } = req.body || {};
    const result = await postgresEngine.deleteTableRow(req.params.dbName, req.params.tableName, {
      schema,
      primaryKeys
    });

    auditLogger.logEvent({
      action: 'POSTGRES_ROW_DELETE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName, primaryKeys },
      severity: 'WARNING'
    });

    res.json({ success: true, message: 'Row deleted successfully.', ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// E. SQL Terminal & Global Search
// ==========================================

/**
 * POST /api/postgres/query
 * Executes an arbitrary SQL query string on a target database and returns tabular results
 */
router.post('/query', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  const { dbName, sql } = req.body || {};
  if (!dbName || !sql) {
    return res.status(400).json({ success: false, error: 'Database name and SQL query are required.' });
  }

  try {
    const result = await postgresEngine.executeQuery(dbName, sql);

    auditLogger.logEvent({
      action: 'POSTGRES_QUERY_EXECUTE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: dbName,
      payload: { database: dbName, sql: sql.slice(0, 500), durationMs: result.durationMs },
      severity: 'INFO'
    });

    res.json({ success: true, ...result });
  } catch (err) {
    // Return clean Postgres error details
    res.status(400).json({
      success: false,
      error: err.message,
      code: err.code,
      position: err.position,
      detail: err.detail,
      hint: err.hint
    });
  }
});

/**
 * GET /api/postgres/databases/:dbName/search
 * Global text search across all varchar/text columns in user tables
 */
router.get('/databases/:dbName/search', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.json({ success: true, matches: [], totalMatches: 0 });
  }

  try {
    const result = await postgresEngine.globalSearch(req.params.dbName, query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
