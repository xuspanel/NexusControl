const express = require('express');
const router = express.Router();
const dockerEngine = require('./dockerEngine');
const auditLogger = require('./auditLogger');

/**
 * Enterprise Docker Management REST API
 * All endpoints protected by upstream authMiddleware and ipWhitelistMiddleware
 */

// 1. Docker Daemon Status & Engine Details
router.get('/status', async (req, res) => {
  try {
    const available = dockerEngine.isDockerAvailable();
    if (!available) {
      return res.json({
        available: false,
        message: 'Docker daemon Unix socket (/var/run/docker.sock) is unavailable or Docker is stopped.'
      });
    }

    const [version, info] = await Promise.all([
      dockerEngine.getDockerVersion().catch(err => ({ error: err.message })),
      dockerEngine.getDockerInfo().catch(err => ({ error: err.message }))
    ]);

    res.json({
      available: !version.error,
      version: version.Version || 'Unknown',
      apiVersion: version.ApiVersion || 'Unknown',
      os: version.Os || 'linux',
      arch: version.Arch || 'arm64',
      kernelVersion: version.KernelVersion || '',
      containersCount: info.Containers || 0,
      runningCount: info.ContainersRunning || 0,
      pausedCount: info.ContainersPaused || 0,
      stoppedCount: info.ContainersStopped || 0,
      imagesCount: info.Images || 0,
      rawVersion: version,
      rawInfo: info
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function enforceContainerJail(req, res, next) {
  if (req.user?.role !== 'custom') {
    return next();
  }

  const allowed = req.user?.granular_policies?.resources?.allowed_containers || [];
  if (allowed.includes('*')) {
    return next();
  }

  const { id } = req.params;
  if (!id) {
    return next();
  }

  // Fast check: direct ID or prefix match
  let isAllowed = allowed.some(a => a === id || id.startsWith(a));
  let containerName = id;

  if (!isAllowed) {
    try {
      const inspect = await dockerEngine.inspectContainer(id);
      if (inspect && inspect.Name) {
        containerName = inspect.Name.startsWith('/') ? inspect.Name.slice(1) : inspect.Name;
        isAllowed = allowed.includes(containerName);
      }
    } catch {}
  }

  if (!isAllowed) {
    auditLogger.logEvent({
      action: 'SECURITY_VIOLATION',
      user: req.user?.username || 'unknown',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'] || 'system',
      targetResource: `container:${containerName}`,
      payload: {
        reason: 'CONTAINER_JAILBREAK_ATTEMPT',
        requestedContainer: id,
        containerName,
        allowedContainers: allowed
      }
    });

    return res.status(403).json({
      error: `Forbidden: Container '${id}' is not permitted by policy.`,
      requestedContainer: id,
      allowedContainers: allowed
    });
  }

  next();
}

// 2. List Containers (with live cached resource telemetry)
router.get('/containers', async (req, res) => {
  try {
    if (!dockerEngine.isDockerAvailable()) {
      return res.json([]);
    }

    const metrics = dockerEngine.getCachedContainerMetrics();
    let containerList = [];

    if (metrics.available && metrics.containers.length > 0) {
      containerList = metrics.containers;
    } else {
      // Fallback: Direct query if background cache has not finished initial run
      const rawList = await dockerEngine.listContainers(true);
      containerList = rawList.map(c => {
        const names = (c.Names || []).map(n => n.startsWith('/') ? n.slice(1) : n);
        const ports = (c.Ports || []).map(p => {
          if (p.PublicPort) {
            return `${p.IP || '0.0.0.0'}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`;
          }
          return `${p.PrivatePort}/${p.Type}`;
        });

        return {
          id: c.Id,
          shortId: c.Id.slice(0, 12),
          name: names[0] || c.Id.slice(0, 12),
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
        };
      });
    }

    if (req.user?.role === 'custom') {
      const allowed = req.user?.granular_policies?.resources?.allowed_containers || [];
      if (!allowed.includes('*')) {
        containerList = containerList.filter(c =>
          allowed.includes(c.id) ||
          allowed.includes(c.shortId) ||
          allowed.includes(c.name) ||
          (c.names && c.names.some(n => allowed.includes(n)))
        );
      }
    }

    res.json(containerList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Inspect Container (Full JSON details)
router.get('/containers/:id', enforceContainerJail, async (req, res) => {
  try {
    const { id } = req.params;
    const details = await dockerEngine.inspectContainer(id);
    res.json(details);
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

// 4. Container Lifecycle Actions (start, stop, restart, kill) with Audit Chaining
router.post('/containers/:id/action', enforceContainerJail, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, timeout } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action parameter is required (start, stop, restart, kill).' });
    }

    // Pre-fetch container name for tamper-evident cryptographic log
    let containerName = id.slice(0, 12);
    try {
      const inspect = await dockerEngine.inspectContainer(id);
      if (inspect && inspect.Name) {
        containerName = inspect.Name.startsWith('/') ? inspect.Name.slice(1) : inspect.Name;
      }
    } catch {}

    const result = await dockerEngine.containerAction(id, action, { t: timeout });

    // CRITICAL: Cryptographic Audit Logging
    const actionUpper = String(action).toUpperCase();
    const auditAction = `DOCKER_${actionUpper}`;

    auditLogger.logEvent({
      action: auditAction,
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `container:${containerName} (${id.slice(0, 12)})`,
      payload: {
        action,
        containerId: id,
        containerName,
        success: true
      }
    });

    res.json(result);
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message });
  }
});

// 5. Delete Container with Audit Chaining
router.delete('/containers/:id', enforceContainerJail, async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true' || req.query.force === '1';
    const removeVolumes = req.query.v === 'true' || req.query.v === '1';

    // Pre-fetch container name for tamper-evident cryptographic log
    let containerName = id.slice(0, 12);
    try {
      const inspect = await dockerEngine.inspectContainer(id);
      if (inspect && inspect.Name) {
        containerName = inspect.Name.startsWith('/') ? inspect.Name.slice(1) : inspect.Name;
      }
    } catch {}

    const result = await dockerEngine.deleteContainer(id, force, removeVolumes);

    // CRITICAL: Cryptographic Audit Logging
    auditLogger.logEvent({
      action: 'DOCKER_DELETE',
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `container:${containerName} (${id.slice(0, 12)})`,
      payload: {
        containerId: id,
        containerName,
        force,
        removeVolumes,
        success: true
      }
    });

    res.json(result);
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
