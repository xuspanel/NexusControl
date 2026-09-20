const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const util = require('node:util');

const execFileAsync = util.promisify(execFile);

const NGINX_CONF_DIR = process.env.NGINX_CONF_DIR || '/etc/nginx/conf.d';
const TMP_STAGE_FILE = process.env.TMP_STAGE_FILE || '/tmp/nexus_vhost_stage.conf';
const PUBLIC_IP = process.env.SERVER_PUBLIC_IP || '132.145.70.205';
const SIGNATURE_HEADER = '# Managed by NexusControl - Do Not Edit Manually Outside UI';

// RFC-compliant domain validation regex
const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Validate input domain name strictly
 */
function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const trimmed = domain.trim().toLowerCase();
  if (trimmed.length > 253) return false;
  // Disallow command injection / dangerous characters
  if (/[;&`$|\s<>]/.test(trimmed)) return false;
  return DOMAIN_REGEX.test(trimmed);
}

/**
 * Execute nginx -t to test configuration syntax
 */
async function testNginxSyntax() {
  try {
    const { stdout, stderr } = await execFileAsync('nginx', ['-t']);
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Nginx syntax validation failed'
    };
  }
}

/**
 * Reload Nginx web server
 */
async function reloadNginx() {
  try {
    await execFileAsync('systemctl', ['reload', 'nginx']);
    return { ok: true };
  } catch (err) {
    // Fallback if systemctl is unavailable or fails
    try {
      await execFileAsync('nginx', ['-s', 'reload']);
      return { ok: true };
    } catch (fallbackErr) {
      throw new Error(`Failed to reload Nginx: ${err.message || fallbackErr.message}`);
    }
  }
}

/**
 * Render Nginx vHost configuration text
 */
function renderVHostTemplate(domain, config = {}) {
  const {
    type = 'proxy',
    target = 'http://127.0.0.1:8888',
    clientMaxBodySize = '0',
    supportWebSocket = true,
    supportSse = true,
    redirectCode = 301,
    webRoot = `/var/www/${domain}/html`
  } = config;

  let bodyDirective = `client_max_body_size ${clientMaxBodySize || '0'};`;

  let mainLocation = '';
  let metadataComment = `# Type: ${type}\n# Target: ${target}\n# BodySize: ${clientMaxBodySize || '0'}\n# WebSocket: ${!!supportWebSocket}\n# SSE: ${!!supportSse}`;

  if (type === 'proxy') {
    let normalizedTarget = target.trim();
    if (!normalizedTarget.startsWith('http://') && !normalizedTarget.startsWith('https://')) {
      normalizedTarget = `http://${normalizedTarget}`;
    }

    const wsConfig = supportWebSocket ? `
        # WebSocket reverse proxy headers
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";` : '';

    const sseConfig = supportSse ? `
        # Server-Sent Events non-buffering & streaming headers
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;` : '';

    mainLocation = `
    location / {
        proxy_pass ${normalizedTarget};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;${wsConfig}${sseConfig}
    }`;
  } else if (type === 'static') {
    const rootPath = path.resolve(webRoot.trim());
    metadataComment = `# Type: static\n# Target: ${rootPath}\n# BodySize: ${clientMaxBodySize || '0'}`;

    mainLocation = `
    root ${rootPath};
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }`;
  } else if (type === 'redirect') {
    const code = Number(redirectCode) === 302 ? 302 : 301;
    metadataComment = `# Type: redirect\n# Target: ${target.trim()}\n# Code: ${code}`;

    mainLocation = `
    location / {
        return ${code} ${target.trim()}$request_uri;
    }`;
  } else {
    throw new Error(`Unsupported vHost type: ${type}`);
  }

  return `${SIGNATURE_HEADER}
# Domain: ${domain}
# GeneratedAt: ${new Date().toISOString()}
${metadataComment}

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    # Let's Encrypt ACME HTTP-01 Challenge Directory
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Upload & Body Size Limits
    ${bodyDirective}
${mainLocation}
}
`;
}

/**
 * Atomic configuration pipeline:
 * 1. Validate domain
 * 2. If static site, ensure root directory exists
 * 3. Write template to staging file (/tmp/nexus_vhost_stage.conf AND conf.d/nexus_vhost_stage_<domain>.conf)
 * 4. Test with nginx -t
 * 5. On failure, rollback immediately & unlink staging file, throw error
 * 6. On success, move staging file to target, unlink /tmp stage, reload nginx
 */
async function createOrUpdateVHost(domain, config = {}) {
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    throw new Error(`Invalid domain name: "${cleanDomain}". Must adhere to RFC standards.`);
  }

  // If static site, create web root directory if missing
  if (config.type === 'static') {
    const rootPath = path.resolve(config.webRoot || `/var/www/${cleanDomain}/html`);
    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath, { recursive: true });
      const sampleIndex = path.join(rootPath, 'index.html');
      if (!fs.existsSync(sampleIndex)) {
        fs.writeFileSync(sampleIndex, `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${cleanDomain} - NexusControl</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #10b981; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #18181b; padding: 2.5rem; border-radius: 12px; border: 1px solid #27272a; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
        h1 { margin: 0 0 1rem; font-size: 2rem; }
        p { color: #a1a1aa; font-family: monospace; }
    </style>
</head>
<body>
    <div class="card">
        <h1>${cleanDomain}</h1>
        <p>Managed by NexusControl Static Engine</p>
    </div>
</body>
</html>`);
      }
    }
  }

  const content = renderVHostTemplate(cleanDomain, config);

  const targetConf = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf`);
  const disabledConf = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf.disabled`);
  const stageConf = path.join(NGINX_CONF_DIR, `nexus_vhost_stage_${cleanDomain}.conf`);
  const backupConf = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf.bak`);

  // Stage 1: write to /tmp/nexus_vhost_stage.conf
  try {
    fs.writeFileSync(TMP_STAGE_FILE, content, 'utf8');
  } catch (err) {
    // Non-fatal if /tmp write fails, but log
    console.warn(`[vHostEngine] Could not write to ${TMP_STAGE_FILE}:`, err.message);
  }

  // Stage 2: write to conf.d staging file
  fs.writeFileSync(stageConf, content, 'utf8');

  // If an active target configuration already exists, temporarily backup & remove it
  // so nginx -t doesn't complain about conflicting server names on 0.0.0.0:80
  const hadExistingActive = fs.existsSync(targetConf);
  if (hadExistingActive) {
    fs.renameSync(targetConf, backupConf);
  }

  // Stage 3: test configuration syntax
  const testResult = await testNginxSyntax();

  if (!testResult.ok) {
    // Syntax failed: abort and rollback immediately
    try {
      if (fs.existsSync(stageConf)) fs.unlinkSync(stageConf);
      if (fs.existsSync(TMP_STAGE_FILE)) fs.unlinkSync(TMP_STAGE_FILE);
    } catch (_) {}

    // Restore original if was backed up
    if (hadExistingActive && fs.existsSync(backupConf)) {
      try {
        fs.renameSync(backupConf, targetConf);
      } catch (_) {}
    }

    const err = new Error(`Nginx syntax check failed:\n${testResult.stderr}`);
    err.nginxStderr = testResult.stderr;
    err.status = 400;
    throw err;
  }

  // Stage 4: syntax passed, promote stageConf to targetConf
  try {
    fs.renameSync(stageConf, targetConf);
    if (fs.existsSync(backupConf)) {
      fs.unlinkSync(backupConf);
    }
    if (fs.existsSync(disabledConf)) {
      // Clean up disabled version if re-creating
      fs.unlinkSync(disabledConf);
    }
    if (fs.existsSync(TMP_STAGE_FILE)) {
      fs.unlinkSync(TMP_STAGE_FILE);
    }
  } catch (err) {
    // Rollback on filesystem rename error
    if (hadExistingActive && fs.existsSync(backupConf)) {
      fs.renameSync(backupConf, targetConf);
    }
    throw new Error(`Failed to activate virtual host file: ${err.message}`);
  }

  // Reload Nginx
  await reloadNginx();

  return {
    success: true,
    domain: cleanDomain,
    targetFile: targetConf,
    type: config.type || 'proxy',
    target: config.target
  };
}

/**
 * Toggle vHost state between .conf (enabled) and .conf.disabled (disabled)
 */
async function toggleVHost(domain) {
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    throw new Error(`Invalid domain name: "${cleanDomain}"`);
  }

  const activePath = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf`);
  const disabledPath = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf.disabled`);

  if (fs.existsSync(activePath)) {
    // Check signature
    const header = fs.readFileSync(activePath, 'utf8').slice(0, 150);
    if (!header.includes(SIGNATURE_HEADER)) {
      throw new Error(`File ${activePath} was not generated by NexusControl. Action aborted.`);
    }

    fs.renameSync(activePath, disabledPath);
    const testResult = await testNginxSyntax();
    if (!testResult.ok) {
      // Rollback
      fs.renameSync(disabledPath, activePath);
      throw new Error(`Nginx syntax test failed after disabling: ${testResult.stderr}`);
    }
    await reloadNginx();
    return { domain: cleanDomain, enabled: false };
  } else if (fs.existsSync(disabledPath)) {
    // Check signature
    const header = fs.readFileSync(disabledPath, 'utf8').slice(0, 150);
    if (!header.includes(SIGNATURE_HEADER)) {
      throw new Error(`File ${disabledPath} was not generated by NexusControl. Action aborted.`);
    }

    fs.renameSync(disabledPath, activePath);
    const testResult = await testNginxSyntax();
    if (!testResult.ok) {
      // Rollback
      fs.renameSync(activePath, disabledPath);
      throw new Error(`Nginx syntax test failed after enabling: ${testResult.stderr}`);
    }
    await reloadNginx();
    return { domain: cleanDomain, enabled: true };
  } else {
    throw new Error(`No vHost found for domain "${cleanDomain}"`);
  }
}

/**
 * Remove a managed virtual host
 */
async function deleteVHost(domain) {
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    throw new Error(`Invalid domain name: "${cleanDomain}"`);
  }

  const activePath = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf`);
  const disabledPath = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf.disabled`);

  const filePath = fs.existsSync(activePath) ? activePath : (fs.existsSync(disabledPath) ? disabledPath : null);
  if (!filePath) {
    throw new Error(`Virtual host for domain "${cleanDomain}" does not exist.`);
  }

  // Verify signature
  const header = fs.readFileSync(filePath, 'utf8').slice(0, 150);
  if (!header.includes(SIGNATURE_HEADER)) {
    throw new Error(`Refusing to delete unmanaged config file ${filePath}. Signature header missing.`);
  }

  // Backup file before deleting
  const backupFile = `${filePath}.rmbak`;
  fs.renameSync(filePath, backupFile);

  const testResult = await testNginxSyntax();
  if (!testResult.ok) {
    // Rollback
    fs.renameSync(backupFile, filePath);
    throw new Error(`Nginx syntax check failed upon deletion: ${testResult.stderr}`);
  }

  // Syntax ok, permanently unlink backup
  try {
    fs.unlinkSync(backupFile);
  } catch (_) {}

  await reloadNginx();
  return { success: true, domain: cleanDomain };
}

/**
 * Read raw config content of a managed virtual host
 */
function getVHostConfig(domain) {
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    throw new Error(`Invalid domain name: "${cleanDomain}"`);
  }

  const activePath = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf`);
  const disabledPath = path.join(NGINX_CONF_DIR, `nexus_vhost_${cleanDomain}.conf.disabled`);

  const filePath = fs.existsSync(activePath) ? activePath : (fs.existsSync(disabledPath) ? disabledPath : null);
  if (!filePath) {
    throw new Error(`Virtual host for domain "${cleanDomain}" does not exist.`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return {
    domain: cleanDomain,
    enabled: fs.existsSync(activePath),
    filePath,
    content
  };
}

/**
 * Parse metadata comments from a vHost configuration file
 */
function parseVHostMetadata(filePath, content) {
  const filename = path.basename(filePath);
  const isEnabled = filename.endsWith('.conf');
  
  // Extract domain from filename or header
  let domain = filename.replace(/^nexus_vhost_/, '').replace(/\.conf(\.disabled)?$/, '');
  
  const lines = content.split('\n').slice(0, 20);
  let type = 'proxy';
  let target = '';
  let bodySize = '0';
  let webSocket = true;
  let sse = true;
  let createdAt = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# Domain:')) {
      domain = trimmed.replace('# Domain:', '').trim();
    } else if (trimmed.startsWith('# Type:')) {
      type = trimmed.replace('# Type:', '').trim();
    } else if (trimmed.startsWith('# Target:')) {
      target = trimmed.replace('# Target:', '').trim();
    } else if (trimmed.startsWith('# BodySize:')) {
      bodySize = trimmed.replace('# BodySize:', '').trim();
    } else if (trimmed.startsWith('# WebSocket:')) {
      webSocket = trimmed.replace('# WebSocket:', '').trim() === 'true';
    } else if (trimmed.startsWith('# SSE:')) {
      sse = trimmed.replace('# SSE:', '').trim() === 'true';
    } else if (trimmed.startsWith('# GeneratedAt:')) {
      createdAt = trimmed.replace('# GeneratedAt:', '').trim();
    }
  }

  // Fallback parsing if metadata header was lost
  if (!target) {
    const proxyMatch = content.match(/proxy_pass\s+([^;]+);/);
    if (proxyMatch) {
      type = 'proxy';
      target = proxyMatch[1].trim();
    }
    const rootMatch = content.match(/root\s+([^;]+);/);
    if (rootMatch && !target) {
      type = 'static';
      target = rootMatch[1].trim();
    }
    const returnMatch = content.match(/return\s+(301|302)\s+([^;]+);/);
    if (returnMatch && !target) {
      type = 'redirect';
      target = returnMatch[2].replace(/\$request_uri/g, '').trim();
    }
  }

  // Check if SSL is enabled in config
  const hasSslInConfig = content.includes('listen 443 ssl') || content.includes('ssl_certificate');

  return {
    domain,
    enabled: isEnabled,
    type,
    target,
    bodySize,
    webSocket,
    sse,
    hasSslInConfig,
    createdAt,
    filename
  };
}

