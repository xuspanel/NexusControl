const mysql = require('mysql2/promise');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let defaultPool = null;
const dbPools = new Map();

/**
 * Checks if mysql or mariadb binary is available on the system PATH
 */
function isMysqlInstalled() {
  try {
    execSync('command -v mysql 2>/dev/null || command -v mariadb 2>/dev/null', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a MySQL identifier (database, table, column name)
 * to guard against SQL injection while allowing standard alphanumeric/underscore identifiers.
 */
function validateIdentifier(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Identifier name is required.');
  }
  const cleanName = name.trim();
  const identifierRegex = /^[a-zA-Z0-9_$]{1,64}$/;
  if (!identifierRegex.test(cleanName)) {
    throw new Error(
      `Invalid identifier "${cleanName}". Must contain only alphanumeric characters, underscores, and $ (max 64 characters).`
    );
  }
  return cleanName;
}

/**
 * Parses MySQL / MariaDB connection URI from process.env or initializes fallback.
 */
function getSuperUri() {
  return process.env.MYSQL_SUPER_URI || 'mysql://nexuscontrol:nexus_pass_123@127.0.0.1:3306/mysql';
}

/**
 * Securely bootstraps a dedicated NexusControl superuser with password authentication,
 * writes the MYSQL_SUPER_URI connection string to .env, and initializes the connection pool.
 */
function initMysqlSuperuser() {
  try {
    if (!isMysqlInstalled()) {
      console.log('[MySQL] mysql/mariadb not found on host PATH.');
      return false;
    }

    let mysqlUri = process.env.MYSQL_SUPER_URI;
    if (!mysqlUri) {
      console.log('[MySQL] Bootstrapping NexusControl Superuser...');
      const pwd = crypto.randomBytes(16).toString('hex');
      const clientCmd = execSync('command -v mariadb 2>/dev/null || command -v mysql 2>/dev/null', {
        encoding: 'utf8'
      }).trim();

      try {
        const sqlCmds = `
          CREATE USER IF NOT EXISTS 'nexuscontrol'@'localhost' IDENTIFIED BY '${pwd}';
          GRANT ALL PRIVILEGES ON *.* TO 'nexuscontrol'@'localhost' WITH GRANT OPTION;
          CREATE USER IF NOT EXISTS 'nexuscontrol'@'127.0.0.1' IDENTIFIED BY '${pwd}';
          GRANT ALL PRIVILEGES ON *.* TO 'nexuscontrol'@'127.0.0.1' WITH GRANT OPTION;
          FLUSH PRIVILEGES;
        `;
        execSync(`sudo ${clientCmd} -e "${sqlCmds.replace(/\n/g, ' ')}"`, { stdio: 'ignore', timeout: 8000 });
      } catch (err) {
        console.warn('[MySQL] Failed to execute sudo user creation:', err.message);
      }

      mysqlUri = `mysql://nexuscontrol:${pwd}@127.0.0.1:3306/mysql`;

      const backendEnvPath = path.resolve(__dirname, '.env');
      if (fs.existsSync(backendEnvPath)) {
        const content = fs.readFileSync(backendEnvPath, 'utf8');
        if (!content.includes('MYSQL_SUPER_URI=')) {
          fs.appendFileSync(backendEnvPath, `\nMYSQL_SUPER_URI=${mysqlUri}\n`);
        }
      }

      const rootEnvPath = path.resolve(__dirname, '../.env');
      if (fs.existsSync(rootEnvPath)) {
        const content = fs.readFileSync(rootEnvPath, 'utf8');
        if (!content.includes('MYSQL_SUPER_URI=')) {
          fs.appendFileSync(rootEnvPath, `\nMYSQL_SUPER_URI=${mysqlUri}\n`);
        }
      }

      process.env.MYSQL_SUPER_URI = mysqlUri;
      console.log('[MySQL] NexusControl Superuser bootstrapped successfully.');
    }

    if (!defaultPool) {
      defaultPool = mysql.createPool({
        uri: mysqlUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });
    }

    return true;
  } catch (err) {
    console.error('[MySQL] Bootstrap failure:', err.message);
    return false;
  }
}

/**
 * Returns default system connection pool.
 */
function getPool() {
  if (!defaultPool) {
    const uri = getSuperUri();
    defaultPool = mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  }
  return defaultPool;
}

/**
 * Returns or dynamically creates a connection pool bound to a specific database catalog.
 */
function getDbPool(dbName) {
  const cleanDb = validateIdentifier(dbName);
  if (dbPools.has(cleanDb)) {
    return dbPools.get(cleanDb);
  }

  const baseUri = getSuperUri();
  const url = new URL(baseUri);
  url.pathname = '/' + cleanDb;

  const pool = mysql.createPool({
    uri: url.toString(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  dbPools.set(cleanDb, pool);
  return pool;
}

/**
 * Format bytes into human-readable size
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Checks MySQL server availability, version, and connections
 */
async function getStatus() {
  try {
    const pool = getPool();
    const [versionRows] = await pool.query('SELECT VERSION() as version, @@hostname as hostname');
    const [connRows] = await pool.query("SHOW STATUS WHERE Variable_name IN ('Threads_connected', 'Uptime', 'Questions')");

    const stats = {};
    for (const row of connRows) {
      stats[row.Variable_name] = row.Value;
    }

    const [dbRows] = await pool.query(
      "SELECT COUNT(*) as count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')"
    );

    return {
      available: true,
      isInstalled: true,
      version: versionRows[0]?.version || 'Unknown',
      hostname: versionRows[0]?.hostname || 'localhost',
      uptime: stats.Uptime ? `${Math.floor(stats.Uptime / 3600)}h ${Math.floor((stats.Uptime % 3600) / 60)}m` : '0m',
      openConnections: parseInt(stats.Threads_connected || '1', 10),
      databasesCount: parseInt(dbRows[0]?.count || '0', 10)
    };
  } catch (err) {
    return {
      available: false,
      isInstalled: isMysqlInstalled(),
      error: err.message
    };
  }
}

/**
 * Lists user databases with size, table count, charset, and collation.
 */
async function listDatabases() {
  const pool = getPool();
  const [dbs] = await pool.query(`
    SELECT 
      s.SCHEMA_NAME AS name,
      s.DEFAULT_CHARACTER_SET_NAME AS charset,
      s.DEFAULT_COLLATION_NAME AS collation,
      COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS size_bytes,
      COUNT(t.TABLE_NAME) AS table_count
    FROM information_schema.SCHEMATA s
    LEFT JOIN information_schema.TABLES t ON s.SCHEMA_NAME = t.TABLE_SCHEMA
    WHERE s.SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    GROUP BY s.SCHEMA_NAME, s.DEFAULT_CHARACTER_SET_NAME, s.DEFAULT_COLLATION_NAME
    ORDER BY s.SCHEMA_NAME ASC
  `);

  return dbs.map(d => ({
    name: d.name,
    charset: d.charset,
    collation: d.collation,
    size: formatBytes(Number(d.size_bytes)),
    sizeBytes: Number(d.size_bytes),
    tableCount: Number(d.table_count)
  }));
}

/**
 * Creates a new database catalog.
 */
async function createDatabase(name, charset = 'utf8mb4', collation = 'utf8mb4_unicode_ci') {
  const cleanName = validateIdentifier(name);
  const cleanCharset = charset.replace(/[^a-zA-Z0-9_]/g, '');
  const cleanCollation = collation.replace(/[^a-zA-Z0-9_]/g, '');

  const pool = getPool();
  await pool.query(`CREATE DATABASE \`${cleanName}\` CHARACTER SET ${cleanCharset} COLLATE ${cleanCollation}`);
  return { success: true, name: cleanName };
}

/**
 * Drops a database catalog and closes its cached pool.
 */
async function dropDatabase(name) {
  const cleanName = validateIdentifier(name);
  if (['information_schema', 'mysql', 'performance_schema', 'sys'].includes(cleanName.toLowerCase())) {
    throw new Error(`Cannot drop protected system database "${cleanName}".`);
  }

  if (dbPools.has(cleanName)) {
    try {
      await dbPools.get(cleanName).end();
    } catch (_) {}
    dbPools.delete(cleanName);
  }

  const pool = getPool();
  await pool.query(`DROP DATABASE \`${cleanName}\``);
  return { success: true, name: cleanName };
}

/**
 * Retrieves character set and collation configuration for a database.
 */
async function getDatabaseConfig(dbName) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [cleanDb]
  );
  if (rows.length === 0) {
    throw new Error(`Database "${cleanDb}" not found.`);
  }
  return rows[0];
}

/**
 * Updates default character set and collation on a database.
 */
async function updateDatabaseConfig(dbName, { charset, collation }) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();
  let ddl = `ALTER DATABASE \`${cleanDb}\``;
  if (charset) {
    ddl += ` CHARACTER SET ${charset.replace(/[^a-zA-Z0-9_]/g, '')}`;
  }
  if (collation) {
    ddl += ` COLLATE ${collation.replace(/[^a-zA-Z0-9_]/g, '')}`;
  }
  await pool.query(ddl);
  return { success: true, dbName: cleanDb };
}

/**
 * Retrieves database level privileges / users
 */
async function getDatabasePrivileges(dbName) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT GRANTEE as grantee, TABLE_SCHEMA as db_name, PRIVILEGE_TYPE as privilege_type, IS_GRANTABLE as is_grantable FROM information_schema.SCHEMA_PRIVILEGES WHERE TABLE_SCHEMA = ?',
      [cleanDb]
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Retrieves triggers defined on tables in the database.
 */
async function getDatabaseTriggers(dbName) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      TRIGGER_NAME AS name, 
      EVENT_MANIPULATION AS event, 
      ACTION_TIMING AS timing, 
      EVENT_OBJECT_TABLE AS table_name, 
      ACTION_STATEMENT AS statement 
    FROM information_schema.TRIGGERS 
    WHERE TRIGGER_SCHEMA = ?`,
    [cleanDb]
  );
  return rows;
}

/**
 * Retrieves foreign key relationships defined across tables.
 */
async function getDatabaseRelations(dbName) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      CONSTRAINT_NAME AS constraint_name, 
      TABLE_NAME AS table_name, 
      COLUMN_NAME AS column_name, 
      REFERENCED_TABLE_NAME AS foreign_table_name, 
      REFERENCED_COLUMN_NAME AS foreign_column_name 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [cleanDb]
  );
  return rows;
}

/**
 * Lists all base tables and views in a database.
 */
async function listTables(dbName) {
  const pool = getDbPool(dbName);
  const cleanDb = validateIdentifier(dbName);

  const [tableRows] = await pool.query(`SHOW FULL TABLES IN \`${cleanDb}\``);
  const [statsRows] = await pool.query(
    `SELECT 
      TABLE_NAME, 
      TABLE_TYPE, 
      ENGINE, 
      TABLE_ROWS, 
      DATA_LENGTH, 
      INDEX_LENGTH, 
      TABLE_COMMENT 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = ?`,
    [cleanDb]
  );

  const statsMap = new Map();
  for (const s of statsRows) {
    statsMap.set(s.TABLE_NAME, s);
  }

  const tables = [];
  const views = [];

  for (const row of tableRows) {
    const tableName = row[`Tables_in_${cleanDb}`] || Object.values(row)[0];
    const tableType = row.Table_type || Object.values(row)[1];
    const stat = statsMap.get(tableName) || {};

    const bytes = (Number(stat.DATA_LENGTH) || 0) + (Number(stat.INDEX_LENGTH) || 0);

    const item = {
      name: tableName,
      type: tableType === 'VIEW' ? 'view' : 'table',
      engine: stat.ENGINE || 'InnoDB',
      rowCount: Number(stat.TABLE_ROWS) || 0,
      size: formatBytes(bytes),
      sizeBytes: bytes,
      comment: stat.TABLE_COMMENT || ''
    };

    if (tableType === 'VIEW') {
      views.push(item);
    } else {
      tables.push(item);
    }
  }

  return { tables, views };
}

