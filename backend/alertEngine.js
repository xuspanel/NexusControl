const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const nodemailer = require('nodemailer');

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
      active INTEGER DEFAULT 0,
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 587,
      smtp_user TEXT,
      smtp_pass TEXT,
      smtp_from TEXT,
      alert_email_address TEXT,
      email_enabled INTEGER DEFAULT 0
    );
  `);

  // Migration for existing tables without SMTP columns
  const migrationQueries = [
    'ALTER TABLE alerts_config ADD COLUMN smtp_host TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_port INTEGER DEFAULT 587;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_user TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_pass TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN smtp_from TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN alert_email_address TEXT;',
    'ALTER TABLE alerts_config ADD COLUMN email_enabled INTEGER DEFAULT 0;'
  ];

  for (const sql of migrationQueries) {
    try {
      db.exec(sql);
    } catch {}
  }

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
           active,
           smtp_host,
           smtp_port,
           smtp_user,
           CASE
             WHEN length(smtp_pass) > 4 THEN '••••••••' || substr(smtp_pass, -4)
             WHEN length(smtp_pass) > 0 THEN '••••••••'
             ELSE ''
           END as smtp_pass_masked,
           smtp_from,
           alert_email_address,
           email_enabled
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
      alert_on_security_violations, alert_on_backup_failures, active,
      smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from,
      alert_email_address, email_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      discord_webhook_url = excluded.discord_webhook_url,
      telegram_bot_token = excluded.telegram_bot_token,
      telegram_chat_id = excluded.telegram_chat_id,
      cpu_threshold_percent = excluded.cpu_threshold_percent,
      ram_threshold_percent = excluded.ram_threshold_percent,
      alert_on_security_violations = excluded.alert_on_security_violations,
      alert_on_backup_failures = excluded.alert_on_backup_failures,
      active = excluded.active,
      smtp_host = excluded.smtp_host,
      smtp_port = excluded.smtp_port,
      smtp_user = excluded.smtp_user,
      smtp_pass = excluded.smtp_pass,
      smtp_from = excluded.smtp_from,
      alert_email_address = excluded.alert_email_address,
      email_enabled = excluded.email_enabled
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
 * Map alert level to CSS color hex string for HTML email
 */
function getSeverityColorHex(level) {
  switch (level?.toLowerCase()) {
    case 'error':
    case 'danger':
    case 'security':
      return '#EF4444'; // Red
    case 'warning':
    case 'warn':
      return '#F59E0B'; // Amber
    case 'success':
      return '#10B981'; // Green
    case 'info':
    default:
      return '#3B82F6'; // Blue
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
 * Dispatch message to email address via SMTP using nodemailer
 */
async function dispatchEmail(smtpConfig, { title, message, level = 'info' }) {
  const {
    host,
    port = 587,
    user,
    pass,
    from,
    to
  } = smtpConfig || {};

  if (!host || typeof host !== 'string') {
    throw new Error('SMTP Host is required for email alerting.');
  }
  if (!to || typeof to !== 'string') {
    throw new Error('Target alert email address is required.');
  }

  const numericPort = parseInt(port, 10) || 587;
  const isSecure = numericPort === 465;

  const transporter = nodemailer.createTransport({
    host: host.trim(),
    port: numericPort,
    secure: isSecure,
    auth: (user && pass) ? { user: user.trim(), pass: pass.trim() } : undefined,
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000
  });

  const subject = `[NexusControl] ${title || 'System Alert'}`;
  const headerColor = getSeverityColorHex(level);
  const cleanFrom = from?.trim() || (user ? `NexusControl <${user.trim()}>` : 'NexusControl <noreply@xus.me>');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background-color: ${headerColor}; padding: 18px 24px; color: #ffffff;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 600;">${title || 'NexusControl Alert'}</h2>
      </div>
      <div style="padding: 24px; color: #18181b; font-size: 14px; line-height: 1.6;">
        <div style="margin-top: 0; white-space: pre-wrap; font-family: monospace, monospace; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">${message || ''}</div>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #71717a;">
          Alert generated by <strong>NexusControl</strong> Operations Daemon • ${new Date().toUTCString()}
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: cleanFrom,
    to: to.trim(),
    subject,
    text: `${title}\n\n${message}\n\nNexusControl Operations Daemon`,
    html
  });

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
      active: false,
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '',
      alertEmailAddress: '',
      emailEnabled: false
    };
  }

  return {
    configured: Boolean(row.discord_webhook_url_masked || row.telegram_bot_token_masked || row.smtp_host),
    discordWebhookUrl: row.discord_webhook_url_masked || '',
    telegramBotToken: row.telegram_bot_token_masked || '',
    telegramChatId: row.telegram_chat_id || '',
    cpuThresholdPercent: row.cpu_threshold_percent ?? 90,
    ramThresholdPercent: row.ram_threshold_percent ?? 90,
    alertOnSecurityViolations: Boolean(row.alert_on_security_violations),
    alertOnBackupFailures: Boolean(row.alert_on_backup_failures),
    active: Boolean(row.active),
    smtpHost: row.smtp_host || '',
    smtpPort: row.smtp_port ?? 587,
    smtpUser: row.smtp_user || '',
    smtpPass: row.smtp_pass_masked || '',
    smtpFrom: row.smtp_from || '',
    alertEmailAddress: row.alert_email_address || '',
    emailEnabled: Boolean(row.email_enabled)
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
  active = false,
  smtpHost,
  smtpPort = 587,
  smtpUser,
  smtpPass,
  smtpFrom,
  alertEmailAddress,
  emailEnabled = false
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

  // SMTP Fields
  const finalSmtpHost = smtpHost !== undefined ? String(smtpHost).trim() : (existing?.smtp_host || '');
  const finalSmtpPort = parseInt(smtpPort, 10) || 587;
  const finalSmtpUser = smtpUser !== undefined ? String(smtpUser).trim() : (existing?.smtp_user || '');

  let finalSmtpPass = smtpPass !== undefined ? String(smtpPass).trim() : (existing?.smtp_pass || '');
  if (finalSmtpPass.includes('••••')) {
    finalSmtpPass = existing?.smtp_pass || '';
  }

  const finalSmtpFrom = smtpFrom !== undefined ? String(smtpFrom).trim() : (existing?.smtp_from || '');
  const finalAlertEmail = alertEmailAddress !== undefined ? String(alertEmailAddress).trim() : (existing?.alert_email_address || '');
  const numericEmailEnabled = emailEnabled ? 1 : 0;

  upsertConfigStmt.run(
    'default_alerts',
    finalDiscordUrl,
    finalTelegramToken,
    finalChatId,
    cpuThreshold,
    ramThreshold,
    numericSecViolations,
    numericBackupFailures,
    numericActive,
    finalSmtpHost,
    finalSmtpPort,
    finalSmtpUser,
    finalSmtpPass,
    finalSmtpFrom,
    finalAlertEmail,
    numericEmailEnabled
  );

  return getAlertsConfig();
}

/**
 * Send an alert asynchronously across configured channels (Discord, Telegram, Email)
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

    // Discord Dispatcher
    if (config.discord_webhook_url && config.discord_webhook_url.trim()) {
      tasks.push(
        dispatchDiscord(config.discord_webhook_url, { title, message, level })
          .catch((err) => console.warn('[AlertEngine] Discord dispatch error:', err.message))
      );
    }

    // Telegram Dispatcher
    if (config.telegram_bot_token && config.telegram_chat_id) {
      tasks.push(
        dispatchTelegram(config.telegram_bot_token, config.telegram_chat_id, { title, message, level })
          .catch((err) => console.warn('[AlertEngine] Telegram dispatch error:', err.message))
      );
    }

    // Email Dispatcher
    if (config.email_enabled && config.smtp_host && config.alert_email_address) {
      tasks.push(
        dispatchEmail({
          host: config.smtp_host,
          port: config.smtp_port,
          user: config.smtp_user,
          pass: config.smtp_pass,
          from: config.smtp_from,
          to: config.alert_email_address
        }, { title, message, level })
          .catch((err) => console.warn('[AlertEngine] Email dispatch error:', err.message))
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
 * Test alert credentials on demand (Discord, Telegram, and Email)
 */
async function testAlerts(testConfig = {}) {
  const existing = getRawAlertsConfig() || {};

  let discordUrl = testConfig.discordWebhookUrl ?? existing.discord_webhook_url ?? '';
  if (discordUrl.includes('••••')) discordUrl = existing.discord_webhook_url || '';

  let tgToken = testConfig.telegramBotToken ?? existing.telegram_bot_token ?? '';
  if (tgToken.includes('••••')) tgToken = existing.telegram_bot_token || '';

  let tgChatId = testConfig.telegramChatId ?? existing.telegram_chat_id ?? '';

  // Email Config
  const smtpHost = testConfig.smtpHost ?? existing.smtp_host ?? '';
  const smtpPort = testConfig.smtpPort ?? existing.smtp_port ?? 587;
  const smtpUser = testConfig.smtpUser ?? existing.smtp_user ?? '';

  let smtpPass = testConfig.smtpPass ?? existing.smtp_pass ?? '';
  if (smtpPass.includes('••••')) smtpPass = existing.smtp_pass || '';

  const smtpFrom = testConfig.smtpFrom ?? existing.smtp_from ?? '';
  const alertEmail = testConfig.alertEmailAddress ?? existing.alert_email_address ?? '';

  const results = {
    discord: { tested: false, success: false },
    telegram: { tested: false, success: false },
    email: { tested: false, success: false }
  };

  const title = '🔔 NexusControl Test Alert';
  const message = 'Connectivity test successful! Real-time alerts are operational on your VPS.';

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

  if (smtpHost && alertEmail) {
    results.email.tested = true;
    try {
      await dispatchEmail({
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
        to: alertEmail
      }, { title, message, level: 'info' });
      results.email.success = true;
    } catch (err) {
      results.email.success = false;
      results.email.error = err.message;
    }
  }

  return results;
}

module.exports = {
  initDb,
  escapeMarkdownV2,
  getDiscordColor,
  getSeverityColorHex,
  dispatchDiscord,
  dispatchTelegram,
  dispatchEmail,
  getAlertsConfig,
  getRawAlertsConfig,
  saveAlertsConfig,
  sendAlert,
  testAlerts
};
