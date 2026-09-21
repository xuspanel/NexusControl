const express = require('express');
const router = express.Router();
const wireguardEngine = require('./wireguardEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

// All WireGuard endpoints strictly require SuperAdmin with network module
router.use(requireRole(['superadmin'], 'network'));

/**
 * GET /api/wireguard/status
 * Get WireGuard server status, public key, subnet, and interface health
 */
router.get('/status', (req, res) => {
  try {
    const status = wireguardEngine.getServerStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/wireguard/peers
 * List all active VPN peers
 */
router.get('/peers', (req, res) => {
  try {
    const peers = wireguardEngine.getPeers();
    res.json({ success: true, peers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/wireguard/peers
 * Provision a new WireGuard peer and generate client config + QR code
 */
router.post('/peers', async (req, res) => {
  const { username, user_id = null } = req.body || {};
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Valid username or client label is required.' });
  }

  try {
    const peer = await wireguardEngine.generatePeer(username.trim(), user_id);

    auditLogger.logEvent({
      action: 'VPN_PEER_CREATED',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: peer.publicKey,
      payload: {
        peerId: peer.id,
        userId: peer.userId,
        username: peer.username,
        internalIp: peer.internalIp,
        publicKey: peer.publicKey
      }
    });

    res.status(201).json({ success: true, peer });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/wireguard/peers/:id/config
 * View or download peer configuration (.conf) and QR code
 */
router.get('/peers/:id/config', async (req, res) => {
  const { id } = req.params;
  try {
    const config = await wireguardEngine.getPeerConfig(id);
    if (!config) {
      return res.status(404).json({ error: 'Peer configuration not found.' });
    }

    if (req.query.download === 'true') {
      const filename = `${config.username || 'peer'}-wg0.conf`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(config.clientConfig);
    }

    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/wireguard/peers/:id
 * Revoke peer and strip from wireguard interface
 */
router.delete('/peers/:id', (req, res) => {
  const { id } = req.params;
  try {
    const result = wireguardEngine.removePeer(id);

    auditLogger.logEvent({
      action: 'VPN_PEER_REVOKED',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.publicKey,
      payload: {
        peerId: result.id,
        username: result.username,
        publicKey: result.publicKey
      }
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
