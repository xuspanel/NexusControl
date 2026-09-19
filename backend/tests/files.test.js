const request = require('supertest');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('../server');

describe('Files Manager & Path Traversal Guardrails', () => {
  const authHeader = { Authorization: 'Bearer test-token' };
  const sandboxedDir = path.join('/tmp', 'nexus_test');

  beforeAll(() => {
    if (!fs.existsSync(sandboxedDir)) {
      fs.mkdirSync(sandboxedDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(sandboxedDir)) {
        fs.rmSync(sandboxedDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('Strictly rejects relative directory traversal attempts with HTTP 403', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: '../../../etc/shadow' })
      .set(authHeader);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Path traversal forbidden');
  });

  test('Strictly blocks direct access to protected system authentication files with HTTP 403', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: '/etc/shadow' })
      .set(authHeader);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access to system authentication files is strictly forbidden');
  });

  test('Rejects null byte injection in paths with HTTP 400', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: '/tmp/nexus_test/file.txt\0.js' })
      .set(authHeader);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Null byte injection detected');
  });

  test('Lifecycle within sandboxed directory: create, write, read, and delete', async () => {
    const testFileName = 'sandbox_test.txt';
    const testFilePath = path.join(sandboxedDir, testFileName);

    // 1. Create file
    const createRes = await request(app)
      .post('/api/files/create')
      .set(authHeader)
      .send({ path: sandboxedDir, name: testFileName });

    expect(createRes.status).toBe(200);
    expect(fs.existsSync(testFilePath)).toBe(true);

    // 2. Write file
    const writeRes = await request(app)
      .post('/api/files/save')
      .set(authHeader)
      .send({ path: testFilePath, content: 'Sandboxed Test Content 123' });

    expect(writeRes.status).toBe(200);
    expect(writeRes.body.success).toBe(true);

    // 3. Read file
    const readRes = await request(app)
      .get('/api/files/read')
      .query({ path: testFilePath })
      .set(authHeader);

    expect(readRes.status).toBe(200);
    expect(readRes.body.content).toBe('Sandboxed Test Content 123');

    // 4. Permanent Delete
    const deleteRes = await request(app)
      .delete('/api/files')
      .set(authHeader)
      .send({ paths: [testFilePath] });

    expect(deleteRes.status).toBe(200);
    expect(fs.existsSync(testFilePath)).toBe(false);
  });
});