/**
 * Introspects column definitions, keys, and indexes for a table.
 */
async function getTableConfig(dbName, tableName) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  const [cols] = await pool.query(`SHOW FULL COLUMNS FROM \`${cleanTable}\``);
  const [indexes] = await pool.query(`SHOW INDEX FROM \`${cleanTable}\``);

  const primaryKeys = [];
  const columns = cols.map(c => {
    const isPk = c.Key === 'PRI';
    if (isPk) primaryKeys.push(c.Field);

    return {
      column_name: c.Field,
      data_type: c.Type,
      is_nullable: c.Null === 'YES',
      column_default: c.Default,
      is_primary_key: isPk,
      key: c.Key,
      extra: c.Extra,
      collation: c.Collation,
      comment: c.Comment
    };
  });

  return {
    tableName: cleanTable,
    columns,
    primaryKeys,
    indexes: indexes.map(idx => ({
      name: idx.Key_name,
      column: idx.Column_name,
      unique: idx.Non_unique === 0,
      type: idx.Index_type
    }))
  };
}

/**
 * Retrieves paginated tabular data with sorting and primary key identification.
 */
async function getTableData(dbName, tableName, { limit = 50, offset = 0, sortColumn, sortOrder = 'ASC', filterText } = {}) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);
  const config = await getTableConfig(dbName, tableName);

  let whereSql = '';
  const params = [];

  if (filterText && typeof filterText === 'string' && filterText.trim()) {
    const q = `%${filterText.trim()}%`;
    const searchClauses = config.columns.map(c => `\`${c.column_name}\` LIKE ?`);
    if (searchClauses.length > 0) {
      whereSql = `WHERE ${searchClauses.join(' OR ')}`;
      for (let i = 0; i < searchClauses.length; i++) {
        params.push(q);
      }
    }
  }

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM \`${cleanTable}\` ${whereSql}`, params);
  const total = Number(countRows[0]?.total || 0);

  let orderSql = '';
  if (sortColumn) {
    const cleanSort = validateIdentifier(sortColumn);
    const dir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    orderSql = `ORDER BY \`${cleanSort}\` ${dir}`;
  } else if (config.primaryKeys.length > 0) {
    orderSql = `ORDER BY \`${config.primaryKeys[0]}\` ASC`;
  }

  const queryParams = [...params, Number(limit), Number(offset)];
  const [rows] = await pool.query(
    `SELECT * FROM \`${cleanTable}\` ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    queryParams
  );

  return {
    rows,
    total,
    limit: Number(limit),
    offset: Number(offset),
    primaryKeys: config.primaryKeys,
    columns: config.columns
  };
}

/**
 * Inserts a single row into a table.
 */
async function insertTableRow(dbName, tableName, rowData) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  const keys = Object.keys(rowData).map(k => validateIdentifier(k));
  const values = Object.values(rowData);

  if (keys.length === 0) {
    throw new Error('Row data cannot be empty.');
  }

  const colsSql = keys.map(k => `\`${k}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');

  const [result] = await pool.query(
    `INSERT INTO \`${cleanTable}\` (${colsSql}) VALUES (${placeholders})`,
    values
  );

  return { success: true, insertId: result.insertId, affectedRows: result.affectedRows };
}

