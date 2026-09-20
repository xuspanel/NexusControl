const { DatabaseSync } = require('node:sqlite');

process.env.NODE_ENV = 'test';
process.env.AUTH_PASSWORD = 'TestPassword123!';
process.env.ADMIN_PASSWORD = 'TestPassword123!';
process.env.PORT = '8799';
process.env.ALLOWED_IPS = '127.0.0.1,::1,localhost,192.168.1.50';
process.env.SESSION_SECRET = 'test-secret-key-32-chars-long-12345';
process.env.TOTP_ENFORCED = 'false';
process.env.EMAIL_OTP_ENFORCED = 'false';

// Isolated in-memory SQLite test database instance
let inMemoryDb = null;

beforeAll(() => {
  inMemoryDb = new DatabaseSync(':memory:');
  const auditLogger = require('../auditLogger');
  if (auditLogger && typeof auditLogger.initDb === 'function') {
    auditLogger.initDb(inMemoryDb);
  }
  const backupEngine = require('../backupEngine');
  if (backupEngine && typeof backupEngine.initDb === 'function') {
    backupEngine.initDb(inMemoryDb);
  }
  const scheduler = require('../scheduler');
  if (scheduler && typeof scheduler.initDb === 'function') {
    scheduler.initDb(inMemoryDb);
  }
});

afterAll(() => {
  if (inMemoryDb) {
    try {
      inMemoryDb.close();
    } catch {}
    inMemoryDb = null;
  }
});

// Suppress console spam during tests unless DEBUG_TESTS=1 is specified
if (!process.env.DEBUG_TESTS) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
}
