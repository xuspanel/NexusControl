const express = require('express');
const router = express.Router();
const securityEngine = require('./securityEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

/**
 * GET /api/security/firewall/rules
 * Return active firewall rules. If no firewall is detected, return 503 with isInstalled: false.
 */
router.get('/firewall/rules', async (req, res) => {
  try {
    const data = await securityEngine.getRules();
    if (!data.isInstalled) {
      return res.status(503).json({
        success: false,
        isInstalled: false,
        error: 'No active firewall (UFW or Firewalld) was detected on this host.'
      });
    }

    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/security/firewall/rules
 * Open a port on the host firewall.
 * Body: { port, protocol }
 */
router.post('/firewall/rules', requireRole(['superadmin', 'operator'], 'firewall'), async (req, res) => {
  try {
    const { port, protocol } = req.body || {};
    if (!port) {
      return res.status(400).json({
        success: false,
        error: 'Port is required.'
      });
    }

    const cleanProto = protocol ? String(protocol).toLowerCase() : 'tcp';
    const result = await securityEngine.addRule(port, cleanProto);

    auditLogger.logEvent({
      action: 'FIREWALL_PORT_ALLOW',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${port}/${cleanProto}`,
      payload: { port, protocol: cleanProto, firewall: result.firewall },
      severity: 'NOTICE'
    });

    res.status(201).json({
      success: true,
      message: `Port ${port}/${cleanProto} opened successfully via ${result.firewall}.`,
      result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/security/firewall/rules/:port/:protocol
 * Close / remove an allowed port from the host firewall.
 */
router.delete('/firewall/rules/:port/:protocol', requireRole(['superadmin', 'operator'], 'firewall'), async (req, res) => {
  try {
    const { port, protocol } = req.params;
    const cleanProto = protocol ? String(protocol).toLowerCase() : 'tcp';
    const result = await securityEngine.deleteRule(port, cleanProto);

    auditLogger.logEvent({
      action: 'FIREWALL_PORT_DELETE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${port}/${cleanProto}`,
      payload: { port, protocol: cleanProto, firewall: result.firewall },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: `Port ${port}/${cleanProto} closed successfully via ${result.firewall}.`,
      result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/security/fail2ban/jails
 * Return array of jail names. If fail2ban-client is missing or offline, return 503 with isInstalled: false.
 */
router.get('/fail2ban/jails', async (req, res) => {
  try {
    const jails = await securityEngine.getJails();
    res.json({
      success: true,
      isInstalled: true,
      jails
    });
  } catch (err) {
    if (err.isInstalled === false) {
      return res.status(503).json({
        success: false,
        isInstalled: false,
        error: 'Fail2ban daemon is not installed or fail2ban-client is not accessible.'
      });
    }
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/security/fail2ban/jails/:jail
 * Return array of banned IPs enriched with GeoIP data.
 */
router.get('/fail2ban/jails/:jail', async (req, res) => {
  try {
    const { jail } = req.params;
    const data = await securityEngine.getBannedIps(jail);
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/security/fail2ban/jails/:jail/unban
 * Unban an IP from a specific jail.
 * Body: { ip }
 */
router.post('/fail2ban/jails/:jail/unban', requireRole(['superadmin', 'operator'], 'fail2ban'), async (req, res) => {
  try {
    const { jail } = req.params;
    const { ip } = req.body || {};
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required.'
      });
    }

    const result = await securityEngine.unbanIp(jail, ip);

    auditLogger.logEvent({
      action: 'FAIL2BAN_IP_UNBAN',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${jail}:${ip}`,
      payload: { jail, ip },
      severity: 'NOTICE'
    });

    res.json({
      success: true,
      message: `IP ${ip} was unbanned from jail "${jail}".`,
      result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/security/fail2ban/jails/:jail/ban
 * Manually ban an IP in a specific jail.
 * Body: { ip }
 */
router.post('/fail2ban/jails/:jail/ban', requireRole(['superadmin', 'operator'], 'fail2ban'), async (req, res) => {
  try {
    const { jail } = req.params;
    const { ip } = req.body || {};
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required.'
      });
    }

    const result = await securityEngine.banIp(jail, ip);

    auditLogger.logEvent({
      action: 'FAIL2BAN_IP_BAN',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: `${jail}:${ip}`,
      payload: { jail, ip },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: `IP ${ip} has been manually banned in jail "${jail}".`,
      result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
