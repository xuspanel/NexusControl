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

/**
 * POST /api/postgres/databases/:dbName/tables/:tableName/data/row
 * Inserts a new row with parameterized values
 */
router.post('/databases/:dbName/tables/:tableName/data/row', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', row } = req.body || {};
    const newRow = await postgresEngine.insertTableRow(req.params.dbName, req.params.tableName, {
      schema,
      row
    });

    auditLogger.logEvent({
      action: 'POSTGRES_ROW_INSERT',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName, row: newRow },
      severity: 'INFO'
    });

    res.status(201).json({ success: true, message: 'Row inserted successfully.', row: newRow });
  } catch (err) {
    res.status(err.message.includes('required') || err.message.includes('Invalid') ? 400 : 500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/postgres/databases/:dbName/tables/:tableName/export/sql
 * Generates and downloads SQL INSERT statements for table data
 */
router.get('/databases/:dbName/tables/:tableName/export/sql', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const { schema = 'public' } = req.query;
    const sqlContent = await postgresEngine.exportTableSql(req.params.dbName, req.params.tableName, schema);

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.tableName}_export.sql"`);
    res.send(sqlContent);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

/**
 * POST /api/postgres/databases/:dbName/tables/:tableName/import
 * Imports CSV text or raw SQL text into the table
 */
router.post('/databases/:dbName/tables/:tableName/import', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', format = 'sql', content } = req.body || {};
    const result = await postgresEngine.importTableData(req.params.dbName, req.params.tableName, {
      schema,
      format,
      content
    });

    auditLogger.logEvent({
      action: 'POSTGRES_DATA_IMPORT',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName, format, count: result.count },
      severity: 'WARNING'
    });

    res.json({ success: true, message: 'Data imported successfully.', ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// E. Table Maintenance Operations
// ==========================================

/**
 * PUT /api/postgres/databases/:dbName/tables/:tableName/rename
 * Renames table
 */
router.put('/databases/:dbName/tables/:tableName/rename', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', newName } = req.body || {};
    const result = await postgresEngine.renameTable(req.params.dbName, req.params.tableName, newName, schema);

    auditLogger.logEvent({
      action: 'POSTGRES_TABLE_RENAME',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, oldName: req.params.tableName, newName },
      severity: 'WARNING'
    });

    res.json({ success: true, message: `Table renamed to "${newName}".`, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/postgres/databases/:dbName/tables/:tableName/duplicate
 * Duplicates table with structure and data
 */
router.post('/databases/:dbName/tables/:tableName/duplicate', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', newName } = req.body || {};
    const result = await postgresEngine.duplicateTable(req.params.dbName, req.params.tableName, newName, schema);

    auditLogger.logEvent({
      action: 'POSTGRES_TABLE_DUPLICATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${newName}`,
      payload: { database: req.params.dbName, sourceTable: req.params.tableName, newTable: newName },
      severity: 'INFO'
    });

    res.status(201).json({ success: true, message: `Table duplicated as "${newName}".`, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/postgres/databases/:dbName/tables/:tableName/truncate
 * Truncates table and restarts identity
 */
router.post('/databases/:dbName/tables/:tableName/truncate', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public' } = req.body || {};
    const result = await postgresEngine.truncateTable(req.params.dbName, req.params.tableName, schema);

    auditLogger.logEvent({
      action: 'POSTGRES_TABLE_TRUNCATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName },
      severity: 'WARNING'
    });

    res.json({ success: true, message: `Table "${req.params.tableName}" truncated.`, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/postgres/databases/:dbName/tables/:tableName/vacuum
 * Runs VACUUM ANALYZE on table
 */
router.post('/databases/:dbName/tables/:tableName/vacuum', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public' } = req.body || {};
    const result = await postgresEngine.vacuumTable(req.params.dbName, req.params.tableName, schema);

    auditLogger.logEvent({
      action: 'POSTGRES_TABLE_VACUUM',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName },
      severity: 'INFO'
    });

    res.json({ success: true, message: `VACUUM ANALYZE completed on "${req.params.tableName}".`, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/postgres/databases/:dbName/tables/:tableName/comment
 * Updates or removes table comment
 */
router.put('/databases/:dbName/tables/:tableName/comment', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', comment } = req.body || {};
    const result = await postgresEngine.commentTable(req.params.dbName, req.params.tableName, comment, schema);

    auditLogger.logEvent({
      action: 'POSTGRES_TABLE_COMMENT',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: { database: req.params.dbName, table: req.params.tableName, comment },
      severity: 'INFO'
    });

    res.json({ success: true, message: 'Table comment updated.', ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/postgres/databases/:dbName/tables/:tableName/schema/batch
 * Advanced Schema Mutation Engine: handles column additions, alterations, drops, and reorder table recreation
 */
router.patch('/databases/:dbName/tables/:tableName/schema/batch', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { schema = 'public', operations = [], reorder = false, newColumns = [] } = req.body || {};
    const result = await postgresEngine.batchSchemaMutation(req.params.dbName, req.params.tableName, {
      schema,
      operations,
      reorder,
      newColumns
    });

    auditLogger.logEvent({
      action: 'POSTGRES_SCHEMA_BATCH_MUTATION',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${schema}.${req.params.tableName}`,
      payload: {
        database: req.params.dbName,
        table: req.params.tableName,
        operationsCount: operations.length,
        reordered: reorder
      },
      severity: 'WARNING'
    });

    res.json({ success: true, message: 'Schema batch modifications applied successfully.', ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// F. SQL Terminal & Global Search
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
