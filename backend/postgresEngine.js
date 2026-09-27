const { Pool } = require('pg');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let pgPool = null;
const dbPools = new Map();

/**
 * Checks if the psql binary is available on the system PATH
 */
function isPsqlInstalled() {
  try {
    execSync('command -v psql 2>/dev/null', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a PostgreSQL identifier (database, schema, table, column name)
 * to guard against SQL injection while allowing standard alphanumeric/underscore identifiers.
 */
function validateIdentifier(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Identifier name is required.');
  }
  const cleanName = name.trim();
  const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
  if (!identifierRegex.test(cleanName)) {
    throw new Error(
      `Invalid identifier "${cleanName}". Must start with a letter or underscore and contain only alphanumeric characters and underscores (max 63 characters).`
    );
  }
  return cleanName;
}

/**
 * Securely bootstraps a dedicated NexusControl superuser with peer authentication,
 * writes the PG_SUPER_URI connection string to backend/.env, and initializes the connection pool.
 */
function initPostgresSuperuser() {
  try {
    if (!isPsqlInstalled()) {
      console.log('[Postgres] psql not found on host PATH.');
      return false;
    }

    let pgUri = process.env.PG_SUPER_URI;
    if (!pgUri) {
      console.log('[Postgres] Bootstrapping NexusControl Superuser...');
      const pwd = crypto.randomBytes(16).toString('hex');

      try {
        execSync(
          `sudo -u postgres psql -c "DO \\$\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexuscontrol') THEN CREATE ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}'; ELSE ALTER ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}'; END IF; END \\$\\$;"`,
          { stdio: 'ignore', timeout: 5000 }
        );
      } catch (err) {
        try {
          execSync(
            `sudo -u postgres psql -c "CREATE ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}';"`,
            { stdio: 'ignore', timeout: 5000 }
          );
        } catch (innerErr) {
          execSync(
            `sudo -u postgres psql -c "ALTER ROLE nexuscontrol WITH LOGIN SUPERUSER PASSWORD '${pwd}';"`,
            { stdio: 'ignore', timeout: 5000 }
          );
        }
      }

      pgUri = `postgresql://nexuscontrol:${pwd}@127.0.0.1:5432/postgres`;

      const backendEnvPath = path.resolve(__dirname, '.env');
      if (fs.existsSync(backendEnvPath)) {
        const content = fs.readFileSync(backendEnvPath, 'utf8');
        if (!content.includes('PG_SUPER_URI=')) {
          fs.appendFileSync(backendEnvPath, `\nPG_SUPER_URI=${pgUri}\n`);
        }
      }

      const rootEnvPath = path.resolve(__dirname, '../.env');
      if (fs.existsSync(rootEnvPath)) {
        const content = fs.readFileSync(rootEnvPath, 'utf8');
        if (!content.includes('PG_SUPER_URI=')) {
          fs.appendFileSync(rootEnvPath, `\nPG_SUPER_URI=${pgUri}\n`);
        }
      }

      process.env.PG_SUPER_URI = pgUri;
      console.log('[Postgres] NexusControl Superuser bootstrapped successfully.');
    }

    if (!pgPool) {
      pgPool = new Pool({
        connectionString: pgUri,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      pgPool.on('error', (err) => {
        console.error('[Postgres] Unexpected error on idle client:', err.message);
      });
    }

    return true;
  } catch (error) {
    console.log('[Postgres] Not installed or inactive on host:', error.message);
    return false;
  }
}

/**
 * Returns the active default connection pool (postgres database)
 */
function getPool() {
  if (!pgPool) {
    initPostgresSuperuser();
  }
  return pgPool;
}

/**
 * Dynamic Connection Manager: Returns or creates a cached connection pool
 * for a specific database name using the bootstrapped superuser credentials.
 */
function getDbPool(dbName) {
  if (!dbName || typeof dbName !== 'string') {
    throw new Error('Valid database name is required.');
  }
  const cleanDb = validateIdentifier(dbName);

  if (dbPools.has(cleanDb)) {
    return dbPools.get(cleanDb);
  }

  // Ensure default pool is bootstrapped
  getPool();
  const baseUri = process.env.PG_SUPER_URI;
  if (!baseUri) {
    throw new Error('PostgreSQL Superuser URI is not configured.');
  }

  const parsedUrl = new URL(baseUri);
  parsedUrl.pathname = '/' + encodeURIComponent(cleanDb);
  const targetUri = parsedUrl.toString();

  const newPool = new Pool({
    connectionString: targetUri,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  newPool.on('error', (err) => {
    console.error(`[Postgres][${cleanDb}] Pool error:`, err.message);
  });

  dbPools.set(cleanDb, newPool);
  return newPool;
}

/**
 * Queries current PostgreSQL status and metadata
 */
async function getStatus() {
  const installed = isPsqlInstalled();
  if (!installed) {
    return {
      installed: false,
      active: false,
      message: 'PostgreSQL is not installed on this VPS.'
    };
  }

  const pool = getPool();
  if (!pool) {
    return {
      installed: true,
      active: false,
      message: 'PostgreSQL is installed but connection pool could not be initialized. Daemon may be stopped.'
    };
  }

  try {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT version(), 
               current_user,
               current_database() as database,
               inet_server_port() as port,
               (SELECT count(*) FROM pg_database WHERE datistemplate = false) as db_count
      `);
      const row = res.rows[0];
      return {
        installed: true,
        active: true,
        version: row.version,
        currentUser: row.current_user,
        database: row.database,
        port: row.port || 5432,
        dbCount: parseInt(row.db_count, 10),
        uriConfigured: Boolean(process.env.PG_SUPER_URI)
      };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      installed: true,
      active: false,
      error: err.message,
      message: 'PostgreSQL service is currently unreachable or inactive.'
    };
  }
}

/**
 * Lists all user databases, excluding templates, with size, owner, and encoding
 */
async function listDatabases() {
  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL engine is not active or initialized.');
  }

  const query = `
    SELECT d.datname as name, 
           pg_catalog.pg_get_userbyid(d.datdba) as owner,
           pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size,
           pg_database_size(d.datname) as size_bytes,
           pg_encoding_to_char(d.encoding) as charset
    FROM pg_catalog.pg_database d
    WHERE d.datistemplate = false
    ORDER BY d.datname ASC;
  `;

  const { rows } = await pool.query(query);
  return rows;
}

/**
 * Creates a new PostgreSQL database
 */
async function createDatabase(name, owner = null) {
  const cleanName = validateIdentifier(name);
  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL engine is not active or initialized.');
  }

  let sql = `CREATE DATABASE "${cleanName}"`;
  if (owner) {
    const cleanOwner = validateIdentifier(owner);
    sql += ` OWNER "${cleanOwner}"`;
  }

  await pool.query(sql);
  return { name: cleanName };
}

/**
 * Safely drops a PostgreSQL database with force termination of open connections
 */
async function dropDatabase(name) {
  const cleanName = validateIdentifier(name);

  const protectedDbs = ['postgres', 'template0', 'template1'];
  if (protectedDbs.includes(cleanName.toLowerCase())) {
    throw new Error(`Cannot drop protected system database "${cleanName}".`);
  }

  // Remove and close cached pool if open
  if (dbPools.has(cleanName)) {
    try {
      await dbPools.get(cleanName).end();
    } catch (_) {}
    dbPools.delete(cleanName);
  }

  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL engine is not active or initialized.');
  }

  // Terminate any active connections to this database
  try {
    await pool.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid();
    `,
      [cleanName]
    );
  } catch (termErr) {
    console.warn('[Postgres] Connection termination warning:', termErr.message);
  }

  try {
    await pool.query(`DROP DATABASE "${cleanName}" WITH (FORCE);`);
  } catch (forceErr) {
    await pool.query(`DROP DATABASE "${cleanName}";`);
  }

  return { name: cleanName, dropped: true };
}

/**
 * Deep Introspection: Retrieves configuration, owner, limits, and comments for a database
 */
async function getDatabaseConfig(dbName) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();

  const query = `
    SELECT d.datname as name,
           pg_catalog.pg_get_userbyid(d.datdba) as owner,
           d.datconnlimit as connection_limit,
           shobj_description(d.oid, 'pg_database') as comment,
           pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size,
           pg_database_size(d.datname) as size_bytes,
           pg_encoding_to_char(d.encoding) as charset,
           (SELECT count(*) FROM pg_stat_activity WHERE datname = d.datname) as active_connections
    FROM pg_catalog.pg_database d
    WHERE d.datname = $1;
  `;

  const { rows } = await pool.query(query, [cleanDb]);
  if (!rows.length) {
    throw new Error(`Database "${cleanDb}" not found.`);
  }
  return rows[0];
}

/**
 * Updates database owner, connection limit, or description/comment
 */
async function updateDatabaseConfig(dbName, { owner, connectionLimit, comment }) {
  const cleanDb = validateIdentifier(dbName);
  const pool = getPool();

  if (owner) {
    const cleanOwner = validateIdentifier(owner);
    await pool.query(`ALTER DATABASE "${cleanDb}" OWNER TO "${cleanOwner}"`);
  }

  if (connectionLimit !== undefined && connectionLimit !== null) {
    const limitNum = parseInt(connectionLimit, 10);
    if (!isNaN(limitNum)) {
      await pool.query(`ALTER DATABASE "${cleanDb}" CONNECTION LIMIT ${limitNum}`);
    }
  }

  if (comment !== undefined && comment !== null) {
    const escapedComment = String(comment).replace(/'/g, "''");
    await pool.query(`COMMENT ON DATABASE "${cleanDb}" IS '${escapedComment}'`);
  }

  return await getDatabaseConfig(cleanDb);
}

/**
 * Queries role table grants / privileges for user tables
 */
async function getDatabasePrivileges(dbName) {
  const pool = getDbPool(dbName);
  const query = `
    SELECT grantee,
           table_schema,
           table_name,
           privilege_type,
           is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_name, grantee, privilege_type;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

/**
 * Queries triggers on all user tables in the database
 */
async function getDatabaseTriggers(dbName) {
  const pool = getDbPool(dbName);
  const query = `
    SELECT t.tgname as trigger_name,
           c.relname as table_name,
           n.nspname as schema_name,
           CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
           CASE 
             WHEN (t.tgtype & 4) = 4 THEN 'INSERT'
             WHEN (t.tgtype & 8) = 8 THEN 'DELETE'
             WHEN (t.tgtype & 16) = 16 THEN 'UPDATE'
             WHEN (t.tgtype & 32) = 32 THEN 'TRUNCATE'
             ELSE 'UNKNOWN'
           END as event,
           t.tgenabled as status,
           p.proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE NOT t.tgisinternal
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY c.relname, t.tgname;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

/**
 * Queries foreign keys and relationships between user tables
 */
async function getDatabaseRelations(dbName) {
  const pool = getDbPool(dbName);
  const query = `
    SELECT tc.table_schema,
           tc.table_name,
           kcu.column_name,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY tc.table_name, kcu.column_name;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

/**
 * Lists user tables, views, and materialized views with row counts and disk sizes
 */
async function listTables(dbName) {
  const pool = getDbPool(dbName);
  const query = `
    SELECT c.relname as name,
           n.nspname as schema,
           pg_catalog.pg_get_userbyid(c.relowner) as owner,
           CASE c.relkind
             WHEN 'r' THEN 'table'
             WHEN 'v' THEN 'view'
             WHEN 'm' THEN 'materialized_view'
             WHEN 'f' THEN 'foreign_table'
             WHEN 'p' THEN 'partitioned_table'
             ELSE 'other'
           END as type,
           COALESCE(s.n_live_tup, c.reltuples::bigint, 0) as row_count,
           pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
           pg_total_relation_size(c.oid) as size_bytes,
           obj_description(c.oid, 'pg_class') as comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind IN ('r', 'v', 'm', 'f', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY c.relkind, c.relname;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

/**
 * Generates and executes CREATE TABLE DDL from column specifications
 */
async function createTable(dbName, { tableName, schema = 'public', columns = [] }) {
  const cleanTable = validateIdentifier(tableName);
  const cleanSchema = validateIdentifier(schema || 'public');

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('At least one column definition is required to create a table.');
  }

  const pool = getDbPool(dbName);
  const colDefs = [];
  const primaryKeys = [];

  for (const col of columns) {
    if (!col.name) continue;
    const colName = validateIdentifier(col.name);
    let colType = (col.type || 'text').toUpperCase();

    // Map common aliases
    if (colType === 'STRING') colType = 'VARCHAR(255)';
    if (colType === 'DATETIME') colType = 'TIMESTAMP';

    let def = `"${colName}" ${colType}`;
    if (col.nullable === false) {
      def += ' NOT NULL';
    }
    if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`;
    }
    if (col.unique) {
      def += ' UNIQUE';
    }
    if (col.primaryKey) {
      primaryKeys.push(`"${colName}"`);
    }
    colDefs.push(def);
  }

  if (primaryKeys.length > 0) {
    colDefs.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
  }

  const sql = `CREATE TABLE "${cleanSchema}"."${cleanTable}" (\n  ${colDefs.join(',\n  ')}\n);`;
  await pool.query(sql);

  return { name: cleanTable, schema: cleanSchema, ddl: sql };
}

/**
 * Generates and executes CREATE VIEW or CREATE MATERIALIZED VIEW
 */
async function createView(dbName, { viewName, schema = 'public', query, materialized = false }) {
  const cleanView = validateIdentifier(viewName);
  const cleanSchema = validateIdentifier(schema || 'public');

  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Valid SQL query definition is required for view.');
  }

  const pool = getDbPool(dbName);
  const viewType = materialized ? 'MATERIALIZED VIEW' : 'VIEW';
  const sql = `CREATE ${viewType} "${cleanSchema}"."${cleanView}" AS ${query.trim()}`;

  await pool.query(sql);
  return { name: cleanView, schema: cleanSchema, type: materialized ? 'materialized_view' : 'view' };
}

/**
 * Introspects table columns and primary keys
 */
async function getTableConfig(dbName, tableName, schema = 'public') {
  const cleanTable = validateIdentifier(tableName);
  const cleanSchema = validateIdentifier(schema || 'public');
  const pool = getDbPool(dbName);

  const query = `
    SELECT c.column_name,
           c.ordinal_position,
           c.data_type,
           c.character_maximum_length,
           c.column_default,
           c.is_nullable,
           CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.table_schema, ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
       AND tc.table_schema = ku.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
    ) pk ON c.table_schema = pk.table_schema
        AND c.table_name = pk.table_name
        AND c.column_name = pk.column_name
    WHERE c.table_name = $1 AND c.table_schema = $2
    ORDER BY c.ordinal_position;
  `;

  const { rows } = await pool.query(query, [cleanTable, cleanSchema]);
  return rows;
}

/**
 * Retrieves paginated data rows and total count from a specific table
 */
async function getTableData(dbName, tableName, { schema = 'public', limit = 50, offset = 0, orderBy, orderDir = 'ASC' } = {}) {
  const cleanTable = validateIdentifier(tableName);
  const cleanSchema = validateIdentifier(schema || 'public');
  const pool = getDbPool(dbName);

  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

  // 1. Total row count
  const countRes = await pool.query(`SELECT count(*) as total FROM "${cleanSchema}"."${cleanTable}"`);
  const total = parseInt(countRes.rows[0].total, 10);

  // 2. Data rows
  let dataSql = `SELECT * FROM "${cleanSchema}"."${cleanTable}"`;
  if (orderBy) {
    const cleanOrderBy = validateIdentifier(orderBy);
    const dir = (orderDir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    dataSql += ` ORDER BY "${cleanOrderBy}" ${dir}`;
  }
  dataSql += ` LIMIT $1 OFFSET $2`;

  const dataRes = await pool.query(dataSql, [limitNum, offsetNum]);
  const columns = dataRes.fields ? dataRes.fields.map(f => f.name) : [];

  return {
    rows: dataRes.rows,
    total,
    limit: limitNum,
    offset: offsetNum,
    columns
  };
}

/**
 * Inline Edit Safety: Dynamically discovers the table's Primary Key(s),
 * and uses them in the WHERE clause of the UPDATE statement to prevent bulk overwriting.
 */
async function updateTableRow(dbName, tableName, { schema = 'public', primaryKeys = {}, updates = {} }) {
  const cleanTable = validateIdentifier(tableName);
  const cleanSchema = validateIdentifier(schema || 'public');
  const pool = getDbPool(dbName);

  if (!updates || Object.keys(updates).length === 0) {
    throw new Error('No column updates provided.');
  }

  // Detect Primary Keys dynamically
  const pkQuery = `
    SELECT ku.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage ku
      ON tc.constraint_name = ku.constraint_name
     AND tc.table_schema = ku.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = $1 AND tc.table_schema = $2
    ORDER BY ku.ordinal_position;
  `;
  const pkRes = await pool.query(pkQuery, [cleanTable, cleanSchema]);
  const detectedPks = pkRes.rows.map(r => r.column_name);

  // Validate that required primary keys are present in request
  const whereClauses = [];
  const queryParams = [];
  let paramIdx = 1;

  if (detectedPks.length > 0) {
    for (const pk of detectedPks) {
      if (primaryKeys[pk] === undefined) {
        throw new Error(`Primary Key "${pk}" value is required for safe inline row update.`);
      }
      whereClauses.push(`"${pk}" = $${paramIdx}`);
      queryParams.push(primaryKeys[pk]);
      paramIdx++;
    }
  } else {
    // If table has no primary key, require primaryKeys payload to identify the row uniquely
    const keys = Object.keys(primaryKeys);
    if (keys.length === 0) {
      throw new Error('This table has no primary key. An exact row match is required to prevent accidental bulk updates.');
    }
    for (const k of keys) {
      const cleanKey = validateIdentifier(k);
      whereClauses.push(`"${cleanKey}" = $${paramIdx}`);
      queryParams.push(primaryKeys[k]);
      paramIdx++;
    }
  }

  // Construct SET clauses
  const setClauses = [];
  for (const [col, val] of Object.entries(updates)) {
    const cleanCol = validateIdentifier(col);
    setClauses.push(`"${cleanCol}" = $${paramIdx}`);
    queryParams.push(val);
    paramIdx++;
  }

  const updateSql = `
    UPDATE "${cleanSchema}"."${cleanTable}"
    SET ${setClauses.join(', ')}
    WHERE ${whereClauses.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(updateSql, queryParams);
  if (result.rows.length === 0) {
    throw new Error('No matching row found to update.');
  }

  return result.rows[0];
}

/**
 * Deletes a row safely using its primary key(s)
 */
async function deleteTableRow(dbName, tableName, { schema = 'public', primaryKeys = {} }) {
  const cleanTable = validateIdentifier(tableName);
  const cleanSchema = validateIdentifier(schema || 'public');
  const pool = getDbPool(dbName);

  const keys = Object.keys(primaryKeys);
  if (keys.length === 0) {
    throw new Error('Primary key(s) required to safely delete row.');
  }

  const whereClauses = [];
  const queryParams = [];
  let paramIdx = 1;

  for (const k of keys) {
    const cleanKey = validateIdentifier(k);
    whereClauses.push(`"${cleanKey}" = $${paramIdx}`);
    queryParams.push(primaryKeys[k]);
    paramIdx++;
  }

  const sql = `
    DELETE FROM "${cleanSchema}"."${cleanTable}"
    WHERE ${whereClauses.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(sql, queryParams);
  return { deleted: result.rowCount > 0, count: result.rowCount };
}

/**
 * Executes an arbitrary SQL query on a database, capturing duration and fields
 */
async function executeQuery(dbName, sql) {
  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    throw new Error('SQL query string is required.');
  }
  const cleanDb = validateIdentifier(dbName);
  const pool = getDbPool(cleanDb);

  const startTime = Date.now();
  const res = await pool.query(sql);
  const durationMs = Date.now() - startTime;

  const fields = res.fields ? res.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })) : [];

  return {
    rows: Array.isArray(res.rows) ? res.rows : [],
    fields,
    rowCount: res.rowCount !== null ? res.rowCount : (res.rows ? res.rows.length : 0),
    command: res.command,
    durationMs
  };
}

/**
 * Global Search: Discovers all text columns in user tables and searches with ILIKE
 */
async function globalSearch(dbName, searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string' || !searchTerm.trim()) {
    return { matches: [], totalMatches: 0 };
  }
  const pool = getDbPool(dbName);
  const term = `%${searchTerm.trim()}%`;

  // 1. Find all text-like columns in user tables
  const colsQuery = `
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND data_type IN ('character varying', 'varchar', 'text', 'character', 'char')
    ORDER BY table_name, column_name;
  `;
  const colsRes = await pool.query(colsQuery);
  const textCols = colsRes.rows;

  const matches = [];
  let totalMatches = 0;

  // Search each table/column with a limit of 5 matches per column
  for (const col of textCols) {
    try {
      const searchSql = `
        SELECT *
        FROM "${col.table_schema}"."${col.table_name}"
        WHERE "${col.column_name}"::text ILIKE $1
        LIMIT 5;
      `;
      const res = await pool.query(searchSql, [term]);
      if (res.rows.length > 0) {
        matches.push({
          schema: col.table_schema,
          table: col.table_name,
          column: col.column_name,
          matches: res.rows,
          matchCount: res.rows.length
        });
        totalMatches += res.rows.length;
      }
    } catch (_) {
      // Continue search even if a specific table/view errors
    }
  }

  return { matches, totalMatches, searchTerm: searchTerm.trim() };
}

/**
 * Streams a pg_dump execution directly to an Express response stream
 */
function streamDatabaseDump(dbName, type = 'full', res) {
  const cleanDb = validateIdentifier(dbName);
  getPool();

  const baseUri = process.env.PG_SUPER_URI;
  if (!baseUri) {
    throw new Error('PG_SUPER_URI is not configured.');
  }

  const url = new URL(baseUri);
  const host = url.hostname || '127.0.0.1';
  const port = url.port || '5432';
  const user = url.username || 'nexuscontrol';
  const password = url.password || '';

  const args = ['-h', host, '-p', port, '-U', user, '-d', cleanDb];

  if (type === 'schema') {
    args.push('--schema-only');
  } else if (type === 'data') {
    args.push('--data-only');
  }

  const dumpProcess = spawn('pg_dump', args, {
    env: {
      ...process.env,
      PGPASSWORD: password
    }
  });

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanDb}_${type}_${Date.now()}.sql"`);

  dumpProcess.stdout.pipe(res);

  dumpProcess.stderr.on('data', (data) => {
    console.warn(`[pg_dump][${cleanDb}] ${data.toString()}`);
  });

  dumpProcess.on('error', (err) => {
    console.error(`[pg_dump][${cleanDb}] Execution error:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate database dump' });
    }
  });
}

/**
 * Cleanly closes all open pools
 */
async function closeAllPools() {
  for (const [name, pool] of dbPools.entries()) {
    try {
      await pool.end();
    } catch (_) {}
  }
  dbPools.clear();

  if (pgPool) {
    try {
      await pgPool.end();
    } catch (_) {}
    pgPool = null;
  }
}

module.exports = {
  initPostgresSuperuser,
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
  createTable,
  createView,
  getTableConfig,
  getTableData,
  updateTableRow,
  deleteTableRow,
  executeQuery,
  globalSearch,
  streamDatabaseDump,
  closePool: closeAllPools,
  closeAllPools,
  isPsqlInstalled,
  validateIdentifier
};
