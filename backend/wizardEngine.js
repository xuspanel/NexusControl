const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const util = require('node:util');
const { detectPackageManager } = require('./osUpdates');

const execFileAsync = util.promisify(execFile);

// Regex to validate safe package names
const SAFE_PKG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-+_:]*$/;

/**
 * Registry of major heavy tools to analyze
 */
const MAJOR_TOOLS = [
  {
    id: 'apache',
    name: 'Apache HTTP Server',
    category: 'Web Server',
    binaries: ['apache2', 'httpd'],
    standardPaths: ['/usr/sbin/apache2', '/usr/sbin/httpd', '/usr/bin/apache2', '/usr/bin/httpd'],
    services: ['apache2', 'httpd'],
    packages: ['apache2', 'apache2-bin', 'apache2-utils', 'apache2-data', 'httpd'],
    description: 'Traditional open-source HTTP web server'
  },
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    category: 'Web Server',
    binaries: ['nginx'],
    standardPaths: ['/usr/sbin/nginx', '/usr/bin/nginx'],
    services: ['nginx'],
    packages: ['nginx', 'nginx-common', 'nginx-core'],
    description: 'High-performance reverse proxy & web server (NexusControl Primary)'
  },
  {
    id: 'caddy',
    name: 'Caddy Web Server',
    category: 'Web Server',
    binaries: ['caddy'],
    standardPaths: ['/usr/bin/caddy'],
    services: ['caddy'],
    packages: ['caddy'],
    description: 'Automated HTTPS reverse proxy web server'
  },
  {
    id: 'lighttpd',
    name: 'Lighttpd Web Server',
    category: 'Web Server',
    binaries: ['lighttpd'],
    standardPaths: ['/usr/sbin/lighttpd'],
    services: ['lighttpd'],
    packages: ['lighttpd'],
    description: 'Lightweight footprint HTTP daemon'
  },
  {
    id: 'php',
    name: 'PHP FastCGI Engine',
    category: 'Runtime',
    binaries: ['php', 'php-fpm'],
    standardPaths: ['/usr/bin/php', '/usr/sbin/php-fpm'],
    services: ['php8.1-fpm', 'php8.2-fpm', 'php8.3-fpm', 'php-fpm'],
    packages: ['php', 'php-fpm', 'php-common'],
    description: 'Server-side Hypertext Preprocessor script runtime'
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB Engine',
    category: 'Database',
    binaries: ['mysqld', 'mariadbd', 'mysql'],
    standardPaths: ['/usr/sbin/mysqld', '/usr/sbin/mariadbd', '/usr/bin/mysql'],
    services: ['mysql', 'mariadb', 'mysqld'],
    packages: ['mysql-server', 'mariadb-server', 'mysql-client', 'mariadb-client'],
    description: 'Relational SQL database server engine'
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL Database',
    category: 'Database',
    binaries: ['postgres', 'psql'],
    standardPaths: ['/usr/lib/postgresql', '/usr/bin/psql'],
    services: ['postgresql'],
    packages: ['postgresql', 'postgresql-client'],
    description: 'Advanced object-relational SQL database engine'
  },
  {
    id: 'redis',
    name: 'Redis In-Memory Cache',
    category: 'Cache & Store',
    binaries: ['redis-server', 'redis-cli'],
    standardPaths: ['/usr/bin/redis-server', '/usr/bin/redis-cli'],
    services: ['redis', 'redis-server'],
    packages: ['redis', 'redis-server', 'redis-tools'],
    description: 'Ultra-fast in-memory key-value data structure store'
  },
  {
    id: 'memcached',
    name: 'Memcached Daemon',
    category: 'Cache',
    binaries: ['memcached'],
    standardPaths: ['/usr/bin/memcached'],
    services: ['memcached'],
    packages: ['memcached'],
    description: 'High-performance distributed memory object caching system'
  },
  {
    id: 'mongodb',
    name: 'MongoDB Document Database',
    category: 'Database',
    binaries: ['mongod', 'mongosh'],
    standardPaths: ['/usr/bin/mongod'],
    services: ['mongod', 'mongodb'],
    packages: ['mongodb-org', 'mongodb'],
    description: 'NoSQL document-oriented distributed database'
  },
  {
    id: 'docker',
    name: 'Docker Engine & Runtime',
    category: 'Containers',
    binaries: ['docker', 'dockerd'],
    standardPaths: ['/usr/bin/docker', '/usr/bin/dockerd'],
    services: ['docker'],
    packages: ['docker.io', 'docker-ce', 'containerd'],
    description: 'Container orchestration platform and daemon'
  },
  {
    id: 'postfix',
    name: 'Postfix Mail Daemon',
    category: 'Mail Server',
    binaries: ['postfix'],
    standardPaths: ['/usr/sbin/postfix'],
    services: ['postfix'],
    packages: ['postfix'],
    description: 'Local SMTP mail transfer agent daemon'
  },
  {
    id: 'exim4',
    name: 'Exim4 Mail Transfer Agent',
    category: 'Mail Server',
    binaries: ['exim4'],
    standardPaths: ['/usr/sbin/exim4'],
    services: ['exim4'],
    packages: ['exim4', 'exim4-base', 'exim4-daemon-light', 'exim4-config'],
    description: 'Default local mail spool and routing daemon'
  }
];

