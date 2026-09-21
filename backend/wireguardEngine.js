const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const qrcode = require('qrcode');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_CONFIG_PATH = '/etc/wireguard/wg0.conf';
const SUBNET_PREFIX = '10.8.0.';
const SERVER_IP = '10.8.0.1/24';
const SERVER_PORT = 51820;

let db = null;
let selectAllPeersStmt = null;
let selectPeerByIdStmt = null;
let selectPeerByPublicKeyStmt = null;
let insertPeerStmt = null;
let deletePeerStmt = null;
let countPeersStmt = null;

/**
 * Get configured WireGuard wg0.conf path
 */
function getConfigPath() {
  return process.env.WIREGUARD_CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

/**
 * Initialize SQLite database statements
 */
function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  } else if (!db) {
    const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
    db = new DatabaseSync(dbPath);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vpn_peers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      public_key TEXT NOT NULL UNIQUE,
      internal_ip TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      client_config TEXT
    );
  `);

  selectAllPeersStmt = db.prepare(`
    SELECT id, user_id, username, public_key, internal_ip, created_at 
    FROM vpn_peers 
    ORDER BY created_at DESC
  `);

  selectPeerByIdStmt = db.prepare(`
    SELECT * FROM vpn_peers WHERE id = ?
  `);

  selectPeerByPublicKeyStmt = db.prepare(`
    SELECT * FROM vpn_peers WHERE public_key = ?
  `);

  insertPeerStmt = db.prepare(`
    INSERT INTO vpn_peers (id, user_id, username, public_key, internal_ip, created_at, client_config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  deletePeerStmt = db.prepare(`
    DELETE FROM vpn_peers WHERE id = ?
  `);

  countPeersStmt = db.prepare(`
    SELECT COUNT(*) as count FROM vpn_peers
  `);
}

// Auto-initialize DB on module load if not in test
if (process.env.NODE_ENV !== 'test') {
  try {
    initDb();
  } catch (err) {
    console.error('[WireGuardEngine] DB initialization error:', err.message);
  }
}

/**
 * Ensure IPv4 forwarding is enabled on the Linux host
 */
function ensureIpForwarding() {
  try {
    const forwardPath = '/proc/sys/net/ipv4/ip_forward';
    if (fs.existsSync(forwardPath)) {
      const current = fs.readFileSync(forwardPath, 'utf8').trim();
      if (current !== '1') {
        try {
          fs.writeFileSync(forwardPath, '1\n');
        } catch {
          cp.execSync('sysctl -w net.ipv4.ip_forward=1', { stdio: 'ignore' });
        }
      }
      return true;
    }
  } catch (err) {
    // Non-fatal if running in unprivileged container or mock environment
    return false;
  }
  return false;
}

/**
 * Generate Curve25519 keypair for WireGuard
 * Uses wg command if available, otherwise native Node.js crypto fallback
 */
function generateKeyPair() {
  try {
    const privateKey = cp.execSync('wg genkey', { encoding: 'utf8' }).trim();
    const publicKey = cp.execSync('wg pubkey', { input: privateKey + '\n', encoding: 'utf8' }).trim();
    return { privateKey, publicKey };
  } catch {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' }
    });
    const rawPriv = privateKey.subarray(privateKey.length - 32);
    const rawPub = publicKey.subarray(publicKey.length - 32);
    return {
      privateKey: rawPriv.toString('base64'),
      publicKey: rawPub.toString('base64')
    };
  }
}

/**
 * Derive public key from private key
 */
function parseServerConfig(content) {
  const lines = content.split('\n');
  let privateKey = '';
  let address = SERVER_IP;
  let listenPort = SERVER_PORT;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('PrivateKey')) {
      const parts = trimmed.split('=');
      if (parts[1]) {
        const val = parts[1].trim();
        if (val.length === 44) privateKey = val;
      }
    } else if (trimmed.startsWith('Address')) {
      const parts = trimmed.split('=');
      if (parts[1]) address = parts[1].trim();
    } else if (trimmed.startsWith('ListenPort')) {
      const parts = trimmed.split('=');
      if (parts[1]) listenPort = parseInt(parts[1].trim(), 10) || SERVER_PORT;
    }
  }

  return { privateKey, address, listenPort };
}

/**
 * Derive public key from private key
 */