/**
 * Updates a table row identified by primary key.
 */
async function updateTableRow(dbName, tableName, primaryKeyOrObj, pkValueOrUpdates, updatedFieldsOpt) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  let primaryKeys = {};
  let updates = {};

  if (typeof primaryKeyOrObj === 'object' && primaryKeyOrObj !== null) {
    primaryKeys = primaryKeyOrObj.primaryKeys || primaryKeyOrObj;
    updates = primaryKeyOrObj.updates || primaryKeyOrObj.updatedFields || pkValueOrUpdates || {};
  } else if (typeof primaryKeyOrObj === 'string') {
    primaryKeys = { [primaryKeyOrObj]: pkValueOrUpdates };
    updates = updatedFieldsOpt || {};
  }

  const updateEntries = Object.entries(updates).filter(([k]) => !Object.prototype.hasOwnProperty.call(primaryKeys, k));
  const pkEntries = Object.entries(primaryKeys);

  if (updateEntries.length === 0) {
    return { success: true, affectedRows: 0 };
  }
  if (pkEntries.length === 0) {
    throw new Error('Primary key(s) are required for safe row update.');
  }

  const setClauses = updateEntries.map(([k]) => `\`${validateIdentifier(k)}\` = ?`).join(', ');
  const whereClauses = pkEntries.map(([k]) => `\`${validateIdentifier(k)}\` = ?`).join(' AND ');
  const values = [...updateEntries.map(([, v]) => v), ...pkEntries.map(([, v]) => v)];

  const [result] = await pool.query(
    `UPDATE \`${cleanTable}\` SET ${setClauses} WHERE ${whereClauses}`,
    values
  );

  return { success: true, affectedRows: result.affectedRows };
}

