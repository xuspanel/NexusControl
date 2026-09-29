const express = require('express');
const router = express.Router();
const mysqlEngine = require('./mysqlEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

/**
 * GET /api/mysql/status
 * Returns whether MySQL/MariaDB is installed, active, and connection pool status.
 */
router.get('/status', async (req, res) => {
  try {
    const status = await mysqlEngine.getStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases
 * Lists all user databases on the MySQL instance, excluding system catalogs.
 */
router.get('/databases', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const databases = await mysqlEngine.listDatabases();
    res.json({ success: true, databases });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases
 * Creates a new MySQL database catalog.
 */
router.post('/databases', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  const { name, charset, collation } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Database name is required.' });
  }

  try {
    const result = await mysqlEngine.createDatabase(name.trim(), charset, collation);

    auditLogger.logEvent({
      action: 'MYSQL_DB_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.name,
      payload: { database: result.name, charset, collation },
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
 * DELETE /api/mysql/databases/:name
 * Drops a MySQL database.
 */
router.delete('/databases/:name', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  const { name } = req.params;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Database name is required.' });
  }

  try {
    const result = await mysqlEngine.dropDatabase(name.trim());

    auditLogger.logEvent({
      action: 'MYSQL_DB_DROP',
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
    const isProtected = err.message.includes('Cannot drop system database');
    const isValidationError = err.message.includes('Invalid');
    res.status(isProtected || isValidationError ? 400 : 500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/config
 * Retrieves configuration (charset, collation) for a database.
 */
router.get('/databases/:dbName/config', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const config = await mysqlEngine.getDatabaseConfig(req.params.dbName);
    res.json({ success: true, config });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/mysql/databases/:dbName/config
 * Updates configuration (charset, collation) for a database.
 */
router.put('/databases/:dbName/config', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const result = await mysqlEngine.updateDatabaseConfig(req.params.dbName, req.body || {});
    auditLogger.logEvent({
      action: 'MYSQL_DB_CONFIG_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: req.params.dbName,
      payload: req.body,
      severity: 'NOTICE'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/privileges
 */
router.get('/databases/:dbName/privileges', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const privileges = await mysqlEngine.getDatabasePrivileges(req.params.dbName);
    res.json({ success: true, privileges });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/triggers
 */
router.get('/databases/:dbName/triggers', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const triggers = await mysqlEngine.getDatabaseTriggers(req.params.dbName);
    res.json({ success: true, triggers });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/relations
 */
router.get('/databases/:dbName/relations', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const relations = await mysqlEngine.getDatabaseRelations(req.params.dbName);
    res.json({ success: true, relations });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/tables
 */
router.get('/databases/:dbName/tables', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const data = await mysqlEngine.listTables(req.params.dbName);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/tables/create
 */
router.post('/databases/:dbName/tables/create', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { tableName, columns } = req.body || {};
    const result = await mysqlEngine.createTable(req.params.dbName, tableName, columns);
    auditLogger.logEvent({
      action: 'MYSQL_TABLE_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${tableName}`,
      payload: { tableName, columns },
      severity: 'INFO'
    });
    res.status(201).json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/views/create
 */
router.post('/databases/:dbName/views/create', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { viewName, query } = req.body || {};
    const result = await mysqlEngine.createView(req.params.dbName, viewName, query);
    auditLogger.logEvent({
      action: 'MYSQL_VIEW_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${viewName}`,
      payload: { viewName, query },
      severity: 'INFO'
    });
    res.status(201).json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/dump
 * Streams mysqldump directly to client
 */
router.get('/databases/:dbName/dump', requireRole(['superadmin', 'operator'], 'database'), (req, res) => {
  try {
    const { type = 'full' } = req.query;
    mysqlEngine.streamDatabaseDump(req.params.dbName, type, res);

    auditLogger.logEvent({
      action: 'MYSQL_DB_DUMP',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: req.params.dbName,
      payload: { type },
      severity: 'INFO'
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
});

/**
 * GET /api/mysql/databases/:dbName/tables/:tableName/data
 */
router.get('/databases/:dbName/tables/:tableName/data', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const { limit = 50, offset = 0, sortColumn, sortOrder = 'ASC', filterText } = req.query;
    const data = await mysqlEngine.getTableData(req.params.dbName, req.params.tableName, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      sortColumn,
      sortOrder,
      filterText
    });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/tables/:tableName/config
 */
router.get('/databases/:dbName/tables/:tableName/config', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const config = await mysqlEngine.getTableConfig(req.params.dbName, req.params.tableName);
    res.json({ success: true, columns: config.columns, config });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/mysql/databases/:dbName/tables/:tableName/data
 * Inline cell update
 */
router.put('/databases/:dbName/tables/:tableName/data', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { primaryKeys, updates, primaryKey, pkValue, updatedFields } = req.body || {};
    const result = await mysqlEngine.updateTableRow(
      req.params.dbName,
      req.params.tableName,
      primaryKeys ? { primaryKeys, updates: updates || updatedFields } : primaryKey,
      pkValue,
      updatedFields || updates
    );
    auditLogger.logEvent({
      action: 'MYSQL_ROW_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { primaryKeys: primaryKeys || { [primaryKey]: pkValue }, updates: updates || updatedFields },
      severity: 'NOTICE'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/mysql/databases/:dbName/tables/:tableName/data
 * Multi-row bulk deletion
 */
router.delete('/databases/:dbName/tables/:tableName/data', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { primaryKeys, primaryKey, pkValues } = req.body || {};
    const result = await mysqlEngine.deleteTableRow(
      req.params.dbName,
      req.params.tableName,
      primaryKeys ? { primaryKeys } : primaryKey,
      pkValues
    );
    auditLogger.logEvent({
      action: 'MYSQL_ROW_DELETE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { primaryKeys: primaryKeys || primaryKey },
      severity: 'WARNING'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/tables/:tableName/data/row
 * Single row insertion
 */
router.post('/databases/:dbName/tables/:tableName/data/row', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const rowData = (req.body && req.body.row) ? req.body.row : (req.body || {});
    const result = await mysqlEngine.insertTableRow(req.params.dbName, req.params.tableName, rowData);
    auditLogger.logEvent({
      action: 'MYSQL_ROW_INSERT',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { insertId: result.insertId },
      severity: 'INFO'
    });
    res.status(201).json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/tables/:tableName/export/sql
 */
router.get('/databases/:dbName/tables/:tableName/export/sql', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const sql = await mysqlEngine.exportTableSql(req.params.dbName, req.params.tableName);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.tableName}_export_${Date.now()}.sql"`);
    res.send(sql);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/tables/:tableName/import
 */
router.post('/databases/:dbName/tables/:tableName/import', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { content, format } = req.body || {};
    const result = await mysqlEngine.importTableData(req.params.dbName, req.params.tableName, content, format);
    auditLogger.logEvent({
      action: 'MYSQL_DATA_IMPORT',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { format, count: result.count },
      severity: 'INFO'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/mysql/databases/:dbName/tables/:tableName/rename
 */
router.put('/databases/:dbName/tables/:tableName/rename', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { newName } = req.body || {};
    const result = await mysqlEngine.renameTable(req.params.dbName, req.params.tableName, newName);
    auditLogger.logEvent({
      action: 'MYSQL_TABLE_RENAME',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { newName },
      severity: 'NOTICE'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/tables/:tableName/duplicate
 */
router.post('/databases/:dbName/tables/:tableName/duplicate', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { newTable, withData = false } = req.body || {};
    const result = await mysqlEngine.duplicateTable(req.params.dbName, req.params.tableName, newTable, withData);
    auditLogger.logEvent({
      action: 'MYSQL_TABLE_DUPLICATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { newTable, withData },
      severity: 'INFO'
    });
    res.status(201).json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/tables/:tableName/truncate
 */
router.post('/databases/:dbName/tables/:tableName/truncate', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const result = await mysqlEngine.truncateTable(req.params.dbName, req.params.tableName);
    auditLogger.logEvent({
      action: 'MYSQL_TABLE_TRUNCATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      severity: 'WARNING'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/databases/:dbName/tables/:tableName/optimize
 * (also aliased to /vacuum for compatibility)
 */
const handleOptimize = async (req, res) => {
  try {
    const result = await mysqlEngine.optimizeTable(req.params.dbName, req.params.tableName);
    auditLogger.logEvent({
      action: 'MYSQL_TABLE_OPTIMIZE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      severity: 'INFO'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
router.post('/databases/:dbName/tables/:tableName/optimize', requireRole(['superadmin', 'operator'], 'database'), handleOptimize);
router.post('/databases/:dbName/tables/:tableName/vacuum', requireRole(['superadmin', 'operator'], 'database'), handleOptimize);

/**
 * PUT /api/mysql/databases/:dbName/tables/:tableName/comment
 */
router.put('/databases/:dbName/tables/:tableName/comment', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { comment } = req.body || {};
    const result = await mysqlEngine.commentTable(req.params.dbName, req.params.tableName, comment);
    auditLogger.logEvent({
      action: 'MYSQL_TABLE_COMMENT',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { comment },
      severity: 'NOTICE'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/mysql/databases/:dbName/tables/:tableName/schema/batch
 * Batch schema mutation using native column reordering and transactions
 */
router.patch('/databases/:dbName/tables/:tableName/schema/batch', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const result = await mysqlEngine.batchSchemaMutation(req.params.dbName, req.params.tableName, req.body || {});
    auditLogger.logEvent({
      action: 'MYSQL_SCHEMA_BATCH_MUTATION',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${req.params.dbName}.${req.params.tableName}`,
      payload: { operationsCount: (req.body?.operations || []).length, reorder: req.body?.reorder },
      severity: 'NOTICE'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mysql/query
 * Raw interactive SQL execution with query timing
 */
router.post('/query', requireRole(['superadmin', 'operator'], 'database'), async (req, res) => {
  try {
    const { dbName = 'mysql', query, sql } = req.body || {};
    const queryString = (query || sql || '').trim();
    if (!queryString) {
      return res.status(400).json({ success: false, error: 'Query string is required.' });
    }

    const result = await mysqlEngine.executeQuery(dbName, queryString);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mysql/databases/:dbName/search
 * Global cross-table text search
 */
router.get('/databases/:dbName/search', requireRole(['superadmin', 'operator', 'viewer'], 'database'), async (req, res) => {
  try {
    const term = req.query.query || req.query.term;
    if (!term || typeof term !== 'string' || !term.trim()) {
      return res.json({ success: true, matches: [], totalMatches: 0, searchTerm: '' });
    }

    const result = await mysqlEngine.globalSearch(req.params.dbName, term.trim());
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
