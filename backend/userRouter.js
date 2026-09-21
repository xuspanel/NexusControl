const express = require('express');
const router = express.Router();
const qrcode = require('qrcode');
const { generateSecret, generateURI } = require('otplib');
const db = require('./db');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

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
 * Create a new user with generated TOTP secret and QR code
 */
router.post('/', async (req, res) => {
  const { username, password, role = 'operator' } = req.body || {};

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
      totpSecret
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
        role: user.role
      }
    });

    res.status(201).json({
      success: true,
      user,
      totpSecret,
      qrCodeDataUrl
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/users/:id/role
 * Update role of an existing user
 */
router.patch('/:id/role', (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};

  try {
    const updated = db.updateUserRole(id, role);

    auditLogger.logEvent({
      action: 'USER_ROLE_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: updated.username,
      payload: {
        id: updated.id,
        newRole: role
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
