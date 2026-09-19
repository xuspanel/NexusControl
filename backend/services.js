const { exec, execFile } = require('node:child_process');

const MANAGED_SERVICES = [
  { id: 'ssh', name: 'OpenSSH Server', unit: 'ssh.service' },
  { id: 'nginx', name: 'Nginx Web Server', unit: 'nginx.service' },
  { id: 'docker', name: 'Docker Engine', unit: 'docker.service' },
  { id: 'ufw', name: 'UFW Firewall', unit: 'ufw.service' },
  { id: 'cron', name: 'Cron Daemon', unit: 'cron.service' },
  { id: 'postgresql', name: 'PostgreSQL Database', unit: 'postgresql.service' },
  { id: 'redis-server', name: 'Redis Cache', unit: 'redis-server.service' },
  { id: 'nexuscontrol', name: 'NexusControl VPS Dashboard', unit: 'nexuscontrol.service' }
];

function getServiceDetails(unit) {
  return new Promise((resolve) => {
    exec(`systemctl show ${unit} --property=ActiveState,SubState,LoadState,Description,MainPID`, (err, stdout) => {
      if (err || !stdout) {
        return resolve({
          unit,
          activeState: 'inactive',
          subState: 'unknown',
          loadState: 'not-found',
          mainPid: 0
        });
      }

      const lines = stdout.trim().split('\n');
      const props = {};
      for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1) {
          props[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
        }
      }

      resolve({
        unit,
        activeState: props.ActiveState || 'inactive',
        subState: props.SubState || 'unknown',
        loadState: props.LoadState || 'loaded',
        mainPid: parseInt(props.MainPID, 10) || 0,
        description: props.Description || ''
      });
    });
  });
}

async function getAllServices() {
  const results = await Promise.all(
    MANAGED_SERVICES.map(async (svc) => {
      const details = await getServiceDetails(svc.unit);
      return {
        id: svc.id,
        name: svc.name,
        unit: svc.unit,
        ...details
      };
    })
  );
  return results;
}

function manageService(serviceId, action) {
  return new Promise((resolve, reject) => {
    if (typeof serviceId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(serviceId)) {
      return reject(new Error('Invalid service identifier format. Alphanumeric, underscores, and hyphens only.'));
    }

    const svc = MANAGED_SERVICES.find(s => s.id === serviceId || s.unit === serviceId);
    if (!svc) {
      return reject(new Error(`Service '${serviceId}' is not in the managed supervisor list.`));
    }

    if (!['start', 'stop', 'restart', 'reload'].includes(action)) {
      return reject(new Error(`Invalid action '${action}'. Allowed: start, stop, restart, reload.`));
    }

    // Never allow stopping nexuscontrol via its own API to prevent accidental lockouts
    if (svc.id === 'nexuscontrol' && action === 'stop') {
      return reject(new Error('Cannot stop NexusControl dashboard service via dashboard.'));
    }

    execFile('systemctl', [action, svc.unit], (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr.trim() || err.message));
      }
      resolve({ success: true, message: `Service ${svc.name} ${action}ed successfully.` });
    });
  });
}

// Kill process
function dispatchProcessSignal(pid, signal = 'SIGTERM') {
  return new Promise((resolve, reject) => {
    const numPid = Number(pid);
    if (!Number.isInteger(numPid) || numPid <= 1) {
      return reject(new Error('Invalid PID. PID must be a positive integer greater than 1.'));
    }

    if (numPid === process.pid) {
      return reject(new Error('Cannot kill NexusControl backend daemon from process manager.'));
    }

    if (!['SIGTERM', 'SIGKILL'].includes(signal)) {
      return reject(new Error('Only SIGTERM and SIGKILL are permitted.'));
    }

    try {
      process.kill(numPid, signal);
      resolve({ success: true, message: `Sent ${signal} to process ${numPid}.` });
    } catch (err) {
      execFile('kill', ['-s', signal, numPid.toString()], (kErr, stdout, stderr) => {
        if (kErr) {
          return reject(new Error(stderr.trim() || kErr.message));
        }
        resolve({ success: true, message: `Dispatched ${signal} to PID ${numPid}.` });
      });
    }
  });
}

// Journal logs reader
function getJournalLogs(options = {}) {
  const { lines = 100, level = 'all', search = '', unit = '' } = options;
  const numLines = Math.min(Math.max(10, parseInt(lines, 10) || 100), 500);

  let cmd = `journalctl -n ${numLines} --no-pager -o short-iso`;

  if (level === 'error') {
    cmd += ' -p err';
  } else if (level === 'warn') {
    cmd += ' -p warning';
  } else if (level === 'info') {
    cmd += ' -p info';
  }

  if (unit) {
    const cleanUnit = unit.replace(/[^a-zA-Z0-9_.-]/g, '');
    cmd += ` -u ${cleanUnit}`;
  }

  if (search) {
    const cleanSearch = search.replace(/['"\\]/g, '');
    cmd += ` -g "${cleanSearch}"`;
  }

  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return resolve([]);
      }
      const rawLines = (stdout || '').trim().split('\n');
      const logEntries = [];

      for (const l of rawLines) {
        if (!l) continue;
        // Parse ISO timestamp and line
        const match = l.match(/^(\S+)\s+(\S+)\s+(.*?):\s*(.*)$/);
        if (match) {
          let detectedLevel = 'INFO';
          const lower = l.toLowerCase();
          if (lower.includes('error') || lower.includes('fail') || lower.includes('fatal') || lower.includes('crit')) {
            detectedLevel = 'ERROR';
          } else if (lower.includes('warn')) {
            detectedLevel = 'WARN';
          }

          logEntries.push({
            timestamp: match[1],
            host: match[2],
            unit: match[3],
            message: match[4],
            level: detectedLevel,
            raw: l
          });
        } else {
          logEntries.push({
            timestamp: new Date().toISOString(),
            host: 'system',
            unit: 'kernel',
            message: l,
            level: 'INFO',
            raw: l
          });
        }
      }

      resolve(logEntries);
    });
  });
}

module.exports = {
  MANAGED_SERVICES,
  getAllServices,
  manageService,
  dispatchProcessSignal,
  getJournalLogs
};
