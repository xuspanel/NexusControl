import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Send,
  ShieldAlert,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  ExternalLink,
  MessageSquare,
  Radio,
  Archive,
  Lock,
  Sliders,
  Check,
  Mail,
  AtSign,
  Server
} from 'lucide-react';

export default function AlertsView({ token, onShowToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [emailTestResult, setEmailTestResult] = useState(null);

  // Form states
  const [active, setActive] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [cpuThresholdPercent, setCpuThresholdPercent] = useState(90);
  const [ramThresholdPercent, setRamThresholdPercent] = useState(90);
  const [alertOnSecurityViolations, setAlertOnSecurityViolations] = useState(true);
  const [alertOnBackupFailures, setAlertOnBackupFailures] = useState(true);

  // SMTP Email Form states
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [alertEmailAddress, setAlertEmailAddress] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);

  // Password / secret visibility toggles
  const [showDiscord, setShowDiscord] = useState(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  const authHeaders = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/alerts/config', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load alerts configuration.');
      const data = await res.json();
      if (data.config) {
        setActive(Boolean(data.config.active));
        setDiscordWebhookUrl(data.config.discordWebhookUrl || '');
        setTelegramBotToken(data.config.telegramBotToken || '');
        setTelegramChatId(data.config.telegramChatId || '');
        setCpuThresholdPercent(data.config.cpuThresholdPercent ?? 90);
        setRamThresholdPercent(data.config.ramThresholdPercent ?? 90);
        setAlertOnSecurityViolations(data.config.alertOnSecurityViolations ?? true);
        setAlertOnBackupFailures(data.config.alertOnBackupFailures ?? true);
        setSmtpHost(data.config.smtpHost || '');
        setSmtpPort(data.config.smtpPort ?? 587);
        setSmtpUser(data.config.smtpUser || '');
        setSmtpPass(data.config.smtpPass || '');
        setSmtpFrom(data.config.smtpFrom || '');
        setAlertEmailAddress(data.config.alertEmailAddress || '');
        setEmailEnabled(Boolean(data.config.emailEnabled));
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, onShowToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setTestResults(null);
    try {
      const payload = {
        active,
        discord_webhook_url: discordWebhookUrl,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        cpu_threshold_percent: cpuThresholdPercent,
        ram_threshold_percent: ramThresholdPercent,
        alert_on_security_violations: alertOnSecurityViolations,
        alert_on_backup_failures: alertOnBackupFailures,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_from: smtpFrom,
        alert_email_address: alertEmailAddress,
        email_enabled: emailEnabled
      };

      const res = await fetch('/api/alerts/config', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update alert settings.');
      }

      if (onShowToast) {
        onShowToast('Alerting configuration saved successfully.', 'success');
      }

      // Update with sanitized/masked values from response
      if (data.config) {
        setDiscordWebhookUrl(data.config.discordWebhookUrl || '');
        setTelegramBotToken(data.config.telegramBotToken || '');
        setSmtpPass(data.config.smtpPass || '');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          discord_webhook_url: discordWebhookUrl,
          telegram_bot_token: telegramBotToken,
          telegram_chat_id: telegramChatId,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
          smtp_from: smtpFrom,
          alert_email_address: alertEmailAddress
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch test alerts.');
      }

      setTestResults(data.results);
      if (data.results?.email) {
        setEmailTestResult(data.results.email);
      }

      const dOk = data.results?.discord?.success;
      const tOk = data.results?.telegram?.success;
      const eOk = data.results?.email?.success;
      if (dOk || tOk || eOk) {
        if (onShowToast) onShowToast('Test alert dispatched successfully!', 'success');
      } else {
        if (onShowToast) onShowToast('No channels responded with success. Check credentials.', 'warning');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
          smtp_from: smtpFrom,
          alert_email_address: alertEmailAddress
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to test SMTP configuration.');
      }

      const emailRes = data.results?.email;
      setEmailTestResult(emailRes);

      if (emailRes?.success) {
        if (onShowToast) onShowToast(`Test email successfully delivered to ${alertEmailAddress}!`, 'success');
      } else {
        if (onShowToast) onShowToast(emailRes?.error || 'Failed to deliver test email.', 'error');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-xs font-mono text-zinc-400">Loading alerts configuration...</p>
      </div>
    );
  }

  const hasAnyChannel = discordWebhookUrl || telegramBotToken || (smtpHost && alertEmailAddress);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 backdrop-blur-md relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-inner">
              <Bell className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
                  Webhook Alerting Worker
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border flex items-center gap-1.5 ${
                    active
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                  {active ? 'Worker Active' : 'Silenced'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Interception worker that posts incident alerts and hardware threshold spikes to Discord, Telegram, and Email (SMTP) via lightweight native Node.js dispatch.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || saving || !hasAnyChannel}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all flex items-center gap-2 shadow-xs"
              title="Send a sample alert to test configured notification channels"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin text-purple-400" /> : <Send className="w-4 h-4 text-purple-400" />}
              <span>Send Test Alert</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Settings</span>
            </button>
          </div>
        </div>

        {/* Test Results Banner (If tested) */}
        {testResults && (
          <div className="mt-4 pt-4 border-t border-zinc-800/80 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono text-zinc-400 text-[11px]">Test Dispatch Results:</span>
            {testResults.discord?.tested && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono ${
                testResults.discord.success
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {testResults.discord.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Discord: {testResults.discord.success ? 'Delivered' : testResults.discord.error || 'Failed'}
              </span>
            )}
            {testResults.telegram?.tested && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono ${
                testResults.telegram.success
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {testResults.telegram.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Telegram: {testResults.telegram.success ? 'Delivered' : testResults.telegram.error || 'Failed'}
              </span>
            )}
            {testResults.email?.tested && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono ${
                testResults.email.success
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {testResults.email.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Email: {testResults.email.success ? 'Delivered' : testResults.email.error || 'Failed'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Master Toggle Switch */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">
              Master Webhook Notification Switch
            </div>
            <div className="text-[11px] text-zinc-400">
              When toggled off, all incident hooks and resource threshold dispatchers are silenced.
            </div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div>

      {/* 3. Platform Channels (Discord & Telegram) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Discord Configuration Card */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Discord Webhook</h3>
                  <p className="text-[11px] text-zinc-400">Rich embedded cards color-coded by severity</p>
                </div>
              </div>
              <a
                href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-zinc-400 hover:text-indigo-400 flex items-center gap-1 transition-colors"
              >
                <span>Docs</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Discord Webhook URL
              </label>
              <div className="relative">
                <input
                  type={showDiscord ? 'text' : 'password'}
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDiscord(!showDiscord)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                >
                  {showDiscord ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span>Red embed for errors & attacks, yellow for resource spikes, green for recovery.</span>
          </div>
        </div>

        {/* Telegram Bot Configuration Card */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Telegram Bot</h3>
                  <p className="text-[11px] text-zinc-400">Instant MarkdownV2 mobile push alerts</p>
                </div>
              </div>
              <a
                href="https://core.telegram.org/bots/tutorial"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-zinc-400 hover:text-sky-400 flex items-center gap-1 transition-colors"
              >
                <span>Docs</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Telegram Bot Token
                </label>
                <div className="relative">
                  <input
                    type={showTelegram ? 'text' : 'password'}
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-sky-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelegram(!showTelegram)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                  >
                    {showTelegram ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Generated via <span className="font-mono text-zinc-400">@BotFather</span> on Telegram.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Chat ID or Channel ID
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 987654321 or -100123456789"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-sky-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Obtain your private User ID via <span className="font-mono text-zinc-400">@userinfobot</span>, or group ID.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
            <span>Sends direct alerts using Telegram API with native MarkdownV2 formatting.</span>
          </div>
        </div>

        {/* Email (SMTP) Configuration Card */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Email (SMTP) Alerting</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border flex items-center gap-1 ${
                    emailEnabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${emailEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                    {emailEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">Direct RFC 5321 dispatch to system administrators with HTML color styling</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {emailTestResult && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs ${
                  emailTestResult.success
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {emailTestResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  <span>{emailTestResult.success ? 'SMTP Verified' : (emailTestResult.error || 'Failed')}</span>
                </span>
              )}

              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testingEmail || saving || !smtpHost || !alertEmailAddress}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all flex items-center gap-1.5 shadow-xs"
                title="Send a sample email to verify SMTP credentials"
              >
                {testingEmail ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Send className="w-3.5 h-3.5 text-emerald-400" />}
                <span>Test Email</span>
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                <span className="text-xs text-zinc-300 font-medium">Enable</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* SMTP Host */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-zinc-400" />
                <span>SMTP Host / Server</span>
              </label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="e.g. smtp.gmail.com, mail.example.com, smtp.sendgrid.net"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
              />
            </div>

            {/* SMTP Port */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Port
              </label>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                placeholder="587"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
              />
              <p className="text-[10px] text-zinc-500 mt-1">587 (STARTTLS), 465 (SSL), or 25</p>
            </div>

            {/* SMTP Username */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                SMTP Username
              </label>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="username@domain.com or API Key"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
              />
            </div>

            {/* SMTP Password */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                SMTP Password / Secret
              </label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(!showSmtpPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                >
                  {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* From Address */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <AtSign className="w-3.5 h-3.5 text-zinc-400" />
                <span>From Address</span>
              </label>
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder='"NexusControl" <alerts@domain.com>'
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
              />
            </div>

            {/* Alert Email Address */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Target Alert Email Address (Recipient)
              </label>
              <input
                type="email"
                value={alertEmailAddress}
                onChange={(e) => setAlertEmailAddress(e.target.value)}
                placeholder="admin@domain.com, oncall@domain.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-xs font-mono text-zinc-200 placeholder-zinc-600 transition-colors"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Recipient address where critical alerts and threshold notifications will be delivered.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Port 465 automatically engages SSL/TLS; port 587 uses STARTTLS. Connection timeouts protect the backend from hanging mail servers.</span>
          </div>
        </div>
      </div>

      {/* 4. Incident Triggers & Thresholds */}
      <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Event Interceptors & Resource Thresholds</h3>
            <p className="text-[11px] text-zinc-400">Configure which system occurrences trigger immediate webhook dispatches</p>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/90 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">Security Violations</div>
                <div className="text-[11px] text-zinc-500 leading-normal">
                  Alert on unauthorized FGAC directory traversal, jailbreaks, or repeated failed logins.
                </div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
              <input
                type="checkbox"
                checked={alertOnSecurityViolations}
                onChange={(e) => setAlertOnSecurityViolations(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
            </label>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/90 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
                <Archive className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">Backup Failures</div>
                <div className="text-[11px] text-zinc-500 leading-normal">
                  Alert when scheduled snapshots fail or S3 / Google Drive cloud replication encounters errors.
                </div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
              <input
                type="checkbox"
                checked={alertOnBackupFailures}
                onChange={(e) => setAlertOnBackupFailures(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* CPU Threshold */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>CPU Utilization Threshold</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
                cpuThresholdPercent > 85
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }`}>
                {cpuThresholdPercent}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={cpuThresholdPercent}
              onChange={(e) => setCpuThresholdPercent(parseInt(e.target.value, 10))}
              className="w-full accent-purple-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>10% (Sensitive)</span>
              <span>Default: 90%</span>
              <span>100%</span>
            </div>
          </div>

          {/* RAM Threshold */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Activity className="w-4 h-4 text-sky-400" />
                <span>RAM Utilization Threshold</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
                ramThresholdPercent > 85
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
              }`}>
                {ramThresholdPercent}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={ramThresholdPercent}
              onChange={(e) => setRamThresholdPercent(parseInt(e.target.value, 10))}
              className="w-full accent-purple-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>10% (Sensitive)</span>
              <span>Default: 90%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500">
          💡 The resource worker inspects host statistics every 5 minutes. To avoid notification spam, an alert fires once upon exceeding the threshold, and a recovery confirmation fires when usage drops back below the threshold.
        </p>
      </div>
    </div>
  );
}
