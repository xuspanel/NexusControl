const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const util = require('node:util');

const execFileAsync = util.promisify(execFile);

// Regex to validate safe package names (prevent command injection)
const SAFE_PKG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-+_:]*$/;

/**
 * Detect underlying system package manager (dnf on RHEL/Alma, apt on Debian/Ubuntu)
 */
function detectPackageManager() {
  if (fs.existsSync('/usr/bin/dnf') || fs.existsSync('/bin/dnf')) {
    return 'dnf';
  }
  if (fs.existsSync('/usr/bin/apt-get') || fs.existsSync('/bin/apt-get')) {
    return 'apt';
  }
  return 'unknown';
}

/**
 * Scan for available OS package updates
 * @param {Object} options
 * @param {boolean} options.refresh Whether to refresh package index first
 */
async function getAvailableUpdates({ refresh = false } = {}) {
  const manager = detectPackageManager();
  const packages = [];

  if (manager === 'apt') {
    if (refresh) {
      try {
        await execFileAsync('apt-get', ['update', '-qq'], {
          timeout: 20000,
          env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
        });
      } catch (err) {
        console.warn('[OS Updates] apt-get update warning:', err.message);
      }
    }

    try {
      const { stdout } = await execFileAsync('apt-get', ['-s', 'upgrade'], {
        timeout: 25000,
        env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
      });

      // Parse lines starting with Inst
      // Format: Inst nginx [1.24.0-1] (1.24.0-2 Ubuntu:24.04/noble [amd64])
      // Format: Inst curl (8.5.0-2ubuntu10.1 Ubuntu:24.04/noble [amd64])
      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('Inst ')) continue;

        const match = trimmed.match(/^Inst\s+([^\s]+)(?:\s+\[([^\]]+)\])?\s+\(([^\s]+)(?:\s+([^\s]+))?(?:\s+\[([^\]]+)\])?\)/);
        if (match) {
          const name = match[1];
          const current = match[2] || 'installed';
          const latest = match[3];
          const repo = match[4] || 'apt';
          const arch = match[5] || '';
          packages.push({
            name,
            current,
            latest,
            arch,
            repo
          });
        }
      }
    } catch (err) {
      console.error('[OS Updates] Error running apt-get -s upgrade:', err);
      throw new Error(`Failed to scan apt updates: ${err.message}`);
    }

  } else if (manager === 'dnf') {
    if (refresh) {
      try {
        await execFileAsync('dnf', ['makecache', '--timer', '-q'], {
          timeout: 25000
        });
      } catch (err) {
        console.warn('[OS Updates] dnf makecache warning:', err.message);
      }
    }

    try {
      // Note: dnf check-update returns exit code 100 when updates are available!
      // Exit code 0 means system is up-to-date.
      let stdout = '';
      try {
        const res = await execFileAsync('dnf', ['check-update', '-q'], {
          timeout: 30000
        });
        stdout = res.stdout;
      } catch (err) {
        if (err.code === 100 && err.stdout) {
          stdout = err.stdout;
        } else if (err.code === 0) {
          stdout = err.stdout || '';
        } else {
          throw err;
        }
      }

      // Parse lines:
      // package.arch   version   repo
      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Last metadata') || trimmed.startsWith('Obsoleting') || trimmed.startsWith('Security:')) {
          continue;
        }

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 3) {
          const pkgArch = parts[0];
          const latest = parts[1];
          const repo = parts[2];
          const lastDot = pkgArch.lastIndexOf('.');
          let name = pkgArch;
          let arch = '';
          if (lastDot > 0) {
            name = pkgArch.substring(0, lastDot);
            arch = pkgArch.substring(lastDot + 1);
          }

          packages.push({
            name,
            current: 'installed',
            latest,
            arch,
            repo
          });
        }
      }
    } catch (err) {
      console.error('[OS Updates] Error running dnf check-update:', err);
      throw new Error(`Failed to scan dnf updates: ${err.message}`);
    }
  } else {
    throw new Error('Unsupported Linux distribution. Neither apt nor dnf was detected.');
  }

  return {
    success: true,
    manager,
    count: packages.length,
    packages
  };
}

/**
 * Real-time SSE streaming package upgrader
 * @param {Object} options
 * @param {string[]} [options.packages] List of package names to upgrade
 * @param {boolean} [options.all] Whether to upgrade all pending packages
 * @param {Object} req Express request
 * @param {Object} res Express response
 */
function streamPackageUpgrade({ packages = [], all = false }, req, res) {
  const manager = detectPackageManager();

  // Set SSE Headers
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

  if (manager === 'unknown') {
    sendLine('❌ ERROR: Unsupported OS package manager. Neither apt-get nor dnf detected.');
    sendLine('[DONE]');
    res.end();
    return;
  }

  let validPackages = [];
  if (!all) {
    validPackages = (Array.isArray(packages) ? packages : packages.split(','))
      .map(p => p.trim())
      .filter(p => p.length > 0 && SAFE_PKG_REGEX.test(p));

    if (validPackages.length === 0) {
      sendLine('⚠️ No valid package names provided for upgrade.');
      sendLine('[DONE]');
      res.end();
      return;
    }
  }

  sendLine(`🚀 Initiating OS package upgrade using ${manager.toUpperCase()}...`);
  sendLine(`📦 Target: ${all ? 'ALL upgradable system packages' : validPackages.join(', ')}`);
  sendLine('------------------------------------------------------------');

  let cmd = '';
  let args = [];

  if (manager === 'apt') {
    cmd = 'apt-get';
    if (all) {
      args = ['upgrade', '-y', '-o', 'Dpkg::Options::=--force-confdef', '-o', 'Dpkg::Options::=--force-confold'];
    } else {
      args = ['--only-upgrade', 'install', '-y', '-o', 'Dpkg::Options::=--force-confdef', '-o', 'Dpkg::Options::=--force-confold', ...validPackages];
    }
  } else if (manager === 'dnf') {
    cmd = 'dnf';
    if (all) {
      args = ['upgrade', '-y'];
    } else {
      args = ['upgrade', '-y', ...validPackages];
    }
  }

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
    if (code === 0) {
      sendLine(`✅ Package upgrade completed successfully (exit code ${code}).`);
    } else {
      sendLine(`⚠️ Package upgrade finished with exit code ${code}.`);
    }
    sendLine('[DONE]');
    res.end();
  });

  req.on('close', () => {
    if (!child.killed) {
      console.log('[OS Updates] Client disconnected, sending SIGTERM to package manager process...');
      child.kill('SIGTERM');
    }
  });
}

module.exports = {
  detectPackageManager,
  getAvailableUpdates,
  streamPackageUpgrade
};