/**
 * Deletes rows identified by primary key values.
 */
async function deleteTableRow(dbName, tableName, primaryKeyOrObj, pkValuesOpt) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  let primaryKeys = {};
  if (typeof primaryKeyOrObj === 'object' && primaryKeyOrObj !== null) {
    primaryKeys = primaryKeyOrObj.primaryKeys || primaryKeyOrObj;
  } else if (typeof primaryKeyOrObj === 'string') {
    if (Array.isArray(pkValuesOpt)) {
      const cleanPk = validateIdentifier(primaryKeyOrObj);
      if (pkValuesOpt.length === 0) return { success: true, affectedRows: 0 };
      const placeholders = pkValuesOpt.map(() => '?').join(', ');
      const [result] = await pool.query(
        `DELETE FROM \`${cleanTable}\` WHERE \`${cleanPk}\` IN (${placeholders})`,
        pkValuesOpt
      );
      return { success: true, affectedRows: result.affectedRows };
    } else {
      primaryKeys = { [primaryKeyOrObj]: pkValuesOpt };
    }
  }

  const pkEntries = Object.entries(primaryKeys);
  if (pkEntries.length === 0) {
    throw new Error('Primary key(s) are required for safe row deletion.');
  }

  const whereClauses = pkEntries.map(([k]) => `\`${validateIdentifier(k)}\` = ?`).join(' AND ');
  const values = pkEntries.map(([, v]) => v);

  const [result] = await pool.query(
    `DELETE FROM \`${cleanTable}\` WHERE ${whereClauses}`,
    values
  );

  return { success: true, affectedRows: result.affectedRows };
}