/**
 * Read and parse X509 certificates to return active SSL metadata
 */
function checkCertificates() {
  const certMap = {};
  const letsEncryptDir = '/etc/letsencrypt/live';

  if (!fs.existsSync(letsEncryptDir)) {
    return certMap;
  }

  try {
    const entries = fs.readdirSync(letsEncryptDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const certName = entry.name;
        const certPath = path.join(letsEncryptDir, certName, 'fullchain.pem');
        if (fs.existsSync(certPath)) {
          try {
            const certData = fs.readFileSync(certPath);
            const x509 = new crypto.X509Certificate(certData);
            
            const validTo = new Date(x509.validTo);
            const now = new Date();
            const daysRemaining = Math.max(0, Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            const isExpired = daysRemaining <= 0;

            // Extract SAN (Subject Alternative Names)
            const domains = [];
            if (x509.subject) {
              const cnMatch = x509.subject.match(/CN=([^/\n]+)/);
              if (cnMatch) domains.push(cnMatch[1]);
            }
            if (x509.subjectAltName) {
              const sans = x509.subjectAltName.split(',').map(s => s.trim().replace(/^DNS:/, ''));
              for (const san of sans) {
                if (san && !domains.includes(san)) domains.push(san);
              }
            }

            const certInfo = {
              certName,
              domains,
              validFrom: x509.validFrom,
              validTo: x509.validTo,
              daysRemaining,
              isExpired,
              certPath
            };

            for (const d of domains) {
              certMap[d.toLowerCase()] = certInfo;
            }
            certMap[certName.toLowerCase()] = certInfo;
          } catch (err) {
            // Ignore single corrupt certificate
          }
        }
      }
    }
  } catch (err) {
    console.error('[vHostEngine] Error scanning certificates:', err.message);
  }

  return certMap;
}

