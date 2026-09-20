const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Enterprise Port Inspector & Auto-Allocator Engine
 * Native zero-dependency port checking using node:net
 */

/**
 * Check whether a TCP port is currently free and available to bind on a host
 * @param {number|string} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function checkPortAvailable(port, host = '127.0.0.1') {
  const numPort = Number(port);
  if (!Number.isInteger(numPort) || numPort < 1 || numPort > 65535) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(numPort, host);
  });
}

/**
 * Scan all managed vHost configurations in conf.d to find ports already allocated,
 * avoiding collision even if a backend container/daemon is temporarily stopped.
 * @param {string} confDir
 * @returns {Set<number>}
 */
function getAllocatedVHostPorts(confDir = process.env.NGINX_CONF_DIR || '/etc/nginx/conf.d') {
  const allocated = new Set();
  try {
    if (!fs.existsSync(confDir)) {
      return allocated;
    }
    const files = fs.readdirSync(confDir);
    for (const file of files) {
      if (!file.startsWith('nexus_vhost_')) continue;
      if (!file.endsWith('.conf') && !file.endsWith('.conf.disabled')) continue;

      const fullPath = path.join(confDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Match proxy_pass http://127.0.0.1:PORT or # Target: http://127.0.0.1:PORT or 127.0.0.1:PORT
        const regex = /(?:proxy_pass\s+https?:\/\/(?:[a-zA-Z0-9.-]+):(\d+)|#\s*Target:\s*https?:\/\/(?:[a-zA-Z0-9.-]+):(\d+)|#\s*Target:\s*(?:[a-zA-Z0-9.-]+):(\d+))/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const p = parseInt(match[1] || match[2] || match[3], 10);
          if (!isNaN(p) && p >= 1 && p <= 65535) {
            allocated.add(p);
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[portInspector] Warning reading vhost configs:', err.message);
  }
  return allocated;
}

/**
 * Find the next available TCP port in the safe range (default 8080-9999).
 * Checks both active network listeners AND existing allocated ports in vHost configs.
 * @param {number} startPort
 * @param {number} endPort
 * @param {string} host
 * @returns {Promise<number>}
 */
async function findNextAvailablePort(startPort = 8080, endPort = 9999, host = '127.0.0.1') {
  const allocatedVHostPorts = getAllocatedVHostPorts();

  // Search primary range
  for (let port = startPort; port <= endPort; port++) {
    if (allocatedVHostPorts.has(port)) {
      continue;
    }
    const isFree = await checkPortAvailable(port, host);
    if (isFree) {
      return port;
    }
  }

  // Fallback to extended range (10000 - 65535) if primary range is saturated
  for (let port = 10000; port <= 65535; port++) {
    if (allocatedVHostPorts.has(port)) {
      continue;
    }
    const isFree = await checkPortAvailable(port, host);
    if (isFree) {
      return port;
    }
  }

  throw new Error('No available TCP ports found in range 8080-65535.');
}

/**
 * Extract port number from a target string (e.g. "http://127.0.0.1:8888", "8888", "127.0.0.1:8888")
 * @param {string|number} target
 * @returns {number|null}
 */
function extractPortFromTarget(target) {
  if (!target) return null;
  const str = String(target).trim();
  // If just a number
  if (/^\d+$/.test(str)) {
    const p = parseInt(str, 10);
    return (p >= 1 && p <= 65535) ? p : null;
  }
  // If url or host:port
  const match = str.match(/:(\d+)(?:\/|$)/);
  if (match) {
    const p = parseInt(match[1], 10);
    return (p >= 1 && p <= 65535) ? p : null;
  }
  return null;
}

module.exports = {
  checkPortAvailable,
  getAllocatedVHostPorts,
  findNextAvailablePort,
  extractPortFromTarget
};
