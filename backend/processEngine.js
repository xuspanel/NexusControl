const { exec, spawn } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = util.promisify(exec);
const APPS_BASE_DIR = '/opt/NexusControl/apps';
const SYSTEMD_DIR = '/etc/systemd/system';

/**
 * Validate that an app name contains only alphanumeric characters (letters and digits).
 * @param {string} name
 */
function validateAppName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('App name is required');
  }
  const clean = name.trim();
  if (!/^[a-zA-Z0-9]+$/.test(clean)) {
    throw new Error('App name must be alphanumeric only (letters and digits, no spaces or special characters)');
  }
  return clean;
}

/**
 * Helper to format seconds into human-readable uptime.
 * @param {number} totalSeconds
 */
function formatUptime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Provision a new systemd unit for a user application.
 * @param {string} rawName - Alphanumeric app identifier
 * @param {string} cmd - Command to execute (e.g., "node server.js")
 * @param {string} [rawCwd] - Working directory (defaults to /opt/NexusControl/apps/[name])
 * @param {Object|string} [envObj] - Environment variables object or raw string
 */
async function createApp(rawName, cmd, rawCwd, envObj) {
  const name = validateAppName(rawName);

  if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
    throw new Error('Execution command (cmd) is required');
  }
  const cleanCmd = cmd.trim();

  const appDir = path.join(APPS_BASE_DIR, name);
  const cwd = rawCwd && typeof rawCwd === 'string' && rawCwd.trim()
    ? path.resolve(rawCwd.trim())
    : appDir;

  // 1. Create working directory and app config directory if they don't exist
  await fs.promises.mkdir(appDir, { recursive: true });
  if (cwd !== appDir) {
    await fs.promises.mkdir(cwd, { recursive: true });
  }

  // 2. Format and write the .env variables
  let envFileContent = '';
  if (envObj && typeof envObj === 'object') {
    envFileContent = Object.entries(envObj)
      .filter(([k]) => Boolean(k && k.trim()))
      .map(([k, v]) => `${k.trim()}=${v != null ? String(v).replace(/\r?\n/g, '') : ''}`)
      .join('\n') + '\n';
  } else if (typeof envObj === 'string') {
    envFileContent = envObj.endsWith('\n') ? envObj : envObj + '\n';
  }

  const envPath = path.join(appDir, '.env');
  await fs.promises.writeFile(envPath, envFileContent, { mode: 0o600 });

  // 3. Generate the systemd service unit file
  const unitContent = `[Unit]
Description=NexusControl Managed App: ${name}
After=network.target

[Service]
Type=simple
WorkingDirectory=${cwd}
ExecStart=${cleanCmd}
EnvironmentFile=/opt/NexusControl/apps/${name}/.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

  const unitPath = path.join(SYSTEMD_DIR, `nc-app-${name}.service`);
  await fs.promises.writeFile(unitPath, unitContent, 'utf8');

  // 4. Reload systemd daemon and enable/start the service unit
  await execAsync(`systemctl daemon-reload && systemctl enable --now nc-app-${name}.service`);

  return {
    name,
    unit: `nc-app-${name}.service`,
    cmd: cleanCmd,
    cwd,
    envPath
  };
}

/**
 * Teardown and delete a managed app unit.
 * @param {string} rawName
 */
async function deleteApp(rawName) {
  const name = validateAppName(rawName);
  const unitName = `nc-app-${name}.service`;
  const unitPath = path.join(SYSTEMD_DIR, unitName);

  // 1. Stop and disable the service unit
  try {
    await execAsync(`systemctl disable --now ${unitName}`);
  } catch (err) {
    // Unit might already be stopped or non-existent, proceed with cleanup
  }

  // 2. Remove the systemd service file
  try {
    await fs.promises.unlink(unitPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // 3. Reload systemd daemon
  await execAsync('systemctl daemon-reload');

  return { success: true, name };
}

/**
 * Control an app's lifecycle: start, stop, restart.
 * @param {string} rawName
 * @param {'start'|'stop'|'restart'} action
 */
async function controlApp(rawName, action) {
  const name = validateAppName(rawName);
  const validActions = ['start', 'stop', 'restart', 'reload'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action "${action}". Allowed: ${validActions.join(', ')}`);
  }

  const unitName = `nc-app-${name}.service`;
  await execAsync(`systemctl ${action} ${unitName}`);

  return { success: true, name, action };
}

/**
 * Extract live process telemetry for a given app.
 * @param {string} rawName
 */