function derivePublicKey(privateKey) {
  if (!privateKey || typeof privateKey !== 'string') return '';
  const clean = privateKey.trim();
  if (clean.length !== 44) return '';

  try {
    return cp.execSync('wg pubkey', {
      input: clean + '\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch {
    // If wg binary fails, parse from X25519 DER
    try {
      const privBuffer = Buffer.from(clean, 'base64');
      const pkcs8Header = Buffer.from('302e020100300506032b656e04220420', 'hex');
      const fullDer = Buffer.concat([pkcs8Header, privBuffer]);
      const privKeyObj = crypto.createPrivateKey({ key: fullDer, format: 'der', type: 'pkcs8' });
      const pubKeyObj = crypto.createPublicKey(privKeyObj);
      const spki = pubKeyObj.export({ type: 'spki', format: 'der' });
      return spki.subarray(spki.length - 32).toString('base64');
    } catch {
      return '';
    }
  }
}

/**
 * Initialize /etc/wireguard/wg0.conf if it does not exist
 */
function initServerInterface() {
  ensureIpForwarding();
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    } catch {}
  }

  if (!fs.existsSync(configPath)) {
    const { privateKey, publicKey } = generateKeyPair();
    const serverConf = [
      '# NexusControl Zero Trust WireGuard Server Configuration',
      '# Auto-generated by NexusControl Engine',
      '[Interface]',
      `Address = ${SERVER_IP}`,
      `ListenPort = ${SERVER_PORT}`,
      `PrivateKey = ${privateKey}`,
      'SaveConfig = false',
      ''
    ].join('\n');

    fs.writeFileSync(configPath, serverConf, { mode: 0o600 });
    return {
      initialized: true,
      publicKey,
      address: SERVER_IP,
      listenPort: SERVER_PORT
    };
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const parsed = parseServerConfig(content);
  const publicKey = parsed.privateKey ? derivePublicKey(parsed.privateKey) : '';

  return {
    initialized: false,
    publicKey,
    address: parsed.address,
    listenPort: parsed.listenPort
  };
}

/**
 * Detect host public IP or primary network IP for client endpoint
 */
function getHostEndpoint() {
  if (process.env.WIREGUARD_ENDPOINT) {
    return process.env.WIREGUARD_ENDPOINT;
  }
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('10.8.')) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Allocate next available IP in 10.8.0.2 .. 10.8.0.254
 */
function allocateNextIp() {
  const usedOctets = new Set([1]); // 1 is reserved for server

  // Check config file for existing AllowedIPs
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const regex = /AllowedIPs\s*=\s*10\.8\.0\.(\d+)/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const octet = parseInt(match[1], 10);
      if (octet >= 1 && octet <= 254) {
        usedOctets.add(octet);
      }
    }
  }

  // Check DB for any active peers
  if (selectAllPeersStmt) {
    try {
      const rows = selectAllPeersStmt.all();
      for (const row of rows) {
        if (row.internal_ip) {
          const parts = row.internal_ip.replace('/32', '').split('.');
          if (parts.length === 4) {
            const octet = parseInt(parts[3], 10);
            if (octet >= 1 && octet <= 254) {
              usedOctets.add(octet);
            }
          }
        }
      }
    } catch {}
  }

  for (let i = 2; i <= 254; i++) {
    if (!usedOctets.has(i)) {
      return `${SUBNET_PREFIX}${i}`;
    }
  }

  throw new Error('WireGuard IP address exhaustion: No available IPs in 10.8.0.0/24 subnet');
}

/**
 * Synchronize the WireGuard runtime interface without dropping active connections
 */
