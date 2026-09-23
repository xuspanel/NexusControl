const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

let selectConfigStmt;
let selectRawConfigStmt;
let upsertConfigStmt;

/**
 * Initialize SQLite alerts_config table and prepared statements
 */
function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts_config (
      id TEXT PRIMARY KEY,
      discord_webhook_url TEXT,
      telegram_bot_token TEXT,
      telegram_chat_id TEXT,
      cpu_threshold_percent INTEGER DEFAULT 90,
      ram_threshold_percent INTEGER DEFAULT 90,
      alert_on_security_violations INTEGER DEFAULT 1,
      alert_on_backup_failures INTEGER DEFAULT 1,
      active INTEGER DEFAULT 0
    );
  `);

  selectConfigStmt = db.prepare(`
    SELECT id,
           CASE
             WHEN length(discord_webhook_url) > 15 THEN substr(discord_webhook_url, 1, 35) || '••••••••' || substr(discord_webhook_url, -6)
             WHEN length(discord_webhook_url) > 0 THEN '••••••••'
             ELSE ''
           END as discord_webhook_url_masked,
           CASE
             WHEN length(telegram_bot_token) > 4 THEN '••••••••' || substr(telegram_bot_token, -4)
             WHEN length(telegram_bot_token) > 0 THEN '••••••••'
             ELSE ''
           END as telegram_bot_token_masked,
           telegram_chat_id,
           cpu_threshold_percent,
           ram_threshold_percent,
           alert_on_security_violations,
           alert_on_backup_failures,
           active
    FROM alerts_config
    WHERE id = 'default_alerts'
    LIMIT 1
  `);

  selectRawConfigStmt = db.prepare(`
    SELECT * FROM alerts_config WHERE id = 'default_alerts' LIMIT 1
  `);

  upsertConfigStmt = db.prepare(`
    INSERT INTO alerts_config (
      id, discord_webhook_url, telegram_bot_token, telegram_chat_id,
      cpu_threshold_percent, ram_threshold_percent,
      alert_on_security_violations, alert_on_backup_failures, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      discord_webhook_url = excluded.discord_webhook_url,
      telegram_bot_token = excluded.telegram_bot_token,
      telegram_chat_id = excluded.telegram_chat_id,
      cpu_threshold_percent = excluded.cpu_threshold_percent,
      ram_threshold_percent = excluded.ram_threshold_percent,
      alert_on_security_violations = excluded.alert_on_security_violations,
      alert_on_backup_failures = excluded.alert_on_backup_failures,
      active = excluded.active
  `);
}

// Auto-initialize DB on load
initDb();

/**
 * Escape special characters for Telegram MarkdownV2
 * Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMarkdownV2(text) {
  if (typeof text !== 'string') text = String(text ?? '');
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Map alert level to Discord embed hex color integer
 */
function getDiscordColor(level) {
  switch (level?.toLowerCase()) {
    case 'error':
    case 'danger':
    case 'security':
      return 15673668; // #EF4444 Red
    case 'warning':
    case 'warn':
      return 16096779; // #F59E0B Amber / Yellow
    case 'success':
      return 1096065;  // #10B981 Emerald / Green
    case 'info':
    default:
      return 3900150;  // #3B82F6 Sky / Blue
  }
}

/**
 * Dispatch message to Discord Webhook using native fetch
 */
async function dispatchDiscord(webhookUrl, { title, message, level = 'info' }) {
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    throw new Error('Valid Discord Webhook URL is required.');
  }

  const payload = {
    username: 'NexusControl',
    avatar_url: 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield.png',
    embeds: [
      {
        title: title || 'NexusControl System Alert',
        description: message || '',
        color: getDiscordColor(level),
        timestamp: new Date().toISOString(),
        footer: {
          text: 'NexusControl Webhook Alerting Worker'
        }
      }
    ]
  };

  const response = await fetch(webhookUrl.trim(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Discord Webhook HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  return true;
}

/**
 * Dispatch message to Telegram Bot using native fetch & MarkdownV2
 */
async function dispatchTelegram(botToken, chatId, { title, message, level = 'info' }) {
  if (!botToken || typeof botToken !== 'string') {
    throw new Error('Telegram Bot Token is required.');
  }
  if (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number')) {
    throw new Error('Telegram Chat ID is required.');
  }

  const levelEmoji = level === 'error' || level === 'security'
    ? '🚨'
    : level === 'warning'
    ? '⚠️'
    : level === 'success'
    ? '✅'
    : 'ℹ️';

  const escapedTitle = escapeMarkdownV2(title || 'NexusControl Alert');
  const escapedMessage = escapeMarkdownV2(message || '');
  const text = `${levelEmoji} *${escapedTitle}*\n\n${escapedMessage}\n\n_NexusControl Alert Worker_`;

  const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: String(chatId).trim(),
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    }),
    signal: AbortSignal.timeout(5000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram API Error: ${data.description || response.statusText}`);
  }

  return true;
}

/**
 * Get masked alerts configuration for client consumption
 */
function getAlertsConfig() {
  const row = selectConfigStmt.get();
  if (!row) {
    return {
      configured: false,
      discordWebhookUrl: '',
      telegramBotToken: '',
      telegramChatId: '',
      cpuThresholdPercent: 90,
      ramThresholdPercent: 90,
      alertOnSecurityViolations: true,
      alertOnBackupFailures: true,
      active: false
    };
  }

  return {
    configured: Boolean(row.discord_webhook_url_masked || row.telegram_bot_token_masked),
    discordWebhookUrl: row.discord_webhook_url_masked || '',
    telegramBotToken: row.telegram_bot_token_masked || '',
    telegramChatId: row.telegram_chat_id || '',
    cpuThresholdPercent: row.cpu_threshold_percent ?? 90,
    ramThresholdPercent: row.ram_threshold_percent ?? 90,
    alertOnSecurityViolations: Boolean(row.alert_on_security_violations),
    alertOnBackupFailures: Boolean(row.alert_on_backup_failures),
    active: Boolean(row.active)
  };
}

