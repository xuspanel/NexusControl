const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { verifySync } = require('otplib');

const activeSessions = new Map(); // token -> { createdAt, clientIp }
const challenges = new Map();     // tempToken -> { step, clientIp, expiresAt, emailOtp, emailOtpExpiresAt }
const verifiedIps = new Set();    // Set of recognized IPs that have completed email verification

// Periodically clean up expired challenges and stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [t, c] of challenges.entries()) {
    if (c.expiresAt < now) challenges.delete(t);
  }
}, 60000);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: process.env.SMTP_PORT === '465',
  auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined,
  tls: { rejectUnauthorized: false }
});

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'admin@***';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

async function sendEmailOtp(toEmail, code, clientIp) {
  const subject = `[NexusControl Security] Your Login Verification Code: ${code}`;
  const text = `A login attempt was initiated for NexusControl from IP: ${clientIp}.\n\nYour 6-digit verification code is: ${code}\n\nThis code will expire in 10 minutes. If you did not initiate this request, audit your server security immediately.\n\n-- NexusControl Host Defense`;

  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_HOST) {
      throw new Error('SMTP credentials not configured in environment (.env).');
    }

    await transporter.sendMail({
      from: `"NexusControl Security" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      text
    });
    console.log(`[AUTH SUCCESS] Dispatched security verification email to ${toEmail} for IP ${clientIp} [OTP: >>> ${code} <<<]`);
    return { success: true };
  } catch (err) {
    console.error(`[AUTH ERROR] Failed to dispatch verification email to ${toEmail} for IP ${clientIp}:`, err.message);
    console.error(err.stack);

    // CRITICAL Fallback: Print OTP directly to terminal / systemd journal so admin is never locked out
    console.log(`\n================================================================`);
    console.log(`[CRITICAL AUTH FALLBACK] EMAIL DISPATCH FAILED`);
    console.log(`Client IP        : ${clientIp}`);
    console.log(`Target Email     : ${toEmail}`);
    console.log(`6-Digit OTP Code : >>> ${code} <<<`);
    console.log(`Valid For        : 10 minutes`);
    console.log(`Error Reason     : ${err.message}`);
    console.log(`================================================================\n`);

    return { success: false, error: err.message };
  }
}

function generateToken(clientIp) {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, { createdAt: Date.now(), clientIp });
  return token;
}

function verifyToken(token) {
  if (!token) return false;
  if (process.env.NODE_ENV === 'test' && token === 'test-token') return true;
  return activeSessions.has(token);
}

function revokeToken(token) {
  if (token) activeSessions.delete(token);
}

// Step 1: Master Password Handshake
function handleStep1Password(password, clientIp) {
  const masterPassword = process.env.ADMIN_PASSWORD || 'nexus2026!';
  if (password !== masterPassword) {
    return { success: false, error: 'Invalid master password.' };
  }

  const tempToken = crypto.randomBytes(24).toString('hex');
  challenges.set(tempToken, {
    step: '2FA',
    clientIp,
    expiresAt: Date.now() + 300000 // 5 minutes
  });

  return {
    success: true,
    step: '2FA_REQUIRED',
    tempToken
  };
}

// Step 2: 2FA TOTP Verification
async function handleStep2Totp(tempToken, totpCode, clientIp) {
  const challenge = challenges.get(tempToken);
  if (!challenge || challenge.step !== '2FA' || challenge.expiresAt < Date.now()) {
    return { success: false, error: 'Authentication challenge expired. Please restart login.' };
  }

  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    return { success: false, error: 'TOTP_SECRET is not configured on server. Run setup-2fa.js.' };
  }

  const cleanCode = (totpCode || '').toString().trim();
  const verifyResult = verifySync({ token: cleanCode, secret });
  if (!verifyResult || !verifyResult.valid) {
    return { success: false, error: 'Invalid 2FA authentication code.' };
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@xus.me';

  // Check if this is a known verified IP/session
  if (verifiedIps.has(clientIp)) {
    challenges.delete(tempToken);
    const sessionToken = generateToken(clientIp);
    return {
      success: true,
      step: 'COMPLETE',
      token: sessionToken
    };
  }

  // New session / new IP: generate 6-digit email OTP
  const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
  challenge.step = 'EMAIL_OTP';
  challenge.emailOtp = emailOtp;
  challenge.emailOtpExpiresAt = Date.now() + 600000; // 10 minutes
  challenge.expiresAt = Date.now() + 600000;

  const emailResult = await sendEmailOtp(adminEmail, emailOtp, clientIp);

  if (!emailResult.success) {
    return {
      success: false,
      status: 500,
      error: 'Failed to dispatch email. Check server logs.',
      tempToken,
      step: 'EMAIL_OTP_REQUIRED',
      maskedEmail: maskEmail(adminEmail)
    };
  }

  return {
    success: true,
    step: 'EMAIL_OTP_REQUIRED',
    tempToken,
    maskedEmail: maskEmail(adminEmail)
  };
}

// Step 3: Email OTP Verification
function handleStep3EmailOtp(tempToken, code, clientIp) {
  const challenge = challenges.get(tempToken);
  if (!challenge || challenge.step !== 'EMAIL_OTP' || challenge.emailOtpExpiresAt < Date.now()) {
    return { success: false, error: 'Verification code expired. Please restart login.' };
  }

  const cleanCode = (code || '').toString().trim();
  if (cleanCode !== challenge.emailOtp) {
    return { success: false, error: 'Invalid 6-digit email verification code.' };
  }

  // Success! Whitelist IP for this session, purge challenge, issue bearer token
  verifiedIps.add(clientIp);
  challenges.delete(tempToken);

  const sessionToken = generateToken(clientIp);
  return {
    success: true,
    step: 'COMPLETE',
    token: sessionToken
  };
}

// Auth Middleware for protected endpoints
function authMiddleware(req, res, next) {
  // Inject mock test user context in test environment without manual multi-step login
  if (process.env.NODE_ENV === 'test' && (req.headers['authorization'] === 'Bearer test-token' || req.headers['x-test-auth'] === 'true')) {
    req.authenticated = true;
    req.user = req.headers['x-test-user'] || 'root';
    return next();
  }

  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [name, val] = c.trim().split('=');
      if (name === 'nx_token') {
        token = val;
        break;
      }
    }
  }

  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (verifyToken(token)) {
    req.authenticated = true;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
}

module.exports = {
  handleStep1Password,
  handleStep2Totp,
  handleStep3EmailOtp,
  verifyToken,
  generateToken,
  revokeToken,
  authMiddleware
};
