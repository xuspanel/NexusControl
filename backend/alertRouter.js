const express = require('express');
const router = express.Router();
const alertEngine = require('./alertEngine');
const auditLogger = require('./auditLogger');

/**
 * GET /api/alerts/config
 * Retrieve masked alerts configuration
 */
router.get('/config', (req, res) => {
  try {
    const config = alertEngine.getAlertsConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/alerts/config
 * Update and persist alerts configuration
 */
router.post('/config', (req, res) => {
  const body = req.body || {};

  const discordWebhookUrl = body.discord_webhook_url ?? body.discordWebhookUrl;
  const telegramBotToken = body.telegram_bot_token ?? body.telegramBotToken;
  const telegramChatId = body.telegram_chat_id ?? body.telegramChatId;
  const cpuThresholdPercent = body.cpu_threshold_percent ?? body.cpuThresholdPercent ?? 90;
  const ramThresholdPercent = body.ram_threshold_percent ?? body.ramThresholdPercent ?? 90;
  const alertOnSecurityViolations = body.alert_on_security_violations ?? body.alertOnSecurityViolations ?? true;
  const alertOnBackupFailures = body.alert_on_backup_failures ?? body.alertOnBackupFailures ?? true;
  const active = body.active ?? false;

  try {
    const updated = alertEngine.saveAlertsConfig({
      discordWebhookUrl,
      telegramBotToken,
      telegramChatId,
      cpuThresholdPercent,
      ramThresholdPercent,
      alertOnSecurityViolations,
      alertOnBackupFailures,
      active
    });

    // Cryptographic Tamper-Evident Audit Logging
    auditLogger.logEvent({
      action: 'ALERT_CONFIG_UPDATE',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: 'alerts_config',
      payload: {
        active: Boolean(active),
        cpuThresholdPercent: updated.cpuThresholdPercent,
        ramThresholdPercent: updated.ramThresholdPercent,
        alertOnSecurityViolations: updated.alertOnSecurityViolations,
        alertOnBackupFailures: updated.alertOnBackupFailures,
        discordConfigured: Boolean(updated.discordWebhookUrl),
        telegramConfigured: Boolean(updated.telegramBotToken && updated.telegramChatId)
      }
    });

    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/alerts/test
 * Test webhook connectivity to Discord and Telegram
 */
router.post('/test', async (req, res) => {
  const body = req.body || {};
  const testConfig = {
    discordWebhookUrl: body.discord_webhook_url ?? body.discordWebhookUrl,
    telegramBotToken: body.telegram_bot_token ?? body.telegramBotToken,
    telegramChatId: body.telegram_chat_id ?? body.telegramChatId
  };

  try {
    const results = await alertEngine.testAlerts(testConfig);

    auditLogger.logEvent({
      action: 'ALERT_TEST_DISPATCHED',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: 'alerts_test',
      payload: results
    });

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
