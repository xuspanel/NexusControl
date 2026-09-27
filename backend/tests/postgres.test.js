const request = require('supertest');
const { app } = require('../server');
const postgresEngine = require('../postgresEngine');

describe('PostgreSQL Database Management Integration Test Suite', () => {
  afterAll(async () => {
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
      await expect(postgresEngine.createDatabase('')).rejects.toThrow('Database name is required');
      await expect(postgresEngine.createDatabase('bad name with spaces')).rejects.toThrow('Invalid database name');
      await expect(postgresEngine.createDatabase('db; DROP TABLE users;')).rejects.toThrow('Invalid database name');
      await expect(postgresEngine.createDatabase('123starts_with_number')).rejects.toThrow('Invalid database name');
      await expect(postgresEngine.createDatabase('db$dollar')).rejects.toThrow('Invalid database name');
    });

    test('dropDatabase strictly blocks dropping protected system databases', async () => {
      await expect(postgresEngine.dropDatabase('postgres')).rejects.toThrow('Cannot drop protected system database');
      await expect(postgresEngine.dropDatabase('template0')).rejects.toThrow('Cannot drop protected system database');
      await expect(postgresEngine.dropDatabase('template1')).rejects.toThrow('Cannot drop protected system database');
    });

    test('Database lifecycle: creates and drops a test database', async () => {
      if (postgresEngine.isPsqlInstalled()) {
        const testDbName = `nexus_jest_${Date.now()}`;
        const created = await postgresEngine.createDatabase(testDbName);
        expect(created.name).toBe(testDbName);

        const dbsAfterCreate = await postgresEngine.listDatabases();
        expect(dbsAfterCreate.some(d => d.name === testDbName)).toBe(true);

        const dropped = await postgresEngine.dropDatabase(testDbName);
        expect(dropped.dropped).toBe(true);

        const dbsAfterDrop = await postgresEngine.listDatabases();
        expect(dbsAfterDrop.some(d => d.name === testDbName)).toBe(false);
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

    test('POST /api/postgres/databases creates database and returns 201', async () => {
      const testDbName = `api_test_${Date.now()}`;
      const res = await request(app)
        .post('/api/postgres/databases')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({ name: testDbName });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.database).toBe(testDbName);

      // Clean up via DELETE endpoint
      const deleteRes = await request(app)
        .delete(`/api/postgres/databases/${testDbName}`)
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });

    test('POST /api/postgres/databases rejects invalid names with 400', async () => {
      const res = await request(app)
        .post('/api/postgres/databases')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({ name: 'invalid db; drop;' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid database name');
    });

    test('DELETE /api/postgres/databases/:name rejects dropping postgres system db', async () => {
      const res = await request(app)
        .delete('/api/postgres/databases/postgres')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Cannot drop protected system database');
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
