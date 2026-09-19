const express = require('express');
const auditLogger = require('./auditLogger');

const router = express.Router();

// 1. Fetch paginated audit logs with search and filtering
router.get('/logs', (req, res) => {
  try {
    const { limit = 50, offset = 0, action, ip, search } = req.query;
    const result = auditLogger.getAuditLogs({
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
      action,
      ip,
      search
    });
    res.json(result);
  } catch (err) {
    console.error('[AUDIT ROUTER ERROR] Failed to fetch logs:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Cryptographically verify the entire chain from Genesis to Head
router.get('/verify', (req, res) => {
  try {
    const verification = auditLogger.verifyAuditChain();
    res.json(verification);
  } catch (err) {
    console.error('[AUDIT ROUTER ERROR] Verification failure:', err);
    res.status(500).json({ error: err.message, valid: false });
  }
});

module.exports = router;
