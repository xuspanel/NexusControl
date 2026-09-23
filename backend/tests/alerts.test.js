const request = require('supertest');
const { app } = require('../server');
const alertEngine = require('../alertEngine');
const auditLogger = require('../auditLogger');
const scheduler = require('../scheduler');

describe('Webhook Alerting Worker Test Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset alertEngine config to default state
    alertEngine.saveAlertsConfig({
      discordWebhookUrl: 'https://discord.com/api/webhooks/123456789/abcdefghijk',
      telegramBotToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      telegramChatId: '987654321',
      cpuThresholdPercent: 90,
      ramThresholdPercent: 90,
      alertOnSecurityViolations: true,
      alertOnBackupFailures: true,
      active: true
    });
    scheduler.resetResourceAlertStates();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Native Engine & Formatting', () => {
    test('escapeMarkdownV2 escapes all Telegram reserved characters', () => {
      const raw = 'Hello_World *bold* [link](url) ~strike~ `code` >quote #tag +plus -minus =equal |pipe {brace} .dot !excl';
      const escaped = alertEngine.escapeMarkdownV2(raw);

      expect(escaped).toContain('\\_');
      expect(escaped).toContain('\\*');
      expect(escaped).toContain('\\[');
      expect(escaped).toContain('\\]');
      expect(escaped).toContain('\\(');
      expect(escaped).toContain('\\)');
      expect(escaped).toContain('\\~');
      expect(escaped).toContain('\\`');
      expect(escaped).toContain('\\>');
      expect(escaped).toContain('\\#');
      expect(escaped).toContain('\\+');
      expect(escaped).toContain('\\-');
      expect(escaped).toContain('\\=');
      expect(escaped).toContain('\\|');
      expect(escaped).toContain('\\{');
      expect(escaped).toContain('\\}');
      expect(escaped).toContain('\\.');
      expect(escaped).toContain('\\!');
    });

    test('getDiscordColor maps alert levels to appropriate hex integers', () => {
      expect(alertEngine.getDiscordColor('error')).toBe(15673668); // Red
      expect(alertEngine.getDiscordColor('security')).toBe(15673668); // Red
      expect(alertEngine.getDiscordColor('warning')).toBe(16096779); // Amber
      expect(alertEngine.getDiscordColor('success')).toBe(1096065); // Green
      expect(alertEngine.getDiscordColor('info')).toBe(3900150); // Blue
      expect(alertEngine.getDiscordColor('unknown')).toBe(3900150); // Default Blue
    });

    test('getAlertsConfig returns masked secrets', () => {
      const config = alertEngine.getAlertsConfig();
      expect(config.configured).toBe(true);
      expect(config.discordWebhookUrl).toContain('••••');
      expect(config.telegramBotToken).toContain('••••');
      expect(config.telegramChatId).toBe('987654321');
      expect(config.cpuThresholdPercent).toBe(90);
      expect(config.ramThresholdPercent).toBe(90);
      expect(config.active).toBe(true);
    });

    test('saveAlertsConfig preserves existing credentials when masked string is provided', () => {
      const initial = alertEngine.getRawAlertsConfig();
      const initialDiscord = initial.discord_webhook_url;
      const initialTelegram = initial.telegram_bot_token;

      // Update with masked values
      alertEngine.saveAlertsConfig({
        discordWebhookUrl: 'https://discord.com/api/webhooks/••••••••••••',
        telegramBotToken: '••••••••ew11',
        telegramChatId: '11223344',
        cpuThresholdPercent: 85,
        ramThresholdPercent: 80,
        alertOnSecurityViolations: false,
        alertOnBackupFailures: true,
        active: true
      });

      const updatedRaw = alertEngine.getRawAlertsConfig();
      expect(updatedRaw.discord_webhook_url).toBe(initialDiscord);
      expect(updatedRaw.telegram_bot_token).toBe(initialTelegram);
      expect(updatedRaw.telegram_chat_id).toBe('11223344');
      expect(updatedRaw.cpu_threshold_percent).toBe(85);
      expect(updatedRaw.ram_threshold_percent).toBe(80);
      expect(updatedRaw.alert_on_security_violations).toBe(0);
      expect(updatedRaw.active).toBe(1);
    });

    test('dispatchDiscord successfully formats and sends embed payload via native fetch', async () => {
      let interceptedUrl = null;
      let interceptedBody = null;

      global.fetch = jest.fn(async (url, options) => {
        interceptedUrl = url;
        interceptedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () => 'ok'
        };
      });

      const res = await alertEngine.dispatchDiscord('https://discord.com/api/webhooks/test', {
        title: '🚨 Test Violation',
        message: 'Unauthorized directory traversal detected',
        level: 'error'
      });

      expect(res).toBe(true);
      expect(interceptedUrl).toBe('https://discord.com/api/webhooks/test');
      expect(interceptedBody.username).toBe('NexusControl');
      expect(interceptedBody.embeds).toHaveLength(1);
      expect(interceptedBody.embeds[0].title).toBe('🚨 Test Violation');
      expect(interceptedBody.embeds[0].description).toBe('Unauthorized directory traversal detected');
      expect(interceptedBody.embeds[0].color).toBe(15673668); // Red
    });

    test('dispatchTelegram successfully sends MarkdownV2 message via native fetch', async () => {
      let interceptedUrl = null;
      let interceptedBody = null;

      global.fetch = jest.fn(async (url, options) => {
        interceptedUrl = url;
        interceptedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true })
        };
      });

      const res = await alertEngine.dispatchTelegram('123456:TOKEN', '987654321', {
        title: 'High CPU Alert',
        message: 'CPU reached 95% on host.service',
        level: 'warning'
      });

      expect(res).toBe(true);
      expect(interceptedUrl).toBe('https://api.telegram.org/bot123456:TOKEN/sendMessage');
      expect(interceptedBody.chat_id).toBe('987654321');
      expect(interceptedBody.parse_mode).toBe('MarkdownV2');
      expect(interceptedBody.text).toContain('⚠️');
      expect(interceptedBody.text).toContain('High CPU Alert');
    });

    test('sendAlert respects active flag and category toggles', async () => {
      let fetchCallCount = 0;
      global.fetch = jest.fn(async () => {
        fetchCallCount++;
        return { ok: true, json: async () => ({ ok: true }), text: async () => 'ok' };
      });

      // 1. Inactive config skips dispatch
      alertEngine.saveAlertsConfig({ active: false });
      const inactiveResult = await alertEngine.sendAlert('Title', 'Message', 'info', 'system');
      expect(inactiveResult.skipped).toBe(true);
      expect(fetchCallCount).toBe(0);

      // 2. Active, but security alerts disabled
      alertEngine.saveAlertsConfig({ active: true, alertOnSecurityViolations: false });
      const secResult = await alertEngine.sendAlert('Security', 'Message', 'error', 'security');
      expect(secResult.skipped).toBe(true);
      expect(fetchCallCount).toBe(0);

      // 3. Active, security alerts enabled
      alertEngine.saveAlertsConfig({ active: true, alertOnSecurityViolations: true });
      const sentResult = await alertEngine.sendAlert('Security', 'Message', 'error', 'security');
      expect(sentResult.sent).toBe(true);
      expect(fetchCallCount).toBe(2); // Discord + Telegram
    });
  });

  describe('2. Event Interceptors & Hooks', () => {
    test('auditLogger.logEvent triggers alert on SECURITY_VIOLATION', async () => {
      const sendAlertSpy = jest.spyOn(alertEngine, 'sendAlert');

      auditLogger.logEvent({
        action: 'SECURITY_VIOLATION',
        user: 'attacker',
        ip: '192.168.1.100',
        targetResource: '/etc/shadow',
        payload: { reason: 'Directory jailbreak blocked' }
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Security Violation'),
        expect.stringContaining('/etc/shadow'),
        'security',
        'security'
      );

      sendAlertSpy.mockRestore();
    });

    test('auditLogger.logEvent triggers alert on AUTH_STEP1_FAILED', async () => {
      const sendAlertSpy = jest.spyOn(alertEngine, 'sendAlert');

      auditLogger.logEvent({
        action: 'AUTH_STEP1_FAILED',
        user: 'malicious',
        ip: '10.0.0.5',
        payload: { reason: 'Invalid password' }
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Authentication Failure'),
        expect.stringContaining('AUTH_STEP1_FAILED'),
        'security',
        'security'
      );

      sendAlertSpy.mockRestore();
    });

    test('scheduler.checkResourceThresholds triggers stateful warning and recovery alerts', async () => {
      const collector = require('../collector');
      const getCpuSpy = jest.spyOn(collector, 'getCPUStats').mockReturnValue({ usage: 95 });
      const sendAlertSpy = jest.spyOn(alertEngine, 'sendAlert').mockResolvedValue({ sent: true });

      alertEngine.saveAlertsConfig({
        active: true,
        cpuThresholdPercent: 80,
        ramThresholdPercent: 99
      });

      // 1. First check: CPU is 95% >= 80% -> should trip warning alert
      scheduler.checkResourceThresholds();
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('High CPU Utilization'),
        expect.stringContaining('95%'),
        'warning',
        'resource'
      );
      const state1 = scheduler.getResourceAlertStates();
      expect(state1.cpuAlertActive).toBe(true);

      sendAlertSpy.mockClear();

      // 2. Second check while still high (95%): should NOT duplicate spam alert
      scheduler.checkResourceThresholds();
      expect(sendAlertSpy).not.toHaveBeenCalled();

      // 3. Third check when usage drops to 30%: should trigger recovery alert
      getCpuSpy.mockReturnValue({ usage: 30 });
      scheduler.checkResourceThresholds();
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('CPU Utilization Normal'),
        expect.stringContaining('30%'),
        'success',
        'resource'
      );
      const state2 = scheduler.getResourceAlertStates();
      expect(state2.cpuAlertActive).toBe(false);

      getCpuSpy.mockRestore();
      sendAlertSpy.mockRestore();
    });
  });

  describe('3. REST API Endpoints & RBAC Hardening', () => {
    test('Superadmin can retrieve config via GET /api/alerts/config', async () => {
      const res = await request(app)
        .get('/api/alerts/config')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.discordWebhookUrl).toContain('••••');
      expect(res.body.config.telegramBotToken).toContain('••••');
    });

    test('Superadmin can update config via POST /api/alerts/config', async () => {
      const res = await request(app)
        .post('/api/alerts/config')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({
          discord_webhook_url: 'https://discord.com/api/webhooks/999/new-token',
          telegram_chat_id: '555444333',
          cpu_threshold_percent: 88,
          ram_threshold_percent: 82,
          alert_on_security_violations: true,
          alert_on_backup_failures: false,
          active: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config.cpuThresholdPercent).toBe(88);
      expect(res.body.config.ramThresholdPercent).toBe(82);
      expect(res.body.config.alertOnBackupFailures).toBe(false);

      // Verify audit log
      const auditRes = await request(app)
        .get('/api/audit/logs?search=ALERT_CONFIG_UPDATE')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin');

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.logs.some(l => l.action === 'ALERT_CONFIG_UPDATE')).toBe(true);
    });

    test('Superadmin can test webhooks via POST /api/alerts/test', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => 'ok'
      }));

      const res = await request(app)
        .post('/api/alerts/test')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'superadmin')
        .send({
          discord_webhook_url: 'https://discord.com/api/webhooks/test/url',
          telegram_bot_token: '12345:TEST_BOT',
          telegram_chat_id: '123456789'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results.discord.success).toBe(true);
      expect(res.body.results.telegram.success).toBe(true);
    });

    test('Operator role is strictly forbidden (HTTP 403) from alert endpoints', async () => {
      const getRes = await request(app)
        .get('/api/alerts/config')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'operator');

      expect(getRes.status).toBe(403);

      const postRes = await request(app)
        .post('/api/alerts/config')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'operator')
        .send({ active: false });

      expect(postRes.status).toBe(403);
    });

    test('Viewer role is strictly forbidden (HTTP 403) from alert endpoints', async () => {
      const res = await request(app)
        .get('/api/alerts/config')
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'viewer');

      expect(res.status).toBe(403);
    });

    test('Unauthenticated requests are rejected with HTTP 401', async () => {
      const res = await request(app).get('/api/alerts/config');
      expect(res.status).toBe(401);
    });
  });
});
