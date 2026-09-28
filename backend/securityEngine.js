const { exec } = require('child_process');
const util = require('util');
const geoip = require('geoip-lite');

const execAsync = util.promisify(exec);

/**
 * Auto-detect the host's active firewall system.
 * Returns 'firewalld' | 'ufw' | null
 */
async function detectFirewall() {
  // Check firewalld first
  try {
    const { stdout } = await execAsync('command -v firewall-cmd');
    if (stdout.trim()) {
      try {
        const { stdout: state } = await execAsync('firewall-cmd --state');
        if (state.trim() === 'running') {
          return 'firewalld';
        }
      } catch {
        // firewalld binary present but service may not be running
      }
    }
  } catch {
    // firewall-cmd not found
  }

  // Check ufw
  try {
    const { stdout } = await execAsync('command -v ufw');
    if (stdout.trim()) {
      return 'ufw';
    }
  } catch {
    // ufw not found
  }

  // Fallback check if firewalld binary exists even if stopped
  try {
    const { stdout } = await execAsync('command -v firewall-cmd');
    if (stdout.trim()) {
      return 'firewalld';
    }
  } catch {}

  return null;
}

/**
 * Check if fail2ban-client is installed and reachable.
 */
async function detectFail2ban() {
  try {
    const { stdout } = await execAsync('command -v fail2ban-client');
    if (!stdout.trim()) return false;
    await execAsync('fail2ban-client ping');
    return true;
  } catch {
    // Binary might be present but daemon not running, check if binary exists
    try {
      const { stdout } = await execAsync('command -v fail2ban-client');
      return Boolean(stdout.trim());
    } catch {
      return false;
    }
  }
}

/**
 * Retrieve firewall status and rules.
 */
async function getRules() {
  const fwType = await detectFirewall();
  if (!fwType) {
    return {
      isInstalled: false,
      type: null,
      status: 'inactive',
      rules: []
    };
  }

  if (fwType === 'firewalld') {
    let portOutput = '';
    let serviceOutput = '';
    let isRunning = false;

    try {
      const { stdout: state } = await execAsync('firewall-cmd --state');
      isRunning = state.trim() === 'running';
    } catch {}

    try {
      const { stdout } = await execAsync('firewall-cmd --list-ports');
      portOutput = stdout.trim();
    } catch {}

    try {
      const { stdout } = await execAsync('firewall-cmd --list-services');
      serviceOutput = stdout.trim();
    } catch {}

    const rules = [];

    // Parse ports like "80/tcp 443/tcp 51820/udp"
    if (portOutput) {
      const portEntries = portOutput.split(/\s+/).filter(Boolean);
      for (const entry of portEntries) {
        const [port, protocol] = entry.split('/');
        rules.push({
          port: port || entry,
          protocol: protocol ? protocol.toLowerCase() : 'tcp',
          action: 'ALLOW',
          from: 'Anywhere',
          ipv6: true,
          type: 'port',
          raw: entry
        });
      }
    }

    // Parse services like "ssh dhcpv6-client http https"
    if (serviceOutput) {
      const serviceEntries = serviceOutput.split(/\s+/).filter(Boolean);
      for (const svc of serviceEntries) {
        rules.push({
          port: svc,
          protocol: 'any',
          action: 'ALLOW',
          from: 'Anywhere',
          ipv6: true,
          type: 'service',
          raw: svc
        });
      }
    }

    return {
      isInstalled: true,
      type: 'firewalld',
      status: isRunning ? 'active' : 'inactive',
      rules
    };
  }

  // UFW
  if (fwType === 'ufw') {
    let statusOutput = '';
    try {
      const { stdout } = await execAsync('ufw status');
      statusOutput = stdout;
    } catch (err) {
      return {
        isInstalled: true,
        type: 'ufw',
        status: 'error',
        error: err.message,
        rules: []
      };
    }

    const isActive = /Status:\s*active/i.test(statusOutput);
    const rules = [];
    const lines = statusOutput.split('\n');

    let tableStarted = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') && trimmed.includes('------')) {
        tableStarted = true;
        continue;
      }
      if (!tableStarted || !trimmed) continue;

      // Example lines:
      // 22/tcp                     ALLOW       Anywhere
      // 5432                       ALLOW       132.145.70.205
      // 80/tcp (v6)                ALLOW       Anywhere (v6)
      // OpenSSH                    ALLOW       Anywhere
      const parts = trimmed.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const target = parts[0];
        const action = parts[1];
        const from = parts[2] || 'Anywhere';

        const isV6 = target.includes('(v6)') || from.includes('(v6)');
        const cleanTarget = target.replace(/\(v6\)/g, '').trim();

        let port = cleanTarget;
        let protocol = 'any';

        if (cleanTarget.includes('/')) {
          const [p, proto] = cleanTarget.split('/');
          port = p.trim();
          protocol = (proto || 'any').toLowerCase();
        }

        rules.push({
          port,
          protocol,
          action,
          from,
          ipv6: isV6,
          type: cleanTarget.includes('/') || /^\d+$/.test(port) ? 'port' : 'service',
          raw: trimmed
        });
      }
    }

    // Deduplicate rules by port+protocol+from for high-density UI rendering
    const uniqueRules = [];
    const seen = new Set();
    for (const r of rules) {
      const key = `${r.port}|${r.protocol}|${r.from}|${r.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRules.push(r);
      }
    }

    return {
      isInstalled: true,
      type: 'ufw',
      status: isActive ? 'active' : 'inactive',
      rules: uniqueRules
    };
  }

  return {
    isInstalled: false,
    type: null,
    status: 'inactive',
    rules: []
  };
}

/**
 * Open a port on the host firewall.
 * @param {number|string} port
 * @param {'tcp'|'udp'} protocol
 */
async function addRule(port, protocol = 'tcp') {
  const fwType = await detectFirewall();
  if (!fwType) {
    throw new Error('No supported firewall (ufw or firewalld) detected on this server.');
  }

  const cleanPort = String(port).trim();
  const cleanProto = String(protocol).toLowerCase().trim() || 'tcp';

  if (!cleanPort) {
    throw new Error('Port number is required.');
  }

  if (fwType === 'firewalld') {
    await execAsync(`firewall-cmd --add-port=${cleanPort}/${cleanProto} --permanent && firewall-cmd --reload`);
  } else if (fwType === 'ufw') {
    await execAsync(`ufw allow ${cleanPort}/${cleanProto}`);
  }

  return { success: true, port: cleanPort, protocol: cleanProto, firewall: fwType };
}

/**
 * Close/remove a port rule from the host firewall.
 * @param {number|string} port
 * @param {'tcp'|'udp'} protocol
 */
async function deleteRule(port, protocol = 'tcp') {
  const fwType = await detectFirewall();
  if (!fwType) {
    throw new Error('No supported firewall (ufw or firewalld) detected on this server.');
  }

  const cleanPort = String(port).trim();
  const cleanProto = String(protocol).toLowerCase().trim() || 'tcp';

  if (!cleanPort) {
    throw new Error('Port number is required.');
  }

  if (fwType === 'firewalld') {
    await execAsync(`firewall-cmd --remove-port=${cleanPort}/${cleanProto} --permanent && firewall-cmd --reload`);
  } else if (fwType === 'ufw') {
    await execAsync(`ufw delete allow ${cleanPort}/${cleanProto}`);
  }

  return { success: true, port: cleanPort, protocol: cleanProto, firewall: fwType };
}

/**
 * Retrieve all active Fail2ban jails.
 * Returns array of jail names, e.g. ['sshd', 'nginx-botsearch']
 */
async function getJails() {
  const isInstalled = await detectFail2ban();
  if (!isInstalled) {
    const error = new Error('Fail2ban is not installed or fail2ban-client is not found.');
    error.isInstalled = false;
    throw error;
  }

  try {
    const { stdout } = await execAsync('fail2ban-client status');
    // Output looks like:
    // Status
    // |- Number of jail:      1
    // `- Jail list:   sshd, nginx-botsearch
    const match = stdout.match(/Jail list:\s*(.*)/i);
    if (!match || !match[1]) {
      return [];
    }

    const jailNames = match[1]
      .split(',')
      .map(j => j.trim())
      .filter(Boolean);

    return jailNames;
  } catch (err) {
    const customErr = new Error(`Failed to query fail2ban-client: ${err.message}`);
    customErr.isInstalled = isInstalled;
    throw customErr;
  }
}