/**
 * Exports table structure and records as SQL INSERT statements.
 */
async function exportTableSql(dbName, tableName) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  const [createRows] = await pool.query(`SHOW CREATE TABLE \`${cleanTable}\``);
  const createSql = createRows[0]?.['Create Table'] || createRows[0]?.['Create View'] || '';

  const [rows] = await pool.query(`SELECT * FROM \`${cleanTable}\``);
  let insertSql = '';

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]).map(k => `\`${k}\``).join(', ');
    const valueStatements = rows.map(r => {
      const vals = Object.values(r).map(v => {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return v;
        return `'${String(v).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
      });
      return `(${vals.join(', ')})`;
    });

    insertSql = `INSERT INTO \`${cleanTable}\` (${keys}) VALUES\n${valueStatements.join(',\n')};\n`;
  }

  return `DROP TABLE IF EXISTS \`${cleanTable}\`;\n${createSql};\n\n${insertSql}`;
}

/**
 * Parses RFC 4180 CSV content.
 */
function parseCsv(text) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (char === '\r') {
        // ignore CR
      } else if (char === '\n') {
        row.push(cell.trim());
        if (row.length > 0 && row.some(c => c !== '')) {
          lines.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.some(c => c !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

/**
 * Imports CSV or raw SQL data into a table.
 */
async function importTableData(dbName, tableName, content, format = 'csv') {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  if (format === 'sql') {
    const statements = content
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const sql of statements) {
        await conn.query(sql);
      }
      await conn.commit();
      return { success: true, count: statements.length };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // CSV
  const rows = parseCsv(content);
  if (rows.length < 2) {
    throw new Error('CSV must contain a header line and at least one data row.');
  }

  const headers = rows[0].map(h => validateIdentifier(h));
  const dataRows = rows.slice(1);

  const colsSql = headers.map(h => `\`${h}\``).join(', ');
  const placeholders = headers.map(() => '?').join(', ');
  const insertSql = `INSERT INTO \`${cleanTable}\` (${colsSql}) VALUES (${placeholders})`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const r of dataRows) {
      const vals = headers.map((_, idx) => (r[idx] === undefined || r[idx] === '' ? null : r[idx]));
      await conn.query(insertSql, vals);
    }
    await conn.commit();
    return { success: true, count: dataRows.length };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Renames a table.
 */
async function renameTable(dbName, oldName, newName) {
  const pool = getDbPool(dbName);
  const cleanOld = validateIdentifier(oldName);
  const cleanNew = validateIdentifier(newName);

  await pool.query(`RENAME TABLE \`${cleanOld}\` TO \`${cleanNew}\``);
  return { success: true, oldName: cleanOld, newName: cleanNew };
}

/**
 * Duplicates a table structure with optional data copying.
 */
async function duplicateTable(dbName, sourceTable, newTable, withData = false) {
  const pool = getDbPool(dbName);
  const cleanSource = validateIdentifier(sourceTable);
  const cleanNew = validateIdentifier(newTable);

  await pool.query(`CREATE TABLE \`${cleanNew}\` LIKE \`${cleanSource}\``);
  if (withData) {
    await pool.query(`INSERT INTO \`${cleanNew}\` SELECT * FROM \`${cleanSource}\``);
  }

  return { success: true, source: cleanSource, target: cleanNew, withData };
}

/**
 * Truncates all records from a table.
 */
async function truncateTable(dbName, tableName) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);
  await pool.query(`TRUNCATE TABLE \`${cleanTable}\``);
  return { success: true, table: cleanTable };
}

/**
 * Optimizes a table to defragment storage and update index statistics (equivalent to VACUUM).
 */
async function optimizeTable(dbName, tableName) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);
  const [rows] = await pool.query(`OPTIMIZE TABLE \`${cleanTable}\``);
  return { success: true, table: cleanTable, details: rows };
}

/**
 * Updates the comment/description metadata of a table.
 */
async function commentTable(dbName, tableName, comment) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);
  const safeComment = comment ? String(comment).replace(/'/g, "''") : '';
  await pool.query(`ALTER TABLE \`${cleanTable}\` COMMENT = '${safeComment}'`);
  return { success: true, table: cleanTable, comment };
}

