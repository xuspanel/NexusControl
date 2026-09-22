const express = require('express');
const router = express.Router();
const qrcode = require('qrcode');
const { generateSecret, generateURI } = require('otplib');
const db = require('./db');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');
const wireguardEngine = require('./wireguardEngine');

// All User Management endpoints strictly require superadmin role
router.use(requireRole(['superadmin']));

/**
 * GET /api/users
 * List all users in the system
 */
router.get('/', (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/users
 * Create a new user with generated TOTP secret and QR code, with optional WireGuard VPN profile
 */
router.post('/', async (req, res) => {
  const {
    username,
    password,
    role = 'operator',
    granular_policies = null,
    generate_vpn = false,
    generateVpn = false,
    vpn_full_tunnel = false,
    full_tunnel = false,
    fullTunnel = false
  } = req.body || {};

  try {
    const totpSecret = generateSecret();
    const otpUri = generateURI({
      secret: totpSecret,
      label: username.trim().toLowerCase(),
      issuer: 'NexusControl'
    });
    const qrCodeDataUrl = await qrcode.toDataURL(otpUri);

    const user = db.createUser({
      username,
      password,
      role,
      totpSecret,
      granular_policies
    });

    auditLogger.logEvent({
      action: 'USER_CREATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: user.username,
      payload: {
        id: user.id,
        username: user.username,
        role: user.role,
        granular_policies: user.granular_policies
      }
    });

    let vpnProfile = null;
    const wantsVpn = Boolean(generate_vpn || generateVpn);
    const isFullTunnel = Boolean(vpn_full_tunnel || full_tunnel || fullTunnel);

    if (wantsVpn) {
      try {
        vpnProfile = await wireguardEngine.generatePeer(user.username, user.id, isFullTunnel);
        auditLogger.logEvent({
          action: 'VPN_PEER_CREATED',
          user: req.user?.username || 'system',
          ip: req.clientIp || req.ip,
          userAgent: req.headers['user-agent'],
          targetResource: vpnProfile.publicKey,
          payload: {
            peerId: vpnProfile.id,
            userId: user.id,
            username: user.username,
            internalIp: vpnProfile.internalIp,
            publicKey: vpnProfile.publicKey,
            fullTunnel: isFullTunnel
          }
        });
      } catch (vpnErr) {
        console.error('[UserRouter] WireGuard peer generation error:', vpnErr.message);
      }
    }

    res.status(201).json({
      success: true,
      user,
      totpSecret,
      qrCodeDataUrl,
      vpnProfile
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/users/:id/role
 * Update role and optionally policies of an existing user
 */
router.patch('/:id/role', (req, res) => {
  const { id } = req.params;
  const { role, granular_policies } = req.body || {};

  try {
    const updated = db.updateUserRole(id, role, granular_policies);

    auditLogger.logEvent({
      action: 'USER_ROLE_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: updated.username,
      payload: {
        id: updated.id,
        newRole: role,
        granular_policies: updated.granular_policies
      }
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/users/:id/policies
 * Update granular policies of an existing user
 */
router.patch('/:id/policies', (req, res) => {
  const { id } = req.params;
  const { granular_policies } = req.body || {};

  try {
    const updated = db.updateUserPolicies(id, granular_policies);

    auditLogger.logEvent({
      action: 'USER_POLICIES_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: updated.username,
      payload: {
        id: updated.id,
        granular_policies: updated.granular_policies
      }
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user account (cannot delete own account or last superadmin)
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user?.id;

  try {
    const result = db.deleteUser(id, currentUserId);

    auditLogger.logEvent({
      action: 'USER_DELETE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: result.username,
      payload: { id }
    });

    res.json({ success: true, id, username: result.username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
