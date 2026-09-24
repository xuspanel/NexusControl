function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // If comma separated, take the first IP
    const first = forwarded.split(',')[0].trim();
    return cleanIp(first);
  }
  if (req.headers['x-real-ip']) {
    return cleanIp(req.headers['x-real-ip'].trim());
  }
  return cleanIp(req.socket?.remoteAddress || '');
}

function cleanIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  return ip;
}

function ipWhitelistMiddleware(req, res, next) {
  const allowedIpsStr = process.env.ALLOWED_IPS || '';
  // Always permit loopback for internal health checks
  const defaultAllowed = ['127.0.0.1', '::1', 'localhost'];
  const configuredAllowed = allowedIpsStr
    .split(',')
    .map(ip => cleanIp(ip.trim()))
    .filter(Boolean);

  const clientIp = getClientIp(req);
  req.clientIp = clientIp;

  // If 0.0.0.0/0 or wildcard is specified, allow all traffic
  if (configuredAllowed.includes('0.0.0.0/0') || configuredAllowed.includes('*') || configuredAllowed.includes('all')) {
    return next();
  }

  const allowedSet = new Set([...defaultAllowed, ...configuredAllowed]);

  if (allowedSet.has(clientIp)) {
    return next();
  }

  // Not whitelisted - drop immediately with 403
  console.warn(`[SECURITY ALERT] Blocked unauthorized access attempt from unwhitelisted IP: ${clientIp} on ${req.method} ${req.originalUrl}`);

  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>403 Forbidden — NexusControl Perimeter Defense</title>
  <style>
    body { background-color: #09090b; color: #f43f5e; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { background: #121215; border: 1px solid #27272a; padding: 2rem; border-radius: 0.75rem; text-align: center; max-width: 480px; }
    h1 { margin-top: 0; font-size: 1.5rem; color: #f43f5e; }
    p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.5; }
    .ip { color: #f4f4f5; background: #27272a; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="box">
    <h1>403 Access Denied</h1>
    <p>Your client IP address <span class="ip">${clientIp || 'Unknown'}</span> is not whitelisted in the NexusControl firewall perimeter policy.</p>
    <p style="font-size: 0.75rem; color: #71717a; margin-top: 1.5rem;">NexusControl Defense-in-Depth • Host Perimeter Enforced</p>
  </div>
</body>
</html>`);
  }

  return res.status(403).json({
    error: 'Forbidden: Client IP address is not whitelisted.',
    ip: clientIp
  });
}

function isIpAllowed(ip) {
  const allowedIpsStr = process.env.ALLOWED_IPS || '';
  const defaultAllowed = ['127.0.0.1', '::1', 'localhost'];
  const configuredAllowed = allowedIpsStr
    .split(',')
    .map(i => cleanIp(i.trim()))
    .filter(Boolean);

  if (configuredAllowed.includes('0.0.0.0/0') || configuredAllowed.includes('*') || configuredAllowed.includes('all')) {
    return true;
  }

  const allowedSet = new Set([...defaultAllowed, ...configuredAllowed]);
  const cleaned = cleanIp(ip);
  return allowedSet.has(cleaned);
}

module.exports = {
  getClientIp,
  cleanIp,
  isIpAllowed,
  ipWhitelistMiddleware
};