/**
 * Creates a new base table with defined columns.
 */
async function createTable(dbName, tableName, columns) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('At least one column definition is required.');
  }

  const colDefinitions = [];
  const pkColumns = [];

  for (const col of columns) {
    const colName = validateIdentifier(col.name);
    let type = col.type || 'varchar(255)';
    const isPk = Boolean(col.isPrimaryKey || col.primaryKey || type.toLowerCase().includes('auto_increment'));
    if (isPk) {
      if (!pkColumns.includes(colName)) {
        pkColumns.push(colName);
      }
      if (type.toLowerCase() === 'serial') {
        type = 'INT AUTO_INCREMENT';
      }
    }

    let def = `\`${colName}\` ${type}`;
    if (col.isNullable === false || col.notNull === true) {
      def += ' NOT NULL';
    }
    if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`;
    }
    if (col.comment) {
      def += ` COMMENT '${String(col.comment).replace(/'/g, "''")}'`;
    }
    colDefinitions.push(def);
  }

  if (pkColumns.length > 0) {
    colDefinitions.push(`PRIMARY KEY (${pkColumns.map(p => `\`${p}\``).join(', ')})`);
  }

  const ddl = `CREATE TABLE \`${cleanTable}\` (\n  ${colDefinitions.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  await pool.query(ddl);
  return { success: true, table: cleanTable };
}

/**
 * Creates a view from a query.
 */
async function createView(dbName, viewName, query) {
  const pool = getDbPool(dbName);
  const cleanView = validateIdentifier(viewName);
  await pool.query(`CREATE VIEW \`${cleanView}\` AS ${query}`);
  return { success: true, view: cleanView };
}

/**
 * Advanced Schema Mutation Engine with Native MySQL Column Reordering (FIRST/AFTER).
 * Wraps operations in a MySQL transaction.
 */
