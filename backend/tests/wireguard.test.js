const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('../server');
const wireguardEngine = require('../wireguardEngine');
const auditLogger = require('../auditLogger');

describe('Zero Trust Network (WireGuard) Test Suite', () => {
  let tmpDir;
  let testConfigPath;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-test-'));
    testConfigPath = path.join(tmpDir, 'wg0.conf');
    process.env.WIREGUARD_CONFIG_PATH = testConfigPath;
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    delete process.env.WIREGUARD_CONFIG_PATH;
  });

  describe('Native Engine & Key Generation', () => {
    test('generateKeyPair generates valid WireGuard Curve25519 keys', () => {
      const keys = wireguardEngine.generateKeyPair();
      expect(keys).toBeDefined();
      expect(typeof keys.privateKey).toBe('string');
      expect(typeof keys.publicKey).toBe('string');
      expect(Buffer.from(keys.privateKey, 'base64').length).toBe(32);
      expect(Buffer.from(keys.publicKey, 'base64').length).toBe(32);
    });

    test('initServerInterface creates wg0.conf on 10.8.0.1/24', () => {
      const res = wireguardEngine.initServerInterface();
      expect(res.initialized).toBe(true);
      expect(res.address).toBe('10.8.0.1/24');
      expect(res.listenPort).toBe(51820);
      expect(fs.existsSync(testConfigPath)).toBe(true);

      const content = fs.readFileSync(testConfigPath, 'utf8');
      expect(content).toContain('[Interface]');
      expect(content).toContain('Address = 10.8.0.1/24');
      expect(content).toContain('ListenPort = 51820');
      expect(content).toContain('PrivateKey = ');
    });

    test('Sequential IP allocation starts at 10.8.0.2', () => {
      const ip1 = wireguardEngine.allocateNextIp();
      expect(ip1).toBe('10.8.0.2');
    });

    test('generatePeer creates client config, QR code, and updates wg0.conf', async () => {
      const peer = await wireguardEngine.generatePeer('alice', 'user-alice-123');
      expect(peer).toBeDefined();
      expect(peer.id).toBeDefined();
      expect(peer.username).toBe('alice');
      expect(peer.internalIp).toBe('10.8.0.2');
      expect(peer.publicKey).toBeDefined();
      expect(peer.clientConfig).toContain('[Interface]');
      expect(peer.clientConfig).toContain('Address = 10.8.0.2/32');
      expect(peer.clientConfig).toContain('[Peer]');
      expect(peer.clientConfig).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
      expect(peer.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      // Verify wg0.conf has alice's peer block
      const conf = fs.readFileSync(testConfigPath, 'utf8');
      expect(conf).toContain('Peer: alice');
      expect(conf).toContain(`PublicKey = ${peer.publicKey}`);
      expect(conf).toContain('AllowedIPs = 10.8.0.2/32');
    });

    test('Subsequent peer receives next sequential IP 10.8.0.3', async () => {
      const peer2 = await wireguardEngine.generatePeer('bob');
      expect(peer2.internalIp).toBe('10.8.0.3');
      expect(peer2.username).toBe('bob');
    });

    test('removePeer strips peer block from wg0.conf and deletes from DB', async () => {
      const peersBefore = wireguardEngine.getPeers();
      const alice = peersBefore.find(p => p.username === 'alice');
      expect(alice).toBeDefined();

      const result = wireguardEngine.removePeer(alice.id);
      expect(result.success).toBe(true);

      const conf = fs.readFileSync(testConfigPath, 'utf8');
      expect(conf).not.toContain(alice.public_key);

      const peersAfter = wireguardEngine.getPeers();
      expect(peersAfter.some(p => p.id === alice.id)).toBe(false);
    });
  });

  describe('REST API & Route Hardening', () => {
    test('Superadmin can access GET /api/wireguard/status', async () => {
      const res = await request(app)
        .get('/api/wireguard/status')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status.address).toBe('10.8.0.1/24');
      expect(res.body.status.listenPort).toBe(51820);
      expect(res.body.status.publicKey).toBeDefined();
    });

    test('Superadmin can list active peers via GET /api/wireguard/peers', async () => {
      const res = await request(app)
        .get('/api/wireguard/peers')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.peers)).toBe(true);
      expect(res.body.peers.some(p => p.username === 'bob')).toBe(true);
    });

    test('Superadmin can create a peer via POST /api/wireguard/peers', async () => {
      const res = await request(app)
        .post('/api/wireguard/peers')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({ username: 'charlie' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.peer.username).toBe('charlie');
      expect(res.body.peer.internalIp).toBeDefined();
      expect(res.body.peer.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    test('Superadmin can retrieve peer config and download via GET /api/wireguard/peers/:id/config', async () => {
      const peersRes = await request(app)
        .get('/api/wireguard/peers')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      const charlie = peersRes.body.peers.find(p => p.username === 'charlie');
      expect(charlie).toBeDefined();

      const confRes = await request(app)
        .get(`/api/wireguard/peers/${charlie.id}/config`)
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(confRes.status).toBe(200);
      expect(confRes.body.config.clientConfig).toContain('[Interface]');
      expect(confRes.body.config.qrCodeDataUrl).toBeDefined();

      const downloadRes = await request(app)
        .get(`/api/wireguard/peers/${charlie.id}/config?download=true`)
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-disposition']).toContain('attachment');
      expect(downloadRes.text).toContain('[Interface]');
    });

    test('Superadmin can revoke peer via DELETE /api/wireguard/peers/:id', async () => {
      const peersRes = await request(app)
        .get('/api/wireguard/peers')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      const charlie = peersRes.body.peers.find(p => p.username === 'charlie');
      const delRes = await request(app)
        .delete(`/api/wireguard/peers/${charlie.id}`)
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });

    test('Operator role is strictly forbidden (HTTP 403) from WireGuard endpoints', async () => {
      const res = await request(app)
        .get('/api/wireguard/status')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'operator');

      expect(res.status).toBe(403);
    });

    test('Viewer role is strictly forbidden (HTTP 403) from WireGuard endpoints', async () => {
      const res = await request(app)
        .get('/api/wireguard/status')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'viewer');

      expect(res.status).toBe(403);
    });

    test('Custom role without network module is strictly forbidden (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/wireguard/status')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'custom')
        .set('x-test-policies', JSON.stringify({ modules: { overview: true, files: true } }));

      expect(res.status).toBe(403);
    });

    test('Unauthenticated request is rejected with HTTP 401', async () => {
      const res = await request(app).get('/api/wireguard/status');
      expect(res.status).toBe(401);
    });
  });

  describe('Audit Ledger Chaining', () => {
    test('VPN peer lifecycle events are chained in the SHA-256 ledger', async () => {
      const createRes = await request(app)
        .post('/api/wireguard/peers')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({ username: 'diana' });

      expect(createRes.status).toBe(201);
      const dianaPeer = createRes.body.peer;

      const delRes = await request(app)
        .delete(`/api/wireguard/peers/${dianaPeer.id}`)
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(delRes.status).toBe(200);

      // Verify audit logs
      const auditRes = await request(app)
        .get('/api/audit/logs?search=VPN_PEER')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.logs.map(l => l.action);
      expect(actions).toContain('VPN_PEER_CREATED');
      expect(actions).toContain('VPN_PEER_REVOKED');

      // Verify audit integrity
      const verifyRes = await request(app)
        .get('/api/audit/verify')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(true);
    });
  });

  describe('User Creation Integration Hook', () => {
    test('POST /api/users with generate_vpn: true creates user and linked WireGuard profile', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({
          username: 'vpnuser1',
          password: 'TestPassword123!',
          role: 'operator',
          generate_vpn: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe('vpnuser1');
      expect(res.body.vpnProfile).toBeDefined();
      expect(res.body.vpnProfile.username).toBe('vpnuser1');
      expect(res.body.vpnProfile.internalIp).toBeDefined();
      expect(res.body.vpnProfile.clientConfig).toContain('[Interface]');
      expect(res.body.vpnProfile.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });
});