function syncInterface() {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  try {
    cp.execSync('bash -c "wg syncconf wg0 <(wg-quick strip wg0)"', {
      stdio: 'pipe',
      timeout: 5000
    });
    return true;
  } catch (err) {
    // If wg0 is not active yet, try bringing it up
    try {
      cp.execSync('wg-quick up wg0', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Generate a new WireGuard peer
 * @param {string} username Username or client identifier
 * @param {string} [userId] Optional linked user ID
 */
async function generatePeer(username, userId = null) {
  if (!username) {
    throw new Error('Username is required for WireGuard peer generation');
  }

  // Ensure interface and DB are initialized
  if (!db) initDb();
  initServerInterface();

  const configPath = getConfigPath();
  const serverContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const serverParsed = parseServerConfig(serverContent);
  const serverPublicKey = serverParsed.privateKey ? derivePublicKey(serverParsed.privateKey) : '';

  const { privateKey: clientPrivateKey, publicKey: clientPublicKey } = generateKeyPair();
  const assignedIp = allocateNextIp();
  const peerId = crypto.randomUUID();
  const createdAt = Date.now();
  const endpoint = `${getHostEndpoint()}:${serverParsed.listenPort || SERVER_PORT}`;

  // Client configuration (.conf)
  const clientConfig = [
    `# NexusControl Zero Trust VPN Client Profile`,
    `# User: ${username}`,
    `# Created: ${new Date(createdAt).toISOString()}`,
    `[Interface]`,
    `PrivateKey = ${clientPrivateKey}`,
    `Address = ${assignedIp}/32`,
    `DNS = 1.1.1.1, 8.8.8.8`,
    ``,
    `[Peer]`,
    `PublicKey = ${serverPublicKey}`,
    `Endpoint = ${endpoint}`,
    `AllowedIPs = 0.0.0.0/0, ::/0`,
    `PersistentKeepalive = 25`,
    ``
  ].join('\n');

  // Generate mobile-ready QR code data URL
  const qrCodeDataUrl = await qrcode.toDataURL(clientConfig);

  // Append [Peer] block to wg0.conf
  const peerBlock = [
    ``,
    `# Peer: ${username} (id: ${peerId})`,
    `[Peer]`,
    `PublicKey = ${clientPublicKey}`,
    `AllowedIPs = ${assignedIp}/32`,
    ``
  ].join('\n');

  fs.appendFileSync(configPath, peerBlock);

  // Sync interface live
  syncInterface();

  // Save to database
  if (insertPeerStmt) {
    insertPeerStmt.run(
      peerId,
      userId || null,
      username,
      clientPublicKey,
      assignedIp,
      createdAt,
      clientConfig
    );
  }

  return {
    id: peerId,
    userId: userId || null,
    username,
    publicKey: clientPublicKey,
    internalIp: assignedIp,
    clientConfig,
    qrCodeDataUrl,
    createdAt
  };
}

/**
 * Remove an existing WireGuard peer by ID or public key
 */
function removePeer(peerIdOrPublicKey) {
  if (!db) initDb();
  if (!peerIdOrPublicKey) {
    throw new Error('Peer ID or Public Key is required for removal');
  }

  // Find peer record
  let peer = null;
  if (selectPeerByIdStmt) {
    peer = selectPeerByIdStmt.get(peerIdOrPublicKey);
  }
  if (!peer && selectPeerByPublicKeyStmt) {
    peer = selectPeerByPublicKeyStmt.get(peerIdOrPublicKey);
  }

  const publicKeyToRemove = peer ? peer.public_key : peerIdOrPublicKey;

  // Remove peer block from wg0.conf
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const sections = content.split(/(?=\[Peer\])/g);
    const retained = [];

    for (const section of sections) {
      if (!section.includes(publicKeyToRemove)) {
        retained.push(section);
      }
    }

    fs.writeFileSync(configPath, retained.join(''), { mode: 0o600 });
  }

  // Sync interface live
  syncInterface();

  // Delete from database
  if (peer && deletePeerStmt) {
    deletePeerStmt.run(peer.id);
  }

  return {
    success: true,
    id: peer ? peer.id : null,
    publicKey: publicKeyToRemove,
    username: peer ? peer.username : 'unknown'
  };
}

/**
 * Retrieve status of WireGuard server interface
 */
function getServerStatus() {
  const configPath = getConfigPath();
  const configExists = fs.existsSync(configPath);
  let publicKey = '';
  let address = SERVER_IP;
  let listenPort = SERVER_PORT;
  let active = false;

  if (configExists) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = parseServerConfig(content);
      address = parsed.address;
      listenPort = parsed.listenPort;
      if (parsed.privateKey) {
        publicKey = derivePublicKey(parsed.privateKey);
      }
    } catch {}
  }

  // Check if interface is up via wg show
  try {
    const wgOut = cp.execSync('wg show wg0', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (wgOut && wgOut.includes('interface: wg0')) {
      active = true;
    }
  } catch {
    active = false;
  }

  let peerCount = 0;
  if (countPeersStmt) {
    try {
      const res = countPeersStmt.get();
      peerCount = res ? res.count : 0;
    } catch {}
  }

  return {
    configured: configExists,
    active,
    publicKey,
    address,
    listenPort,
    peerCount,
    ipForwarding: ensureIpForwarding()
  };
}

/**
 * List all registered peers
 */
function getPeers() {
  if (!db) initDb();
  let peers = [];
  if (selectAllPeersStmt) {
    try {
      peers = selectAllPeersStmt.all();
    } catch {}
  }
  return peers;
}

/**
 * Retrieve peer configuration and QR code
 */
async function getPeerConfig(peerId) {
  if (!db) initDb();
  if (!selectPeerByIdStmt) return null;
  const peer = selectPeerByIdStmt.get(peerId);
  if (!peer) return null;

  let qrCodeDataUrl = null;
  if (peer.client_config) {
    try {
      qrCodeDataUrl = await qrcode.toDataURL(peer.client_config);
    } catch {}
  }

  return {
    id: peer.id,
    userId: peer.user_id,
    username: peer.username,
    publicKey: peer.public_key,
    internalIp: peer.internal_ip,
    clientConfig: peer.client_config,
    qrCodeDataUrl,
    createdAt: peer.created_at
  };
}

module.exports = {
  initDb,
  getConfigPath,
  ensureIpForwarding,
  generateKeyPair,
  derivePublicKey,
  initServerInterface,
  allocateNextIp,
  generatePeer,
  removePeer,
  getServerStatus,
  getPeers,
  getPeerConfig
};
