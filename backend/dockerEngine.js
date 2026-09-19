const http = require('node:http');
const fs = require('node:fs');

/**
 * Enterprise Lightweight Docker Engine Client
 * Direct Unix socket communication via Node.js native http module.
 * Zero external dependencies, ultra-lean memory and CPU footprint.
 */

const DOCKER_SOCKET_PATH = '/var/run/docker.sock';

// In-memory cache for live container metrics to keep SSE telemetry fast and non-blocking
let cachedContainerMetrics = {
  available: false,
  timestamp: Date.now(),
  summary: { total: 0, running: 0, paused: 0, stopped: 0 },
  containers: []
};

let isPollingMetrics = false;

function isDockerAvailable() {
  try {
    return fs.existsSync(DOCKER_SOCKET_PATH);
  } catch {
    return false;
  }
}

/**
 * Low-level HTTP request dispatcher targeting the Docker Unix socket
 */
function dockerRequest(method, path, body = null, timeout = 6000) {
  return new Promise((resolve, reject) => {
    if (!isDockerAvailable()) {
      return reject(new Error('Docker daemon socket (/var/run/docker.sock) not found or Docker is not running.'));
    }

    const options = {
      socketPath: DOCKER_SOCKET_PATH,
      path,
      method: method.toUpperCase(),
      headers: {
        Host: 'localhost',
        Accept: 'application/json'
      },
      timeout
    };

    let payload = null;
    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        rawData += chunk;
      });

      res.on('end', () => {
        let parsed = null;
        if (rawData) {
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
        }

        const statusCode = res.statusCode || 200;

        if (statusCode >= 200 && statusCode < 300) {
          return resolve(parsed);
        }

        // Docker error format: { message: "error text" }
        const errMsg = parsed && parsed.message ? parsed.message : `Docker API error: HTTP ${statusCode}`;
        const err = new Error(errMsg);
        err.statusCode = statusCode;
        err.details = parsed;
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Docker API request timed out after ${timeout}ms: ${method} ${path}`));
    });

    req.on('error', (err) => {
      reject(new Error(`Docker socket communication error: ${err.message}`));
    });

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

/**
 * Retrieve Docker Version and Engine details
 */
async function getDockerVersion() {
  return dockerRequest('GET', '/version');
}

/**
 * Retrieve Docker System Info
 */
async function getDockerInfo() {
  return dockerRequest('GET', '/info');
}

/**
 * List all containers (running and stopped)
 */
async function listContainers(all = true) {
  const query = all ? '?all=1' : '';
  const list = await dockerRequest('GET', `/containers/json${query}`);
  return Array.isArray(list) ? list : [];
}

/**
 * Inspect container configuration, state, and network metadata
 */
async function inspectContainer(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Container ID or name is required.');
  }
  const cleanId = encodeURIComponent(id.trim());
  return dockerRequest('GET', `/containers/${cleanId}/json`);
}

/**
 * Execute container lifecycle action (start, stop, restart, kill)
 */
async function containerAction(id, action, params = {}) {
  if (!id || typeof id !== 'string') {
    throw new Error('Container ID or name is required.');
  }
  const cleanId = encodeURIComponent(id.trim());
  const validActions = ['start', 'stop', 'restart', 'kill'];
  const act = action.toLowerCase().trim();

  if (!validActions.includes(act)) {
    throw new Error(`Invalid container action '${action}'. Allowed: ${validActions.join(', ')}`);
  }

  let query = '';
  if (act === 'stop' || act === 'restart') {
    const timeout = typeof params.t === 'number' ? params.t : 10;
    query = `?t=${timeout}`;
  }

  const result = await dockerRequest('POST', `/containers/${cleanId}/${act}${query}`);
  // Invalidate cached metrics so telemetry catches changes quickly
  triggerMetricsSampling();
  return { success: true, action: act, id, details: result };
}

/**
 * Delete / remove a container
 */
async function deleteContainer(id, force = false, removeVolumes = false) {
  if (!id || typeof id !== 'string') {
    throw new Error('Container ID or name is required.');
  }
  const cleanId = encodeURIComponent(id.trim());
  const query = `?force=${force ? 1 : 0}&v=${removeVolumes ? 1 : 0}`;
  const result = await dockerRequest('DELETE', `/containers/${cleanId}${query}`);
  triggerMetricsSampling();
  return { success: true, action: 'delete', id, details: result };
}

/**
 * Get snapshot resource usage statistics for a container (single read)
 */
async function getContainerStats(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Container ID or name is required.');
  }
  const cleanId = encodeURIComponent(id.trim());
  return dockerRequest('GET', `/containers/${cleanId}/stats?stream=false`, null, 4000);
}

/**
 * Calculate CPU % from Docker stats payload
 */
function calculateCpuPercent(stats) {
  try {
    const cpuStats = stats.cpu_stats;
    const preCpuStats = stats.precpu_stats;

    if (!cpuStats || !preCpuStats) return 0;

    const cpuDelta = (cpuStats.cpu_usage?.total_usage || 0) - (preCpuStats.cpu_usage?.total_usage || 0);
    const systemDelta = (cpuStats.system_cpu_usage || 0) - (preCpuStats.system_cpu_usage || 0);
    const onlineCpus = cpuStats.online_cpus || cpuStats.cpu_usage?.percpu_usage?.length || 1;

    if (systemDelta > 0 && cpuDelta > 0) {
      return parseFloat(((cpuDelta / systemDelta) * onlineCpus * 100.0).toFixed(2));
    }
  } catch {}
  return 0;
}

/**
 * Calculate Memory usage from Docker stats payload
 */
function calculateMemoryUsage(stats) {
  try {
    const memStats = stats.memory_stats;
    if (!memStats || !memStats.usage) {
      return { used: 0, limit: 0, percent: 0 };
    }

    const cache = memStats.stats?.cache || memStats.stats?.inactive_file || 0;
    const used = Math.max(0, memStats.usage - cache);
    const limit = memStats.limit || 0;
    const percent = limit > 0 ? parseFloat(((used / limit) * 100).toFixed(2)) : 0;

    return { used, limit, percent };
  } catch {}
  return { used: 0, limit: 0, percent: 0 };
}

/**
 * Calculate Network I/O bytes from Docker stats payload
 */
function calculateNetworkIo(stats) {
  let rxBytes = 0;
  let txBytes = 0;

  try {
    const networks = stats.networks;
    if (networks && typeof networks === 'object') {
      for (const net of Object.values(networks)) {
        rxBytes += net.rx_bytes || 0;
        txBytes += net.tx_bytes || 0;
      }
    }
  } catch {}

  return { rxBytes, txBytes };
}

/**
 * Asynchronous Background Poller: Samples container metrics without blocking SSE
 */
async function triggerMetricsSampling() {
  if (isPollingMetrics) return;
  isPollingMetrics = true;

  try {
    if (!isDockerAvailable()) {
      cachedContainerMetrics = {
        available: false,
        timestamp: Date.now(),
        summary: { total: 0, running: 0, paused: 0, stopped: 0 },
        containers: []
      };
      return;
    }

    const containers = await listContainers(true);

    let runningCount = 0;
    let pausedCount = 0;
    let stoppedCount = 0;

    const formattedList = [];

    for (const c of containers) {
      const state = (c.State || '').toLowerCase();
      if (state === 'running') runningCount++;
      else if (state === 'paused') pausedCount++;
      else stoppedCount++;

      const names = (c.Names || []).map(n => n.startsWith('/') ? n.slice(1) : n);
      const primaryName = names[0] || c.Id.slice(0, 12);

      // Extract port mappings
      const ports = (c.Ports || []).map(p => {
        if (p.PublicPort) {
          return `${p.IP || '0.0.0.0'}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`;
        }
        return `${p.PrivatePort}/${p.Type}`;
      });

      formattedList.push({
        id: c.Id,
        shortId: c.Id.slice(0, 12),
        name: primaryName,
        names,
        image: c.Image,
        imageId: c.ImageID,
        command: c.Command,
        created: c.Created,
        state: c.State,
        status: c.Status,
        ports,
        cpuPercent: 0,
        memUsed: 0,
        memLimit: 0,
        memPercent: 0,
        netRx: 0,
        netTx: 0
      });
    }

    // For running containers, fetch lightweight single-snapshot stats
    // Limit to max 10 concurrent requests to prevent socket saturation
    const runningContainers = formattedList.filter(c => c.state === 'running');
    const sampleBatch = runningContainers.slice(0, 10);

    await Promise.all(
      sampleBatch.map(async (item) => {
        try {
          const stats = await getContainerStats(item.id);
          const cpu = calculateCpuPercent(stats);
          const mem = calculateMemoryUsage(stats);
          const net = calculateNetworkIo(stats);

          item.cpuPercent = cpu;
          item.memUsed = mem.used;
          item.memLimit = mem.limit;
          item.memPercent = mem.percent;
          item.netRx = net.rxBytes;
          item.netTx = net.txBytes;
        } catch {
          // If stats collection failed for one container, retain zeroes
        }
      })
    );

    cachedContainerMetrics = {
      available: true,
      timestamp: Date.now(),
      summary: {
        total: containers.length,
        running: runningCount,
        paused: pausedCount,
        stopped: stoppedCount
      },
      containers: formattedList
    };
  } catch (err) {
    cachedContainerMetrics = {
      available: false,
      timestamp: Date.now(),
      error: err.message,
      summary: { total: 0, running: 0, paused: 0, stopped: 0 },
      containers: []
    };
  } finally {
    isPollingMetrics = false;
  }
}

// Start background sampling loop (every 3.5 seconds)
let samplingIntervalId = null;
function startBackgroundSampling(intervalMs = 3500) {
  if (samplingIntervalId) clearInterval(samplingIntervalId);
  triggerMetricsSampling(); // Initial pull
  samplingIntervalId = setInterval(triggerMetricsSampling, intervalMs);
}

function stopBackgroundSampling() {
  if (samplingIntervalId) {
    clearInterval(samplingIntervalId);
    samplingIntervalId = null;
  }
}

function getCachedContainerMetrics() {
  return cachedContainerMetrics;
}

module.exports = {
  DOCKER_SOCKET_PATH,
  isDockerAvailable,
  dockerRequest,
  getDockerVersion,
  getDockerInfo,
  listContainers,
  inspectContainer,
  containerAction,
  deleteContainer,
  getContainerStats,
  calculateCpuPercent,
  calculateMemoryUsage,
  calculateNetworkIo,
  triggerMetricsSampling,
  startBackgroundSampling,
  stopBackgroundSampling,
  getCachedContainerMetrics
};