/**
 * Get raw alerts configuration for backend worker dispatch
 */
function getRawAlertsConfig() {
  return selectRawConfigStmt.get() || null;
}

/**
 * Save and persist alerts configuration, preserving existing secrets when masked
 */
function saveAlertsConfig({
  discordWebhookUrl,
  telegramBotToken,
  telegramChatId,
  cpuThresholdPercent = 90,
  ramThresholdPercent = 90,
  alertOnSecurityViolations = true,
  alertOnBackupFailures = true,
  active = false
}) {
  const existing = selectRawConfigStmt.get();

  let finalDiscordUrl = discordWebhookUrl !== undefined ? String(discordWebhookUrl).trim() : (existing?.discord_webhook_url || '');
  if (finalDiscordUrl.includes('••••')) {
    finalDiscordUrl = existing?.discord_webhook_url || '';
  }

  let finalTelegramToken = telegramBotToken !== undefined ? String(telegramBotToken).trim() : (existing?.telegram_bot_token || '');
  if (finalTelegramToken.includes('••••')) {
    finalTelegramToken = existing?.telegram_bot_token || '';
  }

  const finalChatId = telegramChatId !== undefined ? String(telegramChatId).trim() : (existing?.telegram_chat_id || '');
  const cpuThreshold = Math.max(10, Math.min(100, parseInt(cpuThresholdPercent, 10) || 90));
  const ramThreshold = Math.max(10, Math.min(100, parseInt(ramThresholdPercent, 10) || 90));
  const numericSecViolations = alertOnSecurityViolations ? 1 : 0;
  const numericBackupFailures = alertOnBackupFailures ? 1 : 0;
  const numericActive = active ? 1 : 0;

  upsertConfigStmt.run(
    'default_alerts',
    finalDiscordUrl,
    finalTelegramToken,
    finalChatId,
    cpuThreshold,
    ramThreshold,
    numericSecViolations,
    numericBackupFailures,
    numericActive
  );

  return getAlertsConfig();
}

/**
 * Send an alert asynchronously across configured channels
 * Safe fire-and-forget wrapper that never throws
 */
async function sendAlert(title, message, level = 'info', category = 'system') {
  try {
    const config = getRawAlertsConfig();
    if (!config || !config.active) {
      return { skipped: true, reason: 'inactive' };
    }

    if (category === 'security' && !config.alert_on_security_violations) {
      return { skipped: true, reason: 'security_alerts_disabled' };
    }

    if (category === 'backup' && !config.alert_on_backup_failures) {
      return { skipped: true, reason: 'backup_alerts_disabled' };
    }

    const tasks = [];
    if (config.discord_webhook_url && config.discord_webhook_url.trim()) {
      tasks.push(
        dispatchDiscord(config.discord_webhook_url, { title, message, level })
          .catch((err) => console.warn('[AlertEngine] Discord dispatch error:', err.message))
      );
    }

    if (config.telegram_bot_token && config.telegram_chat_id) {
      tasks.push(
        dispatchTelegram(config.telegram_bot_token, config.telegram_chat_id, { title, message, level })
          .catch((err) => console.warn('[AlertEngine] Telegram dispatch error:', err.message))
      );
    }

    await Promise.allSettled(tasks);
    return { sent: true, channels: tasks.length };
  } catch (err) {
    console.warn('[AlertEngine] Unexpected sendAlert failure:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Test alert credentials on demand
 */
async function testAlerts(testConfig = {}) {
  const existing = getRawAlertsConfig() || {};
  let discordUrl = testConfig.discordWebhookUrl ?? existing.discord_webhook_url ?? '';
  if (discordUrl.includes('••••')) discordUrl = existing.discord_webhook_url || '';

  let tgToken = testConfig.telegramBotToken ?? existing.telegram_bot_token ?? '';
  if (tgToken.includes('••••')) tgToken = existing.telegram_bot_token || '';

  let tgChatId = testConfig.telegramChatId ?? existing.telegram_chat_id ?? '';

  const results = {
    discord: { tested: false, success: false },
    telegram: { tested: false, success: false }
  };

  const title = '🔔 NexusControl Test Alert';
  const message = 'Webhook connectivity test successful! Real-time alerts are operational on your VPS.';

  if (discordUrl && discordUrl.trim()) {
    results.discord.tested = true;
    try {
      await dispatchDiscord(discordUrl.trim(), { title, message, level: 'info' });
      results.discord.success = true;
    } catch (err) {
      results.discord.success = false;
      results.discord.error = err.message;
    }
  }

  if (tgToken && tgChatId) {
    results.telegram.tested = true;
    try {
      await dispatchTelegram(tgToken.trim(), tgChatId.trim(), { title, message, level: 'info' });
      results.telegram.success = true;
    } catch (err) {
      results.telegram.success = false;
      results.telegram.error = err.message;
    }
  }

  return results;
}

module.exports = {
  initDb,
  escapeMarkdownV2,
  getDiscordColor,
  dispatchDiscord,
  dispatchTelegram,
  getAlertsConfig,
  getRawAlertsConfig,
  saveAlertsConfig,
  sendAlert,
  testAlerts
};
