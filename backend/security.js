const { exec } = require('node:child_process');

function getUfwStatus() {
  return new Promise((resolve) => {
    exec('ufw status numbered', (err, stdout) => {
      if (err || !stdout) {
        return resolve({ active: false, rules: [] });
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

      resolve({ active, rules });
    });
  });
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

        const rawProcess = parts.slice(6).join(' ');
        const userMatch = rawProcess.match(/users:\(\("([^"]+)",pid=(\d+)/);
        if (userMatch) {
          processName = userMatch[1];
          pid = userMatch[2];
        } else {
          const simpleMatch = rawProcess.match(/"([^"]+)"/);
          if (simpleMatch) processName = simpleMatch[1];
        }

        ports.push({
          proto,
          address: localAddr,
          port: parseInt(port, 10) || port,
          pid,
          process: processName
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
    exec('journalctl -u ssh -n 300 --no-pager 2>/dev/null', (err, stdout) => {
      if (err || !stdout) {
        return resolve({ totalCount: 0, recentAttempts: [], topAttackers: [] });
      }

      const lines = stdout.split('\n');
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
  const [ufw, ports, sshFails] = await Promise.all([
    getUfwStatus(),
    getListeningPorts(),
    getFailedSshLogins()
  ]);

  return {
    ufw,
    ports,
    sshFails
  };
}

module.exports = {
  getUfwStatus,
  getListeningPorts,
  getFailedSshLogins,
  getSecurityOverview
};