/**
 * Check if a specific service is actively running via systemctl
 */
async function checkServiceActive(serviceName) {
  try {
    const { stdout } = await execFileAsync('systemctl', ['is-active', serviceName], {
      timeout: 2500
    });
    return stdout.trim() === 'active';
  } catch (err) {
    // If output is 'inactive' or service not found, systemctl exits non-zero
    const output = (err.stdout || '').trim();
    return output === 'active';
  }
}

/**
 * Check if a tool is installed on the host
 */
function isToolInstalled(tool) {
  // 1. Check known binary paths
  for (const p of tool.standardPaths) {
    if (fs.existsSync(p)) return true;
  }
  // 2. Check general PATH
  for (const b of tool.binaries) {
    if (fs.existsSync(`/usr/bin/${b}`) || fs.existsSync(`/usr/sbin/${b}`) || fs.existsSync(`/bin/${b}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Scan for major tools and perform smart heuristic analysis
 */
async function scanMajorTools() {
  const scannedTools = [];
  let isNginxActive = false;

  // First pass: detect presence and active states
  for (const tool of MAJOR_TOOLS) {
    const installed = isToolInstalled(tool);
    if (!installed) continue;

    let active = false;
    let activeServiceName = null;

    for (const s of tool.services) {
      const isActive = await checkServiceActive(s);
      if (isActive) {
        active = true;
        activeServiceName = s;
        break;
      }
    }

    if (tool.id === 'nginx' && active) {
      isNginxActive = true;
    }

    scannedTools.push({
      id: tool.id,
      name: tool.name,
      category: tool.category,
      description: tool.description,
      installed: true,
      active,
      serviceName: activeServiceName || tool.services[0],
      packagesToRemove: tool.packages
    });
  }

  // Second pass: apply smart heuristics
  return scannedTools.map(tool => {
    let recommendation = 'KEEP';
    let reason = 'Service is running normally.';
    let severity = 'low'; // 'low' | 'medium' | 'high'

    if (tool.active) {
      recommendation = 'KEEP';
      if (tool.id === 'nginx') {
        reason = 'Primary active reverse proxy and web server for NexusControl.';
      } else if (tool.id === 'docker') {
        reason = 'Active container runtime managing live services.';
      } else {
        reason = `Active daemon in regular operation (${tool.serviceName}).`;
      }
    } else {
      // Tool is INSTALLED but INACTIVE
      if (tool.id === 'apache') {
        recommendation = 'PURGE';
        severity = 'high';
        reason = isNginxActive
          ? 'Nginx is active as primary web server; Apache is dormant, conflicting, and wasting disk space.'
          : 'Apache web server is installed but inactive. Remove to reclaim disk space.';
      } else if (tool.id === 'caddy' || tool.id === 'lighttpd') {
        recommendation = 'PURGE';
        severity = 'high';
        reason = 'Secondary web server is inactive while Nginx manages traffic.';
      } else if (tool.id === 'postfix' || tool.id === 'exim4') {
        recommendation = 'PURGE';
        severity = 'medium';
        reason = 'Local mail daemon is dormant; NexusControl dispatches notification alerts via SMTP directly.';
      } else if (['mysql', 'postgresql', 'mongodb'].includes(tool.id)) {
        recommendation = 'REVIEW';
        severity = 'medium';
        reason = 'Database server engine is installed but service is dead/disabled. Check if leftover databases exist.';
      } else if (['redis', 'memcached'].includes(tool.id)) {
        recommendation = 'REVIEW';
        severity = 'low';
        reason = 'In-memory cache daemon is inactive and consuming filesystem storage.';
      } else if (tool.id === 'docker') {
        recommendation = 'REVIEW';
        severity = 'medium';
        reason = 'Docker is installed but the daemon is currently stopped.';
      } else if (tool.id === 'php') {
        recommendation = 'REVIEW';
        severity = 'low';
        reason = 'PHP FastCGI is installed but not actively running as a daemon.';
      } else {
        recommendation = 'REVIEW';
        severity = 'low';
        reason = 'Service is installed but not currently running.';
      }
    }

    return {
      ...tool,
      recommendation,
      severity,
      reason
    };
  });
}

/**
 * Scan for orphaned packages no longer required by the OS
 */
async function scanOrphanedPackages() {
  const manager = detectPackageManager();
  const orphanedPackages = [];
  let estimatedSpaceFreed = '0 MB';
  let rawSummary = 'No orphaned packages detected.';

  if (manager === 'apt') {
    try {
      const { stdout } = await execFileAsync('apt-get', ['-s', 'autoremove'], {
        timeout: 20000,
        env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
      });

      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Remv ')) {
          const match = trimmed.match(/^Remv\s+([^\s]+)(?:\s+\[([^\]]+)\])?/);
          if (match) {
            orphanedPackages.push({
              name: match[1],
              version: match[2] || ''
            });
          }
        }
      }

      // Extract space freed summary if available
      const spaceMatch = stdout.match(/After this operation,\s+([\d.,]+\s*[kMGTP]?B)\s+(?:of\s+)?disk space will be freed/i);
      if (spaceMatch) {
        estimatedSpaceFreed = spaceMatch[1];
      } else if (orphanedPackages.length > 0) {
        estimatedSpaceFreed = `~${(orphanedPackages.length * 4.2).toFixed(1)} MB`;
      }

      rawSummary = `${orphanedPackages.length} package(s) eligible for autoremove.`;
    } catch (err) {
      console.warn('[Wizard] Error scanning apt autoremove:', err.message);
    }
  } else if (manager === 'dnf') {
    try {
      const { stdout } = await execFileAsync('dnf', ['repoquery', '--unneeded', '-q'], {
        timeout: 25000
      });
      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          orphanedPackages.push({
            name: trimmed,
            version: ''
          });
        }
      }
      if (orphanedPackages.length > 0) {
        estimatedSpaceFreed = `~${(orphanedPackages.length * 5.0).toFixed(1)} MB`;
      }
      rawSummary = `${orphanedPackages.length} unneeded package(s) detected.`;
    } catch (err) {
      console.warn('[Wizard] Error scanning dnf repoquery:', err.message);
    }
  }

  return {
    count: orphanedPackages.length,
    packages: orphanedPackages,
    estimatedSpaceFreed,
    rawSummary
  };
}

/**
 * Execute deep purge with real-time SSE streaming output
 * @param {Object} options
 * @param {string[]} [options.tools] Tool IDs to purge
 * @param {string[]} [options.packages] Direct package names to purge
 * @param {boolean} [options.autoremove] Whether to run autoremove
 * @param {Object} req Express request
 * @param {Object} res Express response
 */
function streamDeepPurge({ tools = [], packages = [], autoremove = false }, req, res) {
  const manager = detectPackageManager();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  if (res.flushHeaders) res.flushHeaders();

  const sendLine = (line) => {
    if (res.writableEnded) return;
    res.write(`data: ${line}\n\n`);
  };

  const sendRawOutput = (chunk) => {
    if (res.writableEnded) return;
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.length > 0) {
        res.write(`data: ${line}\n\n`);
      }
    }
  };

  // Collect target packages to purge
  const targetPackages = new Set();

  // Add packages from tool IDs
  const toolIds = Array.isArray(tools) ? tools : tools.split(',').map(t => t.trim());
  for (const tId of toolIds) {
    const toolDef = MAJOR_TOOLS.find(t => t.id === tId);
    if (toolDef) {
      toolDef.packages.forEach(p => targetPackages.add(p));
    }
  }

  // Add individual packages if provided
  const directPkgs = Array.isArray(packages) ? packages : packages.split(',').map(p => p.trim());
  for (const p of directPkgs) {
    if (p && SAFE_PKG_REGEX.test(p)) {
      targetPackages.add(p);
    }
  }

  const pkgList = Array.from(targetPackages).filter(p => SAFE_PKG_REGEX.test(p));

  sendLine('🧙 NexusControl System Optimization Wizard — Deep Purge');
  sendLine(`⚡ Package Manager: ${manager.toUpperCase()}`);
  sendLine(`📦 Targets: ${pkgList.length > 0 ? pkgList.join(', ') : 'None'}`);
  sendLine(`🧹 Autoremove Orphaned Dependencies: ${autoremove ? 'YES' : 'NO'}`);
  sendLine('------------------------------------------------------------');

  if (pkgList.length === 0 && !autoremove) {
    sendLine('⚠️ No valid tools or autoremove actions selected. Nothing to purge.');
    sendLine('[DONE]');
    res.end();
    return;
  }

  // Build shell command
  let cmd = '';
  let args = [];

  if (manager === 'apt') {
    cmd = 'apt-get';
    if (pkgList.length > 0) {
      args = ['purge', '--auto-remove', '-y', ...pkgList];
    } else if (autoremove) {
      args = ['autoremove', '--purge', '-y'];
    }
  } else if (manager === 'dnf') {
    cmd = 'dnf';
    if (pkgList.length > 0) {
      args = ['remove', '-y', ...pkgList];
    } else if (autoremove) {
      args = ['autoremove', '-y'];
    }
  } else {
    sendLine('❌ ERROR: Unsupported OS package manager.');
    sendLine('[DONE]');
    res.end();
    return;
  }

  sendLine(`🚀 Spawning: ${cmd} ${args.join(' ')}`);

  const child = spawn(cmd, args, {
    env: {
      ...process.env,
      DEBIAN_FRONTEND: 'noninteractive',
      CI: 'true'
    }
  });

  child.stdout.on('data', sendRawOutput);
  child.stderr.on('data', sendRawOutput);

  child.on('error', (err) => {
    sendLine(`❌ Execution Error: ${err.message}`);
    sendLine('[DONE]');
    res.end();
  });

  child.on('close', (code) => {
    sendLine('------------------------------------------------------------');
    // If dnf and autoremove was also requested after package removal
    if (manager === 'dnf' && autoremove && pkgList.length > 0 && code === 0) {
      sendLine('🧹 Running secondary dnf autoremove -y...');
      const dnfAuto = spawn('dnf', ['autoremove', '-y'], { env: process.env });
      dnfAuto.stdout.on('data', sendRawOutput);
      dnfAuto.stderr.on('data', sendRawOutput);
      dnfAuto.on('close', (autoCode) => {
        sendLine('------------------------------------------------------------');
        sendLine(`✅ Deep purge complete (code ${autoCode}).`);
        sendLine('[DONE]');
        res.end();
      });
      return;
    }

    if (code === 0) {
      sendLine(`✅ Deep purge completed successfully (exit code ${code}).`);
    } else {
      sendLine(`⚠️ Process completed with exit code ${code}.`);
    }
    sendLine('[DONE]');
    res.end();
  });

  req.on('close', () => {
    if (!child.killed) {
      console.log('[Wizard] Client disconnected, sending SIGTERM to purge process...');
      child.kill('SIGTERM');
    }
  });
}

module.exports = {
  MAJOR_TOOLS,
  scanMajorTools,
  scanOrphanedPackages,
  streamDeepPurge
};
