const request = require('supertest');
const { app } = require('../server');
const mysqlEngine = require('../mysqlEngine');

describe('MySQL / MariaDB Database Management Test Suite', () => {
  const testDbName = `nexus_mysql_${Date.now()}`;

  beforeAll(async () => {
    mysqlEngine.initMysqlSuperuser();
    try {
      await mysqlEngine.createDatabase(testDbName);
    } catch (_) {}
  });

  afterAll(async () => {
    try {
      await mysqlEngine.dropDatabase(testDbName);
    } catch (_) {}
    await mysqlEngine.closeAllPools();
  });

  describe('MySQL Engine Unit Tests', () => {
    test('isMysqlInstalled detects client on host', () => {
      const installed = mysqlEngine.isMysqlInstalled();
      expect(typeof installed).toBe('boolean');
    });

    test('getStatus returns status object with required fields', async () => {
      const status = await mysqlEngine.getStatus();
      expect(status).toBeDefined();
      expect(typeof status.isInstalled).toBe('boolean');
      expect(typeof status.available).toBe('boolean');
    });

    test('createDatabase rejects invalid identifier names (SQL injection defense)', async () => {
      await expect(mysqlEngine.createDatabase('')).rejects.toThrow('Identifier name is required');
      await expect(mysqlEngine.createDatabase('bad name with spaces')).rejects.toThrow('Invalid identifier');
      await expect(mysqlEngine.createDatabase('db; DROP TABLE users;')).rejects.toThrow('Invalid identifier');
    });

    test('dropDatabase strictly blocks dropping protected system databases', async () => {
      await expect(mysqlEngine.dropDatabase('mysql')).rejects.toThrow('Cannot drop protected system database');
      await expect(mysqlEngine.dropDatabase('information_schema')).rejects.toThrow('Cannot drop protected system database');
      await expect(mysqlEngine.dropDatabase('sys')).rejects.toThrow('Cannot drop protected system database');
      await expect(mysqlEngine.dropDatabase('performance_schema')).rejects.toThrow('Cannot drop protected system database');
    });
  });

  describe('Database and Table Introspection Lifecycle', () => {
    test('createTable, insertTableRow, getTableData, and batchSchemaMutation with column reorder', async () => {
      const createRes = await mysqlEngine.createTable(testDbName, 'test_users', [
        { name: 'id', type: 'int auto_increment', primaryKey: true, nullable: false },
        { name: 'username', type: 'varchar(100)', nullable: false },
        { name: 'email', type: 'varchar(255)', nullable: false }
      ]);
      expect(createRes.success).toBe(true);

      const insertRes = await mysqlEngine.insertTableRow(testDbName, 'test_users', {
        username: 'bob',
        email: 'bob@example.com'
      });
      expect(insertRes.success).toBe(true);

      const dataRes = await mysqlEngine.getTableData(testDbName, 'test_users', { limit: 10, offset: 0 });
      expect(dataRes.rows.length).toBe(1);
      expect(dataRes.rows[0].username).toBe('bob');

      // Native MySQL Column Reorder test
      const batchRes = await mysqlEngine.batchSchemaMutation(testDbName, 'test_users', {
        reorder: true,
        newColumns: [
          { name: 'id', type: 'int', notNull: true },
          { name: 'email', type: 'varchar(255)', notNull: true },
          { name: 'username', type: 'varchar(100)', notNull: true },
          { name: 'notes', type: 'text', isNullable: true }
        ]
      });
      expect(batchRes.success).toBe(true);

      const configRes = await mysqlEngine.getTableConfig(testDbName, 'test_users');
      expect(configRes.columns.map(c => c.column_name)).toEqual(['id', 'email', 'username', 'notes']);

      // Global search
      const searchRes = await mysqlEngine.globalSearch(testDbName, 'bob');
      expect(searchRes.totalMatches).toBeGreaterThan(0);
    });
  });
});
