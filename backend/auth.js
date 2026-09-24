const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { verifySync } = require('otplib');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'nexuscontrol-jwt-secret-key-32-chars-min';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

const challenges = new Map();     // tempToken -> { step, userId, username, role, clientIp, expiresAt, emailOtp, emailOtpExpiresAt }
const verifiedIps = new Set();    // Set of recognized IPs that have completed email verification
const revokedTokens = new Set();  // In-memory blacklist for revoked JWTs

// Periodically clean up expired challenges
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [t, c] of challenges.entries()) {
    if (c.expiresAt < now) challenges.delete(t);
  }
}, 60000);
if (cleanupInterval.unref) cleanupInterval.unref();

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

    // Fallback: Print OTP directly to terminal / journal so admin is not locked out
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

/**
 * Generate a signed JWT token containing user identity and role
 */
function generateToken(user) {
  const policies = db.parsePolicies ? db.parsePolicies(user.granular_policies) : user.granular_policies;
  const is2fa = Boolean(user.two_factor_enabled);
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    two_factor_enabled: is2fa,
    granular_policies: policies || null
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT token and return decoded payload or null
 */
function verifyToken(token) {
  if (!token) return null;

  if (revokedTokens.has(token)) {
    return null;
  }

  if (process.env.NODE_ENV === 'test' && token === 'test-token') {
    return {
      id: 'test-admin',
      username: 'root',
      role: 'superadmin',
      two_factor_enabled: true
    };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch {
    return null;
  }
}

function revokeToken(token) {
  if (token) revokedTokens.add(token);
}

/**
 * Step 1: Username & Password Verification
 * Supports both { username, password } and legacy { password } (defaulting to 'admin').
 */
function handleStep1Password(password, clientIp, username = 'admin') {
  const targetUsername = (username || 'admin').trim().toLowerCase();
  const user = db.getUserByUsername(targetUsername);

  if (!user) {
    return { success: false, error: 'Invalid master password.' };
  }

  let passwordMatches = false;
  try {
    passwordMatches = bcrypt.compareSync(password, user.password_hash);
  } catch (err) {
    console.error('[AUTH BCRYPT ERROR]', err);
  }

  // Backwards-compatibility fallback if environment password was updated directly in .env
  if (!passwordMatches && targetUsername === 'admin' && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    passwordMatches = true;
    db.updateUserPassword(user.id, password);
  }

  if (!passwordMatches) {
    return { success: false, error: 'Invalid master password.' };
  }

  // Check if 2FA is enabled for this user or required globally
  const is2faActive = (user.two_factor_enabled === 1 || user.two_factor_enabled === true || user.two_factor_enabled === '1') || (process.env.TOTP_ENFORCED === 'true');
  const hasTotp = is2faActive && Boolean(user.totp_secret);

  if (hasTotp) {
    const tempToken = crypto.randomBytes(24).toString('hex');
    challenges.set(tempToken, {
      step: '2FA',
      userId: user.id,
      username: user.username,
      role: user.role,
      clientIp,
      expiresAt: Date.now() + 300000 // 5 minutes
    });

    return {
      success: true,
      step: '2FA_REQUIRED',
      tempToken,
      username: user.username
    };
  }

  // When two_factor_enabled is false/0 -> Complete authentication immediately
  db.updateUserLastLogin(user.id);
  const sessionToken = generateToken(user);

  return {
    success: true,
    step: 'COMPLETE',
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      two_factor_enabled: Boolean(user.two_factor_enabled)
    }
  };
}

/**
 * Step 2: 2FA TOTP Verification
 */
async function handleStep2Totp(tempToken, totpCode, clientIp) {
  const challenge = challenges.get(tempToken);
  if (!challenge || challenge.step !== '2FA' || challenge.expiresAt < Date.now()) {
    return { success: false, error: 'Authentication challenge expired. Please restart login.' };
  }

  const user = db.getUserById(challenge.userId);
  if (!user) {
    return { success: false, error: 'User no longer exists.' };
  }

  const secret = user.totp_secret || process.env.TOTP_SECRET;
  if (!secret) {
    return { success: false, error: '2FA TOTP secret is not configured for this user.' };
  }

  const cleanCode = (totpCode || '').toString().trim();
  const verifyResult = verifySync({ token: cleanCode, secret });
  const isValid = verifyResult === true || (verifyResult && verifyResult.valid === true);
  if (!isValid) {
    return { success: false, error: 'Invalid 2FA authentication code.' };
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@xus.me';

  // Check if IP has completed email verification, or if email OTP is not enforced
  const emailEnforced = process.env.EMAIL_OTP_ENFORCED !== 'false';
  if (verifiedIps.has(clientIp) || !emailEnforced) {
    challenges.delete(tempToken);
    db.updateUserLastLogin(user.id);
    const sessionToken = generateToken(user);
    return {
      success: true,
      step: 'COMPLETE',
      token: sessionToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
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
      error: 'Failed to dispatch verification email. Check server logs.',
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

/**
 * Step 3: Email OTP Verification
 */
function handleStep3EmailOtp(tempToken, code, clientIp) {
  const challenge = challenges.get(tempToken);
  if (!challenge || challenge.step !== 'EMAIL_OTP' || challenge.emailOtpExpiresAt < Date.now()) {
    return { success: false, error: 'Verification code expired. Please restart login.' };
  }

  const cleanCode = (code || '').toString().trim();
  if (cleanCode !== challenge.emailOtp) {
    return { success: false, error: 'Invalid 6-digit email verification code.' };
  }

  const user = db.getUserById(challenge.userId);
  if (!user) {
    return { success: false, error: 'User no longer exists.' };
  }

  verifiedIps.add(clientIp);
  challenges.delete(tempToken);
  db.updateUserLastLogin(user.id);

  const sessionToken = generateToken(user);
  return {
    success: true,
    step: 'COMPLETE',
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  };
}

/**
 * Auth Middleware for protected endpoints
 * Extracts Bearer token, cookie nx_token, or ?token query param
 */
function authMiddleware(req, res, next) {
  // Test environment mock context
  if (process.env.NODE_ENV === 'test' && (req.headers['authorization'] === 'Bearer test-token' || req.headers['x-test-auth'] === 'true')) {
    req.authenticated = true;
    const testRole = req.headers['x-test-role'] || 'superadmin';
    const testUsername = req.headers['x-test-user'] || 'root';
    let testPolicies = null;
    if (req.headers['x-test-policies']) {
      try {
        testPolicies = JSON.parse(req.headers['x-test-policies']);
      } catch {}
    }
    req.user = {
      id: 'test-admin-id',
      username: testUsername,
      role: testRole,
      granular_policies: testPolicies
    };
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

  const decoded = verifyToken(token);
  if (decoded) {
    req.authenticated = true;
    req.user = decoded;

    // Always fetch up-to-date user state from SQLite
    if (decoded.id) {
      try {
        const liveUser = db.getUserById(decoded.id);
        if (liveUser) {
          req.user.role = liveUser.role;
          req.user.two_factor_enabled = Boolean(liveUser.two_factor_enabled);
          if (decoded.role === 'custom') {
            req.user.granular_policies = liveUser.granular_policies;
          }
        }
      } catch (err) {
        console.warn('[AUTH] Failed to refresh live user state:', err.message);
      }
    }

    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
}

/**
 * Role-Based & Fine-Grained Access Control Middleware Factory
 * @param {string[]} allowedRoles Array of roles permitted (e.g. ['superadmin'], ['superadmin', 'operator'])
 * @param {string} [requestedModule] Name of the requested module (e.g. 'files', 'docker', 'terminal')
 */
function requireRole(allowedRoles = [], requestedModule = null) {
  return (req, res, next) => {
    if (!req.authenticated || !req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }

    const userRole = req.user.role;

    // SuperAdmin bypasses all role and module checks (God Mode)
    if (userRole === 'superadmin') {
      return next();
    }

    // Dynamic FGAC check for custom role
    if (userRole === 'custom') {
      if (!requestedModule) {
        if (allowedRoles.includes('custom')) {
          return next();
        }
        return res.status(403).json({
          error: 'Forbidden: Insufficient privileges for this resource.',
          requiredRoles: allowedRoles,
          currentRole: 'custom'
        });
      }

      const policies = req.user.granular_policies;
      const hasModuleAccess = Boolean(policies?.modules?.[requestedModule]);

      if (!hasModuleAccess) {
        return res.status(403).json({
          error: `Forbidden: Access to module '${requestedModule}' denied by policy.`,
          module: requestedModule,
          currentRole: 'custom'
        });
      }

      return next();
    }

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges for this resource.',
        requiredRoles: allowedRoles,
        currentRole: userRole || 'anonymous'
      });
    }

    next();
  };
}

module.exports = {
  handleStep1Password,
  handleStep2Totp,
  handleStep3EmailOtp,
  verifyToken,
  generateToken,
  revokeToken,
  authMiddleware,
  requireRole,
  JWT_SECRET
};
