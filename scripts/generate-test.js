#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const moduleName = process.argv[2];

if (!moduleName) {
  console.error('\n[ERROR] Module name is required.');
  console.log('Usage: npm run generate-test <module_name>');
  console.log('Example: npm run generate-test backups\n');
  process.exit(1);
}

const cleanName = moduleName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
const targetDir = path.join(__dirname, '../backend/tests');
const targetFile = path.join(targetDir, `${cleanName}.test.js`);

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

if (fs.existsSync(targetFile) && !process.argv.includes('--force')) {
  console.error(`\n[ERROR] Test file already exists: ${targetFile}`);
  console.log('Use --force to overwrite if intended.\n');
  process.exit(1);
}

const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

const template = `const request = require('supertest');
const { app } = require('../server');

describe('${capitalized} Module API Integration', () => {
  // Injected test auth context (bypasses manual login in test environment)
  const authHeader = { Authorization: 'Bearer test-token' };

  beforeAll(async () => {
    // Scaffold setup before running ${cleanName} tests
  });

  afterAll(async () => {
    // Teardown / cleanup after ${cleanName} tests
  });

  describe('GET /api/${cleanName}', () => {
    test('Rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app)
        .get('/api/${cleanName}');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    test('Returns data when authorized with valid session token', async () => {
      const res = await request(app)
        .get('/api/${cleanName}')
        .set(authHeader);

      // Adjust expectation based on module implementation
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /api/${cleanName}', () => {
    test('Validates payload and rejects missing fields with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/${cleanName}')
        .set(authHeader)
        .send({});

      expect([400, 422, 404]).toContain(res.status);
    });

    test('Executes operation successfully with valid payload', async () => {
      const payload = {
        name: 'test_${cleanName}',
        timestamp: Date.now()
      };

      const res = await request(app)
        .post('/api/${cleanName}')
        .set(authHeader)
        .send(payload);

      expect([200, 201, 404]).toContain(res.status);
    });
  });
});
`;

fs.writeFileSync(targetFile, template, 'utf8');

console.log('\n======================================================');
console.log('NexusControl Test Scaffolding Generator');
console.log('======================================================');
console.log(`✓ Boilerplate test generated successfully!`);
console.log(`File: backend/tests/${cleanName}.test.js`);
console.log(`\nRun your new test suite using:`);
console.log(`  npm test -- tests/${cleanName}.test.js`);
console.log('======================================================\n');
