const { exec } = require('node:child_process');
const fs = require('node:fs');
const osAdapter = require('./osAdapter');

/**
 * Parses UFW status numbered output into normalized rules
 */
function getUfwStatus() {
  return new Promise((resolve) => {
    exec('ufw status numbered 2>/dev/null', (err, stdout) => {
      if (err || !stdout) {
        return resolve({ active: false, type: 'ufw', name: 'Uncomplicated Firewall (UFW)', rules: [] });
      }
      const lines = stdout.split('\n');
      const active = lines.some(l => l.toLowerCase().includes('status: active'));
      const rules = [];

      for (const line of lines) {
        const match = line.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW\s+IN|DENY\s+IN|ALLOW|DENY|REJECT)\s+(.*)$/i);
        if (match) {
          rules.push({
            num: parseInt(match[1], 10),
            to: match[2].trim(),
            action: match[3].trim(),
            from: match[4].trim()
          });
        }
      }

      resolve({ active, type: 'ufw', name: 'Uncomplicated Firewall (UFW)', rules });
    });
  });
}

/**
 * Parses firewalld --list-all output into normalized rules
 */
function parseFirewalldList(stdout) {
  const rules = [];
  let ruleNum = 1;
  const lines = stdout.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('services:')) {
      const svcs = trimmed.replace('services:', '').trim().split(/\s+/).filter(Boolean);
      for (const s of svcs) {
        rules.push({
          num: ruleNum++,
          to: `${s} (service)`,
          action: 'ALLOW',
          from: 'Anywhere'
        });
      }
    } else if (trimmed.startsWith('ports:')) {
      const ports = trimmed.replace('ports:', '').trim().split(/\s+/).filter(Boolean);
      for (const p of ports) {
        rules.push({
          num: ruleNum++,
          to: p,
          action: 'ALLOW',
          from: 'Anywhere'
        });
      }
    } else if (trimmed.startsWith('rule ') || trimmed.startsWith('rich rules:')) {
      const ruleText = trimmed.replace(/^rich rules:\s*/, '');
      if (ruleText.startsWith('rule')) {
        const portMatch = ruleText.match(/port\s+port="([^"]+)"\s+protocol="([^"]+)"/);
        const srcMatch = ruleText.match(/source\s+address="([^"]+)"/);
        const actionMatch = ruleText.match(/(accept|reject|drop)/i);
        rules.push({
          num: ruleNum++,
          to: portMatch ? `${portMatch[1]}/${portMatch[2]}` : 'traffic',
          action: actionMatch ? actionMatch[1].toUpperCase() : 'ALLOW',
          from: srcMatch ? srcMatch[1] : 'Anywhere'
        });
      }
    }
  }

  return rules;
}

/**
 * Queries firewalld daemon on RHEL / AlmaLinux / CentOS
 */
function getFirewalldStatus() {
  return new Promise((resolve) => {
    exec('firewall-cmd --state 2>/dev/null', (stateErr, stateOut) => {
      const active = !stateErr && stateOut && stateOut.trim() === 'running';
      if (!active) {
        return resolve({ active: false, type: 'firewalld', name: 'firewalld (Dynamic Firewall)', rules: [] });
      }

      exec('firewall-cmd --list-all 2>/dev/null', (listErr, listOut) => {
        if (listErr || !listOut) {
          return resolve({ active: true, type: 'firewalld', name: 'firewalld (Dynamic Firewall)', rules: [] });
        }
        const rules = parseFirewalldList(listOut);
        resolve({ active: true, type: 'firewalld', name: 'firewalld (Dynamic Firewall)', rules });
      });
    });
  });
}

/**
 * Universal Firewall Adapter: Chooses between UFW and Firewalld based on OS & availability
 */
async function getFirewallStatus() {
  if (osAdapter.OS_FAMILY === 'rhel' || osAdapter.isFirewalldAvailable()) {
    const fw = await getFirewalldStatus();
    if (fw.active || !osAdapter.isUfwAvailable()) {
      return fw;
    }
  }

  // Debian/Ubuntu default or fallback
  const ufw = await getUfwStatus();
  if (ufw.active || !osAdapter.isFirewalldAvailable()) {
    return ufw;
  }

  return await getFirewalldStatus();
}

