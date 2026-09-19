#!/usr/bin/env node
const path = require('node:path');
const fs = require('node:fs');

// Load environment variables from /opt/NexusControl/.env
const envPath = path.resolve(__dirname, '../.env');
try {
  require(path.resolve(__dirname, '../backend/node_modules/dotenv')).config({ path: envPath });
} catch {
  require('dotenv').config({ path: envPath });
}

// Resolve nodemailer from backend node_modules
let nodemailer;
try {
  nodemailer = require(path.resolve(__dirname, '../backend/node_modules/nodemailer'));
} catch {
  nodemailer = require('nodemailer');
}

const host = process.env.SMTP_HOST || 'localhost';
const port = parseInt(process.env.SMTP_PORT, 10) || 587;
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';
const toEmail = process.env.ADMIN_EMAIL || 'admin@xus.me';

console.log('================================================================');
console.log('           NexusControl SMTP & Email Diagnostic Tool           ');
console.log('================================================================');
console.log(`Configuration Source: ${envPath}`);
console.log(`SMTP Host           : ${host}`);
console.log(`SMTP Port           : ${port}`);
console.log(`SMTP User           : ${user || '(not set)'}`);
console.log(`SMTP Pass           : ${pass ? '********' : '(not set)'}`);
console.log(`Destination Email   : ${toEmail}`);
console.log('----------------------------------------------------------------');

const isSecure = (port === 465);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: isSecure,
  auth: (user && pass) ? { user, pass } : undefined,
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

async function runDiagnostic() {
  console.log(`[*] Initiating transport connection to ${host}:${port}...`);

  try {
    const verified = await transporter.verify();
    console.log('[+] SMTP Connection Verification: SUCCESS');
    console.log(`    Server ready to accept messages: ${JSON.stringify(verified)}`);
  } catch (verifyErr) {
    console.error('\n[-] SMTP Connection Verification: FAILED');
    console.error(`    Error Code   : ${verifyErr.code || 'UNKNOWN'}`);
    console.error(`    Command      : ${verifyErr.command || 'N/A'}`);
    console.error(`    Message      : ${verifyErr.message}`);
    if (verifyErr.code === 'ECONNREFUSED') {
      console.error('\n[!] DIAGNOSTIC HINT: Connection refused at ' + host + ':' + port + '.');
      console.error('    No SMTP service is listening on this address/port.');
      console.error('    If your mail server is external (e.g., mail.xus.me), update SMTP_HOST in .env.');
    } else if (verifyErr.code === 'ETIMEDOUT') {
      console.error('\n[!] DIAGNOSTIC HINT: Connection timed out. Port ' + port + ' may be blocked by firewall or ISP.');
    } else if (verifyErr.responseCode === 535 || verifyErr.code === 'EAUTH') {
      console.error('\n[!] DIAGNOSTIC HINT: Authentication failed. Verify SMTP_USER and SMTP_PASS in .env.');
    }
    console.error('\nFull Stack Trace:');
    console.error(verifyErr.stack);
    console.log('----------------------------------------------------------------');
    process.exit(1);
  }

  console.log('\n[*] Attempting to dispatch diagnostic email to ' + toEmail + '...');
  try {
    const info = await transporter.sendMail({
      from: `"NexusControl Diagnostic" <${user || 'noreply@xus.me'}>`,
      to: toEmail,
      subject: `[NexusControl] SMTP Diagnostic Test — ${new Date().toISOString()}`,
      text: `This is an automated diagnostic test from NexusControl on host ${require('os').hostname()}.\n\nSMTP configuration is operating successfully.`,
      html: `<div style="font-family: monospace; padding: 16px; background: #09090b; color: #10b981; border-radius: 8px;">
        <h3>NexusControl SMTP Diagnostic Verified</h3>
        <p style="color: #f4f4f5;">Your VPS email verification pipeline is active and ready to deliver authentication OTPs.</p>
        <hr style="border: 0; border-top: 1px solid #27272a;" />
        <p style="color: #71717a; font-size: 11px;">Timestamp: ${new Date().toISOString()} • Host: ${require('os').hostname()}</p>
      </div>`
    });

    console.log('[+] Message Sent Successfully!');
    console.log(`    Message ID: ${info.messageId}`);
    console.log(`    Response  : ${info.response}`);
    console.log('================================================================');
  } catch (sendErr) {
    console.error('\n[-] Message Dispatch: FAILED');
    console.error(`    Message: ${sendErr.message}`);
    console.error('Full Stack Trace:');
    console.error(sendErr.stack);
    console.log('================================================================');
    process.exit(1);
  }
}

runDiagnostic();