async function batchSchemaMutation(dbName, tableName, { operations = [], newColumns = [], reorder = false }) {
  const pool = getDbPool(dbName);
  const cleanTable = validateIdentifier(tableName);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    if (reorder && Array.isArray(newColumns) && newColumns.length > 0) {
      // 1. Full schema alignment with native column reordering
      const currentConfig = await getTableConfig(dbName, tableName);
      const existingColNames = new Set(currentConfig.columns.map(c => c.column_name));
      const targetColNames = new Set(newColumns.map(c => c.name));

      // Drop columns that no longer exist in newColumns
      for (const oldCol of currentConfig.columns) {
        if (!targetColNames.has(oldCol.column_name)) {
          await conn.query(`ALTER TABLE \`${cleanTable}\` DROP COLUMN \`${validateIdentifier(oldCol.column_name)}\``);
        }
      }

      // Add or modify each column with FIRST / AFTER placement
      for (let i = 0; i < newColumns.length; i++) {
        const col = newColumns[i];
        const colName = validateIdentifier(col.name);
        const colType = col.type || 'varchar(255)';
        const position = i === 0 ? 'FIRST' : `AFTER \`${validateIdentifier(newColumns[i - 1].name)}\``;

        let colDef = `${colType}`;
        if (col.isNullable === false || col.notNull === true) {
          colDef += ' NOT NULL';
        }
        if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
          colDef += ` DEFAULT ${col.defaultValue}`;
        }
        if (col.comment) {
          colDef += ` COMMENT '${String(col.comment).replace(/'/g, "''")}'`;
        }

        if (existingColNames.has(colName)) {
          await conn.query(
            `ALTER TABLE \`${cleanTable}\` MODIFY COLUMN \`${colName}\` ${colDef} ${position}`
          );
        } else {
          await conn.query(
            `ALTER TABLE \`${cleanTable}\` ADD COLUMN \`${colName}\` ${colDef} ${position}`
          );
        }
      }
    } else if (Array.isArray(operations) && operations.length > 0) {
      // 2. Discrete operations processing
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (!op || !op.type) continue;

        switch (op.type) {
          case 'drop_column': {
            const col = validateIdentifier(op.column);
            await conn.query(`ALTER TABLE \`${cleanTable}\` DROP COLUMN \`${col}\``);
            break;
          }
          case 'add_column': {
            const col = validateIdentifier(op.column || op.name);
            const type = op.dataType || op.type || 'varchar(255)';
            let ddl = `ALTER TABLE \`${cleanTable}\` ADD COLUMN \`${col}\` ${type}`;
            if (op.isNullable === false || op.notNull === true) {
              ddl += ' NOT NULL';
            }
            if (op.defaultValue !== undefined && op.defaultValue !== null && op.defaultValue !== '') {
              ddl += ` DEFAULT ${op.defaultValue}`;
            }
            if (op.comment) {
              ddl += ` COMMENT '${String(op.comment).replace(/'/g, "''")}'`;
            }
            if (op.position) {
              ddl += ` ${op.position}`;
            } else if (op.after) {
              ddl += ` AFTER \`${validateIdentifier(op.after)}\``;
            } else if (op.first) {
              ddl += ' FIRST';
            }
            await conn.query(ddl);
            break;
          }
          case 'alter_column': {
            const col = validateIdentifier(op.column);
            const newName = op.newName ? validateIdentifier(op.newName) : col;
            const type = op.dataType || op.type || 'varchar(255)';

            let colDef = `${type}`;
            if (op.isNullable === false || op.notNull === true) {
              colDef += ' NOT NULL';
            }
            if (op.defaultValue !== undefined && op.defaultValue !== null && op.defaultValue !== '') {
              colDef += ` DEFAULT ${op.defaultValue}`;
            }
            if (op.comment) {
              colDef += ` COMMENT '${String(op.comment).replace(/'/g, "''")}'`;
            }

            if (newName !== col) {
              await conn.query(
                `ALTER TABLE \`${cleanTable}\` CHANGE COLUMN \`${col}\` \`${newName}\` ${colDef}`
              );
            } else {
              await conn.query(
                `ALTER TABLE \`${cleanTable}\` MODIFY COLUMN \`${col}\` ${colDef}`
              );
            }
            break;
          }
          default:
            console.warn(`[mysqlEngine] Unknown schema mutation operation: ${op.type}`);
        }
      }
    }

    await conn.commit();
    return { success: true, table: cleanTable };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Executes an arbitrary SQL query with timing.
 */
async function executeQuery(dbName, query) {
  const pool = getDbPool(dbName);
  const startTime = Date.now();

  const [result, fields] = await pool.query(query);
  const durationMs = Date.now() - startTime;

  if (Array.isArray(result)) {
    const columns = fields ? fields.map(f => f.name) : (result.length > 0 ? Object.keys(result[0]) : []);
    return {
      type: 'SELECT',
      columns,
      rows: result,
      rowCount: result.length,
      executionTimeMs: durationMs
    };
  }

  return {
    type: 'COMMAND',
    affectedRows: result.affectedRows || 0,
    insertId: result.insertId || 0,
    warningStatus: result.warningStatus || 0,
    executionTimeMs: durationMs
  };
}