async function getAppStats(rawName) {
  const name = validateAppName(rawName);
  const unitName = `nc-app-${name}.service`;

  let activeState = 'inactive';
  let subState = 'dead';
  let mainPid = 0;
  let execStart = '';
  let workingDir = path.join(APPS_BASE_DIR, name);
  let description = `NexusControl Managed App: ${name}`;

  try {
    const { stdout } = await execAsync(
      `systemctl show ${unitName} -p ActiveState,SubState,MainPID,ExecStart,WorkingDirectory,Description`
    );
    const lines = stdout.split('\n');
    for (const line of lines) {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key === 'ActiveState') activeState = val;
        else if (key === 'SubState') subState = val;
        else if (key === 'MainPID') mainPid = parseInt(val, 10) || 0;
        else if (key === 'WorkingDirectory' && val) workingDir = val;
        else if (key === 'Description' && val) description = val;
        else if (key === 'ExecStart' && val) {
          // Parse path or argv from ExecStart string: argv[]=/usr/bin/node server.js
          const argvMatch = val.match(/argv\[\]=([^;]+)/);
          if (argvMatch && argvMatch[1]) {
            execStart = argvMatch[1].trim();
          } else {
            const pathMatch = val.match(/path=([^;]+)/);
            execStart = pathMatch ? pathMatch[1].trim() : val;
          }
        }
      }
    }
  } catch (err) {
    // If unit is unknown to systemctl, return default inactive stats
  }

  let cpu = 0;
  let ramPercent = 0;
  let ramMb = 0;
  let uptime = 0;

  if (mainPid > 0 && activeState === 'active') {
    try {
      const { stdout: psOut } = await execAsync(`ps -p ${mainPid} -o %cpu,%mem,rss,etimes --no-headers`);
      const parts = psOut.trim().split(/\s+/);
      if (parts.length >= 4) {
        cpu = parseFloat(parts[0]) || 0;
        ramPercent = parseFloat(parts[1]) || 0;
        const rssKb = parseInt(parts[2], 10) || 0;
        ramMb = Number((rssKb / 1024).toFixed(1));
        uptime = parseInt(parts[3], 10) || 0;
      }
    } catch {
      // Process might have terminated right after check
    }
  }

  const isRunning = activeState === 'active' && subState === 'running';
  const isFailed = activeState === 'failed' || subState === 'failed';
  const status = isRunning ? 'running' : (isFailed ? 'failed' : 'inactive');

  return {
    name,
    unit: unitName,
    description,
    status,
    activeState,
    subState,
    pid: mainPid,
    cpu,
    ramMb,
    ramPercent,
    uptime,
    uptimeFormatted: formatUptime(uptime),
    cwd: workingDir,
    cmd: execStart
  };
}

/**
 * Retrieve all managed applications matching the nc-app- prefix.
 */
async function getApps() {
  const appNames = new Set();

  // 1. Query systemctl for all units matching nc-app-
  try {
    const { stdout } = await execAsync('systemctl list-units --type=service --all --no-legend --no-pager');
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^nc-app-([a-zA-Z0-9]+)\.service/);
      if (match && match[1]) {
        appNames.add(match[1]);
      }
    }
  } catch (err) {
    // Fallback if list-units fails
  }

  // 2. Also inspect unit files in /etc/systemd/system/
  try {
    const files = await fs.promises.readdir(SYSTEMD_DIR);
    for (const file of files) {
      const match = file.match(/^nc-app-([a-zA-Z0-9]+)\.service$/);
      if (match && match[1]) {
        appNames.add(match[1]);
      }
    }
  } catch (err) {
    // Directory might be inaccessible or non-existent
  }

  // 3. Also check if any app directories exist in APPS_BASE_DIR
  try {
    const appDirs = await fs.promises.readdir(APPS_BASE_DIR);
    for (const dir of appDirs) {
      if (/^[a-zA-Z0-9]+$/.test(dir)) {
        const unitExists = fs.existsSync(path.join(SYSTEMD_DIR, `nc-app-${dir}.service`));
        if (unitExists) {
          appNames.add(dir);
        }
      }
    }
  } catch {
    // Ignore
  }

  // Collect stats for each app
  const appList = await Promise.all(
    Array.from(appNames).map(name => getAppStats(name))
  );

  return appList.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read the environment variables from the app's .env file.
 * @param {string} rawName
 */
async function getAppEnv(rawName) {
  const name = validateAppName(rawName);
  const envPath = path.join(APPS_BASE_DIR, name, '.env');

  try {
    const content = await fs.promises.readFile(envPath, 'utf8');
    const envObj = {};
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1);
        if (k) envObj[k] = v;
      }
    }
    return {
      raw: content,
      env: envObj,
      list: Object.entries(envObj).map(([key, value]) => ({ key, value }))
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { raw: '', env: {}, list: [] };
    }
    throw err;
  }
}

/**
 * Write environment variables to the app's .env file and restart the service.
 * @param {string} rawName
 * @param {Object|string} envData
 */
async function setAppEnv(rawName, envData) {
  const name = validateAppName(rawName);
  const appDir = path.join(APPS_BASE_DIR, name);
  await fs.promises.mkdir(appDir, { recursive: true });

  let content = '';
  if (envData && typeof envData === 'object' && !Array.isArray(envData)) {
    content = Object.entries(envData)
      .filter(([k]) => Boolean(k && k.trim()))
      .map(([k, v]) => `${k.trim()}=${v != null ? String(v).replace(/\r?\n/g, '') : ''}`)
      .join('\n') + '\n';
  } else if (Array.isArray(envData)) {
    content = envData
      .filter(item => item && item.key && item.key.trim())
      .map(item => `${item.key.trim()}=${item.value != null ? String(item.value).replace(/\r?\n/g, '') : ''}`)
      .join('\n') + '\n';
  } else if (typeof envData === 'string') {
    content = envData.endsWith('\n') ? envData : envData + '\n';
  }

  const envPath = path.join(appDir, '.env');
  await fs.promises.writeFile(envPath, content, { mode: 0o600 });

  // Restart the application service to apply new environment variables
  await execAsync(`systemctl restart nc-app-${name}.service`);

  return { success: true, name };
}

module.exports = {
  createApp,
  deleteApp,
  controlApp,
  getAppStats,
  getApps,
  getAppEnv,
  setAppEnv,
  formatUptime,
  validateAppName,
  APPS_BASE_DIR,
  SYSTEMD_DIR
};