function getListeningPorts() {
  return new Promise((resolve) => {
    exec('ss -tulpn', (err, stdout) => {
      if (err || !stdout) {
        return resolve([]);
      }
      const lines = stdout.split('\n');
      const ports = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 5) continue;

        const proto = parts[0];
        const localAddrPort = parts[4];
        
        let localAddr = '';
        let port = '';

        const lastColon = localAddrPort.lastIndexOf(':');
        if (lastColon !== -1) {
          localAddr = localAddrPort.slice(0, lastColon);
          port = localAddrPort.slice(lastColon + 1);
        } else {
          continue;
        }

        // Process info is in parts[6] or rest of line
        let processName = 'Unknown';
        let pid = '-';

        const restOfLine = parts.slice(5).join(' ');
        const procMatch = restOfLine.match(/users:\(\("([^"]+)",pid=(\d+)/);
        if (procMatch) {
          processName = procMatch[1];
          pid = procMatch[2];
        }

        // Handle IPv6 address formatting for display
        if (localAddr === '*' || localAddr === '0.0.0.0' || localAddr === '::' || localAddr === '[::]') {
          localAddr = '0.0.0.0 (All Interfaces)';
        }

        ports.push({
          port,
          proto,
          address: localAddr,
          process: processName,
          pid
        });
      }

      // Sort by port ascending
      ports.sort((a, b) => (parseInt(a.port, 10) || 0) - (parseInt(b.port, 10) || 0));
      resolve(ports);
    });
  });
}

function getFailedSshLogins() {
  return new Promise((resolve) => {
    // Query both ssh (Debian/Ubuntu) and sshd (RHEL/AlmaLinux) units
    exec('journalctl -u ssh -u sshd -n 300 --no-pager 2>/dev/null', (err, stdout) => {
      let logData = stdout;

      if (!logData || logData.trim() === '') {
        // Fallback to static log files if journalctl returned nothing
        try {
          if (fs.existsSync('/var/log/secure')) {
            // RHEL/CentOS
            logData = fs.readFileSync('/var/log/secure', 'utf8').split('\n').slice(-300).join('\n');
          } else if (fs.existsSync('/var/log/auth.log')) {
            // Debian/Ubuntu
            logData = fs.readFileSync('/var/log/auth.log', 'utf8').split('\n').slice(-300).join('\n');
          }
        } catch {}
      }

      if (!logData) {
        return resolve({ totalCount: 0, recentAttempts: [], topAttackers: [] });
      }

      const lines = logData.split('\n');
      const attempts = [];
      const ipCounts = {};

      for (const line of lines) {
        // Pattern 1: Invalid user <user> from <ip> port <port>
        const invalidMatch = line.match(/^(\w+\s+\d+\s+[\d:]+).*Invalid user\s+(.*?)\s+from\s+([\d.]+)\s+port\s+(\d+)/);
        if (invalidMatch) {
          const user = invalidMatch[2].trim() || '(blank)';
          const ip = invalidMatch[3];
          attempts.push({
            timestamp: invalidMatch[1],
            user,
            ip,
            port: invalidMatch[4],
            reason: 'Invalid User'
          });
          ipCounts[ip] = (ipCounts[ip] || 0) + 1;
          continue;
        }

        // Pattern 2: Failed password for [invalid user] <user> from <ip> port <port>
        const failPassMatch = line.match(/^(\w+\s+\d+\s+[\d:]+).*Failed password for\s+(?:invalid user\s+)?(.*?)\s+from\s+([\d.]+)\s+port\s+(\d+)/);
        if (failPassMatch) {
          const user = failPassMatch[2].trim();
          const ip = failPassMatch[3];
          attempts.push({
            timestamp: failPassMatch[1],
            user,
            ip,
            port: failPassMatch[4],
            reason: 'Failed Password'
          });
          ipCounts[ip] = (ipCounts[ip] || 0) + 1;
          continue;
        }

        // Pattern 3: Connection closed by invalid user <user> <ip>
        const closedMatch = line.match(/^(\w+\s+\d+\s+[\d:]+).*Connection closed by invalid user\s+(.*?)\s+([\d.]+)\s+port\s+(\d+)/);
        if (closedMatch) {
          const user = closedMatch[2].trim() || '(blank)';
          const ip = closedMatch[3];
          attempts.push({
            timestamp: closedMatch[1],
            user,
            ip,
            port: closedMatch[4],
            reason: 'Closed (Invalid User)'
          });
          ipCounts[ip] = (ipCounts[ip] || 0) + 1;
        }
      }

      const topAttackers = Object.entries(ipCounts)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Latest first
      attempts.reverse();

      resolve({
        totalCount: attempts.length,
        recentAttempts: attempts.slice(0, 20),
        topAttackers
      });
    });
  });
}

async function getSecurityOverview() {
  const [firewall, ports, sshFails] = await Promise.all([
    getFirewallStatus(),
    getListeningPorts(),
    getFailedSshLogins()
  ]);

  return {
    ufw: firewall, // Backwards compatible with existing UFW expectations
    firewall,      // OS-agnostic property
    ports,
    sshFails
  };
}

module.exports = {
  getUfwStatus,
  getFirewalldStatus,
  getFirewallStatus,
  parseFirewalldList,
  getListeningPorts,
  getFailedSshLogins,
  getSecurityOverview
};