/**
 * List all managed virtual hosts with status and SSL metadata
 */
function listVHosts() {
  if (!fs.existsSync(NGINX_CONF_DIR)) {
    return [];
  }

  const certMap = checkCertificates();
  const vhosts = [];

  try {
    const files = fs.readdirSync(NGINX_CONF_DIR);

    for (const file of files) {
      if (!file.startsWith('nexus_vhost_')) continue;
      if (!file.endsWith('.conf') && !file.endsWith('.conf.disabled')) continue;

      const fullPath = path.join(NGINX_CONF_DIR, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Must contain signature header
        if (!content.includes(SIGNATURE_HEADER)) {
          continue;
        }

        const meta = parseVHostMetadata(fullPath, content);
        const sslInfo = certMap[meta.domain.toLowerCase()] || null;

        vhosts.push({
          ...meta,
          ssl: sslInfo ? {
            hasCertificate: true,
            daysRemaining: sslInfo.daysRemaining,
            validTo: sslInfo.validTo,
            isExpired: sslInfo.isExpired,
            domains: sslInfo.domains
          } : {
            hasCertificate: false,
            daysRemaining: 0,
            validTo: null,
            isExpired: false,
            domains: []
          }
        });
      } catch (err) {
        console.error(`[vHostEngine] Error reading vHost file ${file}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[vHostEngine] Error listing vhosts directory:', err.message);
  }

  return vhosts.sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * Preflight DNS A-record verification
 */
async function verifyDnsRecord(domain) {
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    return { valid: false, error: 'Invalid domain syntax' };
  }

  try {
    const addresses = await dns.resolve4(cleanDomain);
    const matches = addresses.includes(PUBLIC_IP);
    return {
      domain: cleanDomain,
      resolved: true,
      addresses,
      expectedIp: PUBLIC_IP,
      matches,
      warning: matches ? null : `Domain DNS resolves to [${addresses.join(', ')}], which does not match server IP ${PUBLIC_IP}. Let's Encrypt challenge may fail.`
    };
  } catch (err) {
    return {
      domain: cleanDomain,
      resolved: false,
      addresses: [],
      expectedIp: PUBLIC_IP,
      matches: false,
      warning: `DNS lookup failed (${err.code || err.message}). Domain does not appear to be pointing to this server yet.`
    };
  }
}

/**
 * Automated Certbot SSL Engine
 */
async function issueSslCertificate(domain, email, options = {}) {
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    throw new Error(`Invalid domain name: "${cleanDomain}"`);
  }

  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error(`A valid administrator email is required for Let's Encrypt registration.`);
  }

  // Pre-flight DNS check
  const dnsCheck = await verifyDnsRecord(cleanDomain);
  if (!dnsCheck.matches && !options.force) {
    const err = new Error(dnsCheck.warning || `DNS A record for ${cleanDomain} does not point to ${PUBLIC_IP}`);
    err.dnsCheck = dnsCheck;
    err.isDnsWarning = true;
    throw err;
  }

  // Execute certbot --nginx -d <domain> --non-interactive --agree-tos -m <email> --redirect
  const certbotArgs = [
    '--nginx',
    '-d', cleanDomain,
    '--non-interactive',
    '--agree-tos',
    '-m', cleanEmail,
    '--redirect'
  ];

  try {
    const { stdout, stderr } = await execFileAsync('certbot', certbotArgs, { timeout: 90000 });
    
    // Reload Nginx to ensure the new certificate is served
    await reloadNginx();

    return {
      success: true,
      domain: cleanDomain,
      output: stdout,
      message: `SSL certificate issued and activated successfully for ${cleanDomain}`
    };
  } catch (err) {
    const errorDetails = err.stderr || err.stdout || err.message;
    throw new Error(`Certbot issuance failed for ${cleanDomain}:\n${errorDetails}`);
  }
}

module.exports = {
  isValidDomain,
  renderVHostTemplate,
  createOrUpdateVHost,
  toggleVHost,
  deleteVHost,
  getVHostConfig,
  listVHosts,
  checkCertificates,
  verifyDnsRecord,
  issueSslCertificate,
  testNginxSyntax,
  reloadNginx,
  SIGNATURE_HEADER,
  NGINX_CONF_DIR,
  TMP_STAGE_FILE,
  PUBLIC_IP,
  DOMAIN_REGEX
};
