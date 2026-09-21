const express = require('express');
const router = express.Router();
const vhostEngine = require('./vhostEngine');
const portInspector = require('./portInspector');
const auditLogger = require('./auditLogger');

/**
 * Enterprise Nginx vHost & Domain Management REST API
 * All routes protected upstream by authMiddleware and ipWhitelistMiddleware
 */

// 1. List Managed Virtual Hosts with SSL & Status metadata
router.get('/', (req, res) => {
  try {
    const vhosts = vhostEngine.listVHosts();
    res.json(vhosts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Pre-flight DNS A-record Verification
router.get('/dns-check/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const result = await vhostEngine.verifyDnsRecord(domain);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Inspect Port Availability & Alternative Allocation
router.get('/inspect-port', async (req, res) => {
  try {
    const rawPort = req.query.port;
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return res.status(400).json({ error: 'Port must be an integer between 1 and 65535.' });
    }

    const isAvailable = await portInspector.checkPortAvailable(port);
    const allocatedPorts = portInspector.getAllocatedVHostPorts();
    const isAllocated = allocatedPorts.has(port);

    const available = isAvailable && !isAllocated;
    const suggestedPort = available ? port : await portInspector.findNextAvailablePort();

    res.json({
      port,
      available,
      suggestedPort
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Next Recommended Free Port
router.get('/next-port', async (req, res) => {
  try {
    const suggestedPort = await portInspector.findNextAvailablePort();
    res.json({ suggestedPort });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Specific Virtual Host Configuration
router.get('/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const vhost = vhostEngine.getVHostConfig(domain);
    res.json(vhost);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 6. Create New Virtual Host with Atomic Staging & Syntax Testing
router.post('/', async (req, res) => {
  try {
    const { domain, type, target, upstreamPort, clientMaxBodySize, supportWebSocket, supportSse, redirectCode, webRoot, autoSsl, email } = req.body || {};

    if (!domain) {
      return res.status(400).json({ error: 'Domain name is required.' });
    }

    if (!vhostEngine.isValidDomain(domain)) {
      return res.status(400).json({ error: `Invalid domain name format: "${domain}". Must adhere to RFC standards.` });
    }

    let finalTarget = target;
    let portWarning = null;

    if ((type || 'proxy') === 'proxy') {
      let portToUse = null;

      if (upstreamPort !== undefined && upstreamPort !== null && String(upstreamPort).trim() !== '') {
        portToUse = parseInt(String(upstreamPort).trim(), 10);
      } else if (finalTarget && String(finalTarget).trim() !== '') {
        if (/^\d+$/.test(String(finalTarget).trim())) {
          portToUse = parseInt(String(finalTarget).trim(), 10);
        } else {
          portToUse = portInspector.extractPortFromTarget(finalTarget);
        }
      }

      // If port is missing or empty, auto-assign next available port
      if (!portToUse) {
        portToUse = await portInspector.findNextAvailablePort();
        finalTarget = `http://127.0.0.1:${portToUse}`;
      } else {
        // Normalize finalTarget if just a port or not formatted
        if (!finalTarget || /^\d+$/.test(String(finalTarget).trim()) || String(finalTarget).trim() === '') {
          finalTarget = `http://127.0.0.1:${portToUse}`;
        }

        // Non-blocking check if requested port is currently in use or allocated
        const isFree = await portInspector.checkPortAvailable(portToUse);
        const allocated = portInspector.getAllocatedVHostPorts();
        if (!isFree || allocated.has(portToUse)) {
          const suggested = await portInspector.findNextAvailablePort();
          portWarning = `Port ${portToUse} is already in use or allocated. Suggested alternative: ${suggested}`;
          console.warn(`[vHostRouter] Warning: ${portWarning}`);
        }
      }
    }

    // Atomic Creation & Testing
    const result = await vhostEngine.createOrUpdateVHost(domain, {
      type: type || 'proxy',
      target: finalTarget || 'http://127.0.0.1:8888',
      clientMaxBodySize,
      supportWebSocket,
      supportSse,
      redirectCode,
      webRoot
    });

    // Tamper-Evident Audit Logging
    auditLogger.logEvent({
      action: 'VHOST_CREATE',
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `vhost:${domain}`,
      payload: {
        domain,
        type: type || 'proxy',
        target: finalTarget || webRoot || '',
        success: true
      }
    });

    // Optional Auto-SSL Provisioning
    let sslResult = null;
    if (autoSsl && email) {
      try {
        sslResult = await vhostEngine.issueSslCertificate(domain, email);
        auditLogger.logEvent({
          action: 'SSL_ISSUE',
          user: req.user?.username || 'root',
          ip: req.clientIp || '127.0.0.1',
          userAgent: req.headers['user-agent'] || 'NexusControl-Client',
          targetResource: `vhost:${domain}`,
          payload: {
            domain,
            email,
            success: true
          }
        });
      } catch (sslErr) {
        sslResult = { warning: `vHost created, but SSL issuance encountered: ${sslErr.message}` };
      }
    }

    res.status(201).json({
      ...result,
      portWarning,
      ssl: sslResult
    });
  } catch (err) {
    const status = err.status || (err.nginxStderr ? 400 : 500);
    res.status(status).json({
      error: err.message,
      nginxStderr: err.nginxStderr || null
    });
  }
});

// 5. Update Existing Virtual Host with Atomic Rollback
router.put('/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { type, target, clientMaxBodySize, supportWebSocket, supportSse, redirectCode, webRoot } = req.body || {};

    if (!vhostEngine.isValidDomain(domain)) {
      return res.status(400).json({ error: `Invalid domain name format: "${domain}"` });
    }

    const result = await vhostEngine.createOrUpdateVHost(domain, {
      type: type || 'proxy',
      target,
      clientMaxBodySize,
      supportWebSocket,
      supportSse,
      redirectCode,
      webRoot
    });

    // Tamper-Evident Audit Logging
    auditLogger.logEvent({
      action: 'VHOST_UPDATE',
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `vhost:${domain}`,
      payload: {
        domain,
        type: type || 'proxy',
        target: target || webRoot || '',
        success: true
      }
    });

    res.json(result);
  } catch (err) {
    const status = err.status || (err.nginxStderr ? 400 : 500);
    res.status(status).json({
      error: err.message,
      nginxStderr: err.nginxStderr || null
    });
  }
});

// 6. Toggle vHost Active State (between .conf and .conf.disabled)
router.post('/:domain/toggle', async (req, res) => {
  try {
    const { domain } = req.params;
    const result = await vhostEngine.toggleVHost(domain);

    // Tamper-Evident Audit Logging
    auditLogger.logEvent({
      action: 'VHOST_TOGGLE',
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `vhost:${domain}`,
      payload: {
        domain,
        enabled: result.enabled,
        success: true
      }
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Delete Managed Virtual Host
router.delete('/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const result = await vhostEngine.deleteVHost(domain);

    // Tamper-Evident Audit Logging
    auditLogger.logEvent({
      action: 'VHOST_DELETE',
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `vhost:${domain}`,
      payload: {
        domain,
        success: true
      }
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Automated Let's Encrypt SSL Provisioning
router.post('/:domain/ssl', async (req, res) => {
  try {
    const { domain } = req.params;
    const { email, force } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Administrator email is required for Let\'s Encrypt registration.' });
    }

    const result = await vhostEngine.issueSslCertificate(domain, email, { force: !!force });

    // Tamper-Evident Audit Logging
    auditLogger.logEvent({
      action: 'SSL_ISSUE',
      user: req.user?.username || 'root',
      ip: req.clientIp || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'NexusControl-Client',
      targetResource: `vhost:${domain}`,
      payload: {
        domain,
        email,
        success: true
      }
    });

    res.json(result);
  } catch (err) {
    const status = err.isDnsWarning ? 422 : 400;
    res.status(status).json({
      error: err.message,
      isDnsWarning: !!err.isDnsWarning,
      dnsCheck: err.dnsCheck || null
    });
  }
});

module.exports = router;