/**
 * Retrieve banned IPs for a specific jail and enrich each IP with GeoIP data.
 * @param {string} jail
 */
async function getBannedIps(jail) {
  if (!jail || typeof jail !== 'string') {
    throw new Error('Jail name is required.');
  }

  const cleanJail = jail.trim();
  const { stdout } = await execAsync(`fail2ban-client status ${cleanJail}`);

  // Parse lines:
  // `- Banned IP list:   198.51.100.1 203.0.113.5
  let ipList = [];
  const bannedMatch = stdout.match(/Banned IP list:\s*(.*)/i);
  if (bannedMatch && bannedMatch[1]) {
    ipList = bannedMatch[1].split(/\s+/).map(ip => ip.trim()).filter(Boolean);
  }

  // Parse total and currently banned counts if available
  let currentlyBanned = 0;
  let totalBanned = 0;
  const currentMatch = stdout.match(/Currently banned:\s*(\d+)/i);
  if (currentMatch) currentlyBanned = parseInt(currentMatch[1], 10) || 0;
  const totalMatch = stdout.match(/Total banned:\s*(\d+)/i);
  if (totalMatch) totalBanned = parseInt(totalMatch[1], 10) || 0;

  // Enrich with GeoIP data
  const enriched = ipList.map(ip => {
    const geo = geoip.lookup(ip);
    return {
      ip,
      jail: cleanJail,
      country: geo ? (geo.country || 'Unknown') : 'Unknown',
      countryCode: geo && geo.country ? geo.country.toUpperCase() : '??',
      city: geo ? (geo.city || 'Unknown') : 'Unknown',
      region: geo ? (geo.region || '') : '',
      timezone: geo ? (geo.timezone || '') : '',
      ll: geo && geo.ll ? geo.ll : null
    };
  });

  return {
    jail: cleanJail,
    currentlyBanned,
    totalBanned,
    banned: enriched
  };
}

/**
 * Unban an IP from a specific jail.
 * @param {string} jail
 * @param {string} ip
 */
async function unbanIp(jail, ip) {
  if (!jail || !ip) {
    throw new Error('Both jail name and IP address are required.');
  }
  const cleanJail = jail.trim();
  const cleanIp = ip.trim();

  await execAsync(`fail2ban-client set ${cleanJail} unbanip ${cleanIp}`);
  return { success: true, jail: cleanJail, ip: cleanIp };
}

/**
 * Manually ban an IP in a specific jail.
 * @param {string} jail
 * @param {string} ip
 */
async function banIp(jail, ip) {
  if (!jail || !ip) {
    throw new Error('Both jail name and IP address are required.');
  }
  const cleanJail = jail.trim();
  const cleanIp = ip.trim();

  await execAsync(`fail2ban-client set ${cleanJail} banip ${cleanIp}`);
  return { success: true, jail: cleanJail, ip: cleanIp };
}

module.exports = {
  detectFirewall,
  detectFail2ban,
  getRules,
  addRule,
  deleteRule,
  getJails,
  getBannedIps,
  unbanIp,
  banIp
};