/**
 * Deep text search across all varchar / text columns in a database.
 */
async function globalSearch(dbName, term) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getDbPool(dbName);
  const cleanTerm = String(term).trim();
  if (!cleanTerm) return { matches: [], totalMatches: 0, searchTerm: '' };

  const [cols] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME 
     FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = ? 
       AND DATA_TYPE IN ('varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext', 'json')`,
    [cleanDb]
  );

  const results = [];
  let totalMatches = 0;
  const searchPattern = `%${cleanTerm}%`;

  for (const c of cols) {
    try {
      const [matches] = await pool.query(
        `SELECT * FROM \`${cleanDb}\`.\`${c.TABLE_NAME}\` WHERE \`${c.COLUMN_NAME}\` LIKE ? LIMIT 5`,
        [searchPattern]
      );
      if (matches.length > 0) {
        results.push({
          schema: cleanDb,
          table: c.TABLE_NAME,
          column: c.COLUMN_NAME,
          matches,
          matchCount: matches.length
        });
        totalMatches += matches.length;
      }
    } catch (_) {}
  }

  return { matches: results, totalMatches, searchTerm: cleanTerm };
}

/**
 * Streams a raw mysqldump directly to the Express response stream.
 */
function streamDatabaseDump(dbName, type = 'full', res) {
  const cleanDb = validateIdentifier(dbName);
  const baseUri = getSuperUri();
  const url = new URL(baseUri);

  const host = url.hostname || '127.0.0.1';
  const port = url.port || '3306';
  const user = url.username || 'nexuscontrol';
  const password = url.password || '';

  const dumpBin = execSync('command -v mysqldump 2>/dev/null || command -v mariadb-dump 2>/dev/null', {
    encoding: 'utf8'
  }).trim() || 'mysqldump';

  const args = [
    `-h${host}`,
    `-P${port}`,
    `-u${user}`,
    `--single-transaction`,
    `--quick`,
    `--skip-lock-tables`
  ];

  if (password) {
    args.push(`-p${password}`);
  }

  if (type === 'schema') {
    args.push('--no-data');
  } else if (type === 'data') {
    args.push('--no-create-info');
  }

  args.push(cleanDb);

  const dumpProcess = spawn(dumpBin, args, {
    env: {
      ...process.env,
      MYSQL_PWD: password
    }
  });

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanDb}_${type}_${Date.now()}.sql"`);

  dumpProcess.stdout.pipe(res);

  dumpProcess.stderr.on('data', data => {
    console.warn(`[mysqldump][${cleanDb}] ${data.toString()}`);
  });

  dumpProcess.on('error', err => {
    console.error(`[mysqldump][${cleanDb}] Execution error:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate database dump' });
    }
  });
}

/**
 * Closes all active connection pools.
 */
async function closeAllPools() {
  for (const [, pool] of dbPools.entries()) {
    try {
      await pool.end();
    } catch (_) {}
  }
  dbPools.clear();

  if (defaultPool) {
    try {
      await defaultPool.end();
    } catch (_) {}
    defaultPool = null;
  }
}

module.exports = {
  initMysqlSuperuser,
  getPool,
  getDbPool,
  getStatus,
  listDatabases,
  createDatabase,
  dropDatabase,
  getDatabaseConfig,
  updateDatabaseConfig,
  getDatabasePrivileges,
  getDatabaseTriggers,
  getDatabaseRelations,
  listTables,
  getTableConfig,
  getTableData,
  insertTableRow,
  updateTableRow,
  deleteTableRow,
  exportTableSql,
  importTableData,
  renameTable,
  duplicateTable,
  truncateTable,
  optimizeTable,
  commentTable,
  createTable,
  createView,
  batchSchemaMutation,
  executeQuery,
  globalSearch,
  streamDatabaseDump,
  closeAllPools,
  isMysqlInstalled,
  validateIdentifier,
  parseCsv
};
