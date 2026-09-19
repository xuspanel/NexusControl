const fs = require('node:fs');
const { execSync, exec } = require('node:child_process');

/**
 * Enterprise OS Detection & Command Abstraction Engine
 * Parses /etc/os-release and standardizes OS metadata, command toolchains,
 * package managers, and service init systems across Linux distributions.
 */

let cachedParsedData = null;

function parseOsRelease(content) {
  const result = {
    id: 'unknown',
    idLike: '',
    version: '',
    versionId: '',
    name: 'Linux',
    prettyName: 'Linux',
    family: 'unknown',
    logo: ''
  };

  if (!content || typeof content !== 'string') {
    return result;
  }

  const lines = content.split('\n');
  const raw = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      raw[key] = val;
    }
  }

  result.raw = raw;
  result.id = (raw.ID || 'unknown').toLowerCase();
  result.idLike = (raw.ID_LIKE || '').toLowerCase();
  result.version = raw.VERSION || '';
  result.versionId = raw.VERSION_ID || '';
  result.name = raw.NAME || 'Linux';
  result.prettyName = raw.PRETTY_NAME || raw.NAME || 'Linux';
  result.logo = (raw.LOGO || '').toLowerCase();

  // Determine OS_FAMILY: 'debian' | 'rhel' | 'alpine' | 'arch' | 'unknown'
  const combined = `${result.id} ${result.idLike}`.toLowerCase();

  if (
    combined.includes('ubuntu') ||
    combined.includes('debian') ||
    result.id === 'ubuntu' ||
    result.id === 'debian' ||
    result.id === 'pop' ||
    result.id === 'linuxmint' ||
    result.id === 'kali'
  ) {
    result.family = 'debian';
  } else if (
    combined.includes('rhel') ||
    combined.includes('centos') ||
    combined.includes('fedora') ||
    result.id === 'rhel' ||
    result.id === 'almalinux' ||
    result.id === 'rocky' ||
    result.id === 'centos' ||
    result.id === 'fedora' ||
    result.id === 'amzn' ||
    result.id === 'ol'
  ) {
    result.family = 'rhel';
  } else if (result.id === 'alpine') {
    result.family = 'alpine';
  } else if (combined.includes('arch') || result.id === 'arch' || result.id === 'manjaro') {
    result.family = 'arch';
  } else {
    // Fallback detection via package managers if available
    try {
      if (fs.existsSync('/usr/bin/apt') || fs.existsSync('/usr/bin/dpkg')) {
        result.family = 'debian';
      } else if (fs.existsSync('/usr/bin/dnf') || fs.existsSync('/usr/bin/yum') || fs.existsSync('/usr/bin/rpm')) {
        result.family = 'rhel';
      } else if (fs.existsSync('/sbin/apk')) {
        result.family = 'alpine';
      } else if (fs.existsSync('/usr/bin/pacman')) {
        result.family = 'arch';
      }
    } catch {
      result.family = 'debian'; // Safe default
    }
  }

  return result;
}

function loadHostOsData() {
  if (cachedParsedData) {
    return cachedParsedData;
  }

  let content = '';
  try {
    if (fs.existsSync('/etc/os-release')) {
      content = fs.readFileSync('/etc/os-release', 'utf8');
    } else if (fs.existsSync('/usr/lib/os-release')) {
      content = fs.readFileSync('/usr/lib/os-release', 'utf8');
    }
  } catch (err) {
    console.warn('[OS-Adapter] Could not read /etc/os-release:', err.message);
  }

  cachedParsedData = parseOsRelease(content);
  return cachedParsedData;
}

// Initial detection
const hostOs = loadHostOsData();

const OS_ID = hostOs.id;
const OS_VERSION = hostOs.versionId || hostOs.version;
const OS_FAMILY = hostOs.family;
const OS_NAME = hostOs.name;
const OS_PRETTY_NAME = hostOs.prettyName;

/**
 * Check if systemd (systemctl) is installed and operational on this host
 */
function isSystemdAvailable() {
  try {
    // Check if systemctl binary exists
    if (!fs.existsSync('/bin/systemctl') && !fs.existsSync('/usr/bin/systemctl')) {
      return false;
    }
    // Check if systemd is the active init system
    if (fs.existsSync('/run/systemd/system')) {
      return true;
    }
    // Fallback check with fast execution
    execSync('systemctl is-system-running 2>/dev/null', { stdio: 'ignore', timeout: 1000 });
    return true;
  } catch {
    // Some containers run systemctl even if degraded or starting
    try {
      execSync('which systemctl 2>/dev/null', { stdio: 'ignore', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check if firewalld is installed and available
 */
function isFirewalldAvailable() {
  try {
    return fs.existsSync('/usr/bin/firewall-cmd') || fs.existsSync('/bin/firewall-cmd');
  } catch {
    return false;
  }
}

/**
 * Check if UFW is installed and available
 */
function isUfwAvailable() {
  try {
    return fs.existsSync('/usr/sbin/ufw') || fs.existsSync('/bin/ufw');
  } catch {
    return false;
  }
}

/**
 * Get comprehensive OS info dictionary
 */
function getOsInfo() {
  const current = loadHostOsData();
  return {
    osId: current.id,
    osVersion: current.versionId || current.version,
    osFamily: current.family,
    osName: current.name,
    osPrettyName: current.prettyName,
    systemd: isSystemdAvailable(),
    firewallEngine: isFirewalldAvailable() ? 'firewalld' : isUfwAvailable() ? 'ufw' : 'none'
  };
}

module.exports = {
  OS_ID,
  OS_VERSION,
  OS_FAMILY,
  OS_NAME,
  OS_PRETTY_NAME,
  parseOsRelease,
  isSystemdAvailable,
  isFirewalldAvailable,
  isUfwAvailable,
  getOsInfo
};
