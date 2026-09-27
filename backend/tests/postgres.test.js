const request = require('supertest');
const { app } = require('../server');
const postgresEngine = require('../postgresEngine');

describe('PostgreSQL Database Management Integration Test Suite (Phase 1 & Phase 2)', () => {
  const testDbName = `nexus_phase2_${Date.now()}`;

  beforeAll(async () => {
    if (postgresEngine.isPsqlInstalled()) {
      postgresEngine.initPostgresSuperuser();
      await postgresEngine.createDatabase(testDbName);
    }
  });

  afterAll(async () => {
    if (postgresEngine.isPsqlInstalled()) {
      try {
        await postgresEngine.dropDatabase(testDbName);
      } catch (_) {}
    }
    await postgresEngine.closePool();
  });

  describe('PostgreSQL Engine Unit Tests', () => {
    test('isPsqlInstalled detects whether psql is on system path', () => {
      const installed = postgresEngine.isPsqlInstalled();
      expect(typeof installed).toBe('boolean');
    });

    test('getStatus returns status object with required fields', async () => {
      const status = await postgresEngine.getStatus();
      expect(status).toBeDefined();
      expect(typeof status.installed).toBe('boolean');
      expect(typeof status.active).toBe('boolean');
    });

    test('listDatabases returns an array of database objects', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const dbs = await postgresEngine.listDatabases();
        expect(Array.isArray(dbs)).toBe(true);
        expect(dbs.length).toBeGreaterThan(0);
        const pgDb = dbs.find(d => d.name === 'postgres');
        expect(pgDb).toBeDefined();
        expect(pgDb.owner).toBeDefined();
        expect(pgDb.size).toBeDefined();
        expect(pgDb.charset).toBeDefined();
      }
    });

    test('createDatabase rejects invalid identifier names (SQL injection defense)', async () => {
      await expect(postgresEngine.createDatabase('')).rejects.toThrow('Identifier name is required');
      await expect(postgresEngine.createDatabase('bad name with spaces')).rejects.toThrow('Invalid identifier');
      await expect(postgresEngine.createDatabase('db; DROP TABLE users;')).rejects.toThrow('Invalid identifier');
      await expect(postgresEngine.createDatabase('123starts_with_number')).rejects.toThrow('Invalid identifier');
      await expect(postgresEngine.createDatabase('db$dollar')).rejects.toThrow('Invalid identifier');
    });

    test('dropDatabase strictly blocks dropping protected system databases', async () => {
      await expect(postgresEngine.dropDatabase('postgres')).rejects.toThrow('Cannot drop protected system database');
      await expect(postgresEngine.dropDatabase('template0')).rejects.toThrow('Cannot drop protected system database');
      await expect(postgresEngine.dropDatabase('template1')).rejects.toThrow('Cannot drop protected system database');
    });
  });

  describe('Deep Introspection & Table Management (Phase 2)', () => {
    test('getDatabaseConfig returns owner, connection limit, and active connections', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const config = await postgresEngine.getDatabaseConfig(testDbName);
        expect(config.name).toBe(testDbName);
        expect(config.owner).toBeDefined();
        expect(config.connection_limit).toBeDefined();
        expect(config.active_connections).toBeDefined();
      }
    });

    test('updateDatabaseConfig updates comment and connection limit', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const updated = await postgresEngine.updateDatabaseConfig(testDbName, {
          connectionLimit: 50,
          comment: 'Test suite comment'
        });
        expect(updated.connection_limit).toBe(50);
        expect(updated.comment).toBe('Test suite comment');
      }
    });

    test('createTable provisions table and listTables discovers it', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const tbl = await postgresEngine.createTable(testDbName, {
          tableName: 'users_test',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
            { name: 'bio', type: 'text', nullable: true }
          ]
        });
        expect(tbl.name).toBe('users_test');

        const tables = await postgresEngine.listTables(testDbName);
        const createdTbl = tables.find(t => t.name === 'users_test');
        expect(createdTbl).toBeDefined();
        expect(createdTbl.type).toBe('table');
      }
    });

    test('getTableConfig introspects column schema and primary key', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const cols = await postgresEngine.getTableConfig(testDbName, 'users_test');
        expect(cols.length).toBe(3);

        const idCol = cols.find(c => c.column_name === 'id');
        expect(idCol).toBeDefined();
        expect(idCol.is_primary_key).toBe(true);

        const emailCol = cols.find(c => c.column_name === 'email');
        expect(emailCol.is_primary_key).toBe(false);
        expect(emailCol.is_nullable).toBe('NO');
      }
    });

    test('Dynamic Data Grid CRUD: Insert, paginate, update safely via PK, and delete', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        // Insert a test row via executeQuery
        await postgresEngine.executeQuery(
          testDbName,
          `INSERT INTO users_test (email, bio) VALUES ('alice@example.com', 'Hello world');`
        );

        // 1. Get Table Data
        const data = await postgresEngine.getTableData(testDbName, 'users_test');
        expect(data.total).toBe(1);
        expect(data.rows.length).toBe(1);
        expect(data.rows[0].email).toBe('alice@example.com');
        const rowId = data.rows[0].id;

        // 2. Safe Inline Row Update using detected Primary Key
        const updatedRow = await postgresEngine.updateTableRow(testDbName, 'users_test', {
          primaryKeys: { id: rowId },
          updates: { bio: 'Updated bio safely' }
        });
        expect(updatedRow.bio).toBe('Updated bio safely');

        // 3. Reject update if required Primary Key is missing
        await expect(
          postgresEngine.updateTableRow(testDbName, 'users_test', {
            primaryKeys: {},
            updates: { bio: 'Hacker rewrite' }
          })
        ).rejects.toThrow('Primary Key');

        // 4. Safe Row Delete
        const delRes = await postgresEngine.deleteTableRow(testDbName, 'users_test', {
          primaryKeys: { id: rowId }
        });
        expect(delRes.deleted).toBe(true);

        const dataAfterDel = await postgresEngine.getTableData(testDbName, 'users_test');
        expect(dataAfterDel.total).toBe(0);
      }
    });

    test('createView provisions a SQL view', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const viewRes = await postgresEngine.createView(testDbName, {
          viewName: 'v_active_users',
          query: 'SELECT * FROM users_test'
        });
        expect(viewRes.name).toBe('v_active_users');

        const tables = await postgresEngine.listTables(testDbName);
        const foundView = tables.find(t => t.name === 'v_active_users');
        expect(foundView).toBeDefined();
        expect(foundView.type).toBe('view');
      }
    });

    test('executeQuery executes arbitrary SQL and returns metrics', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await postgresEngine.executeQuery(testDbName, 'SELECT 42 as answer, NOW() as current_time;');
        expect(res.rows[0].answer).toBe(42);
        expect(res.fields.length).toBe(2);
        expect(typeof res.durationMs).toBe('number');
      }
    });

    test('globalSearch finds matching records across text columns', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        await postgresEngine.executeQuery(
          testDbName,
          `INSERT INTO users_test (email, bio) VALUES ('charlie@nexus.org', 'Senior Dev at Nexus');`
        );

        const searchRes = await postgresEngine.globalSearch(testDbName, 'Nexus');
        expect(searchRes.totalMatches).toBeGreaterThan(0);
        expect(searchRes.matches.some(m => m.table === 'users_test')).toBe(true);
      }
    });
  });

  describe('PostgreSQL REST API Endpoints', () => {
    test('GET /api/postgres/status returns status structure', async () => {
      const res = await request(app)
        .get('/api/postgres/status')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'viewer');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBeDefined();
      expect(typeof res.body.status.installed).toBe('boolean');
    });

    test('GET /api/postgres/databases returns list for authorized users', async () => {
      const res = await request(app)
        .get('/api/postgres/databases')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.databases)).toBe(true);
    });

    test('GET /api/postgres/databases/:dbName/config returns database details', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .get(`/api/postgres/databases/${testDbName}/config`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config.name).toBe(testDbName);
      }
    });

    test('GET /api/postgres/databases/:dbName/tables returns table catalog', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .get(`/api/postgres/databases/${testDbName}/tables`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.tables)).toBe(true);
      }
    });

    test('POST /api/postgres/query runs SQL queries', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .post('/api/postgres/query')
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ dbName: testDbName, sql: 'SELECT 123 as test_col' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.rows[0].test_col).toBe(123);
      }
    });

    test('POST /api/postgres/query returns clean error on SQL syntax error', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .post('/api/postgres/query')
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ dbName: testDbName, sql: 'SELEC FROM nowhere;' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBeDefined();
      }
    });

    test('GET /api/postgres/databases/:dbName/search returns search results', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .get(`/api/postgres/databases/${testDbName}/search?query=nexus`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.matches)).toBe(true);
      }
    });

    test('POST /api/postgres/databases/:dbName/tables/:tableName/data/row inserts row', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .post(`/api/postgres/databases/${testDbName}/tables/users_test/data/row`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ row: { email: 'david@nexus.org', bio: 'DevOps Lead' } });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.row.email).toBe('david@nexus.org');
      }
    });

    test('GET /api/postgres/databases/:dbName/tables/:tableName/export/sql returns SQL dump', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const res = await request(app)
          .get(`/api/postgres/databases/${testDbName}/tables/users_test/export/sql`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/sql');
        expect(res.text).toContain('INSERT INTO "public"."users_test"');
      }
    });

    test('POST /api/postgres/databases/:dbName/tables/:tableName/import handles CSV import', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const csvData = `email,bio\neva@nexus.org,"Security Researcher"\nfrank@nexus.org,"Database Architect"`;
        const res = await request(app)
          .post(`/api/postgres/databases/${testDbName}/tables/users_test/import`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ format: 'csv', content: csvData });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(2);
      }
    });

    test('POST /api/postgres/databases/:dbName/tables/:tableName/duplicate and rename maintenance ops', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        // 1. Duplicate
        const dupRes = await request(app)
          .post(`/api/postgres/databases/${testDbName}/tables/users_test/duplicate`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ newName: 'users_dup' });

        expect(dupRes.status).toBe(201);
        expect(dupRes.body.success).toBe(true);

        // 2. Rename
        const renRes = await request(app)
          .put(`/api/postgres/databases/${testDbName}/tables/users_dup/rename`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ newName: 'users_renamed' });

        expect(renRes.status).toBe(200);
        expect(renRes.body.success).toBe(true);

        // 3. Comment
        const commRes = await request(app)
          .put(`/api/postgres/databases/${testDbName}/tables/users_renamed/comment`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({ comment: 'Archived duplicate table' });

        expect(commRes.status).toBe(200);
        expect(commRes.body.success).toBe(true);

        // 4. Vacuum
        const vacRes = await request(app)
          .post(`/api/postgres/databases/${testDbName}/tables/users_renamed/vacuum`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(vacRes.status).toBe(200);
        expect(vacRes.body.success).toBe(true);

        // 5. Truncate
        const truncRes = await request(app)
          .post(`/api/postgres/databases/${testDbName}/tables/users_renamed/truncate`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(truncRes.status).toBe(200);
        expect(truncRes.body.success).toBe(true);
      }
    });

    test('PATCH /api/postgres/databases/:dbName/tables/:tableName/schema/batch executes schema mutations and reordering', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        // 1. Add column
        const addRes = await request(app)
          .patch(`/api/postgres/databases/${testDbName}/tables/users_test/schema/batch`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({
            operations: [
              { type: 'add_column', column: 'is_active', dataType: 'boolean', defaultValue: 'true' }
            ]
          });

        expect(addRes.status).toBe(200);
        expect(addRes.body.success).toBe(true);

        // 2. Reorder columns via table recreation
        const reorderRes = await request(app)
          .patch(`/api/postgres/databases/${testDbName}/tables/users_test/schema/batch`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin')
          .send({
            reorder: true,
            newColumns: [
              { name: 'email', type: 'varchar(255)', isNullable: false },
              { name: 'id', type: 'serial', isPrimaryKey: true },
              { name: 'bio', type: 'text', isNullable: true },
              { name: 'is_active', type: 'boolean', defaultValue: 'true' }
            ]
          });

        expect(reorderRes.status).toBe(200);
        expect(reorderRes.body.success).toBe(true);

        // Check that column order was modified
        const configRes = await request(app)
          .get(`/api/postgres/databases/${testDbName}/tables/users_test/config`)
          .set('Authorization', 'Bearer test-token')
          .set('x-test-role', 'superadmin');

        expect(configRes.status).toBe(200);
        expect(configRes.body.columns[0].column_name).toBe('email');
      }
    });

    test('Viewer role is forbidden from POST /api/postgres/databases', async () => {
      const res = await request(app)
        .post('/api/postgres/databases')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'viewer')
        .send({ name: 'viewer_db' });

      expect(res.status).toBe(403);
    });

    test('Unauthenticated request is rejected with HTTP 401', async () => {
      const res = await request(app).get('/api/postgres/databases');
      expect(res.status).toBe(401);
    });
  });
});
