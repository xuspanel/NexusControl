const fs = require('node:fs');
const os = require('node:os');
const { exec, execSync } = require('node:child_process');
const osAdapter = require('./osAdapter');

let prevCpu = null;
let prevNet = null;
let prevDisk = null;
let cachedPing = 0;
let cachedPublicIp = null;
let cachedPrivateIp = null;
let cachedCpuModel = null;
let cachedOsInfo = null;

// Initialize static host info once
function initStaticInfo() {
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    const prettyMatch = osRelease.match(/PRETTY_NAME="([^"]+)"/);
    cachedOsInfo = prettyMatch ? prettyMatch[1] : `${os.type()} ${os.release()}`;
  } catch {
    cachedOsInfo = `${os.type()} ${os.release()}`;
  }

  try {
    const lscpu = execSync('lscpu 2>/dev/null', { encoding: 'utf8' });
    const m = lscpu.match(/Model name:\s*(.+)/i);
    if (m && m[1].trim()) {
      cachedCpuModel = m[1].trim();
    }
  } catch {}

  if (!cachedCpuModel) {
    try {
      const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const modelMatch = cpuInfo.match(/model name\s*:\s*(.+)/i) || 
                         cpuInfo.match(/Hardware\s*:\s*(.+)/i);
      if (modelMatch) {
        cachedCpuModel = modelMatch[1].trim();
      } else {
        cachedCpuModel = 'ARM Neoverse-N1 @ 2.0GHz';
      }
    } catch {
      cachedCpuModel = 'ARM Neoverse-N1 @ 2.0GHz';
    }
  }

  // Detect private IP
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        cachedPrivateIp = net.address;
        break;
      }
    }
    if (cachedPrivateIp) break;
  }
}

// Background public IP resolver
function refreshPublicIp() {
  exec('curl -s -m 3 https://api.ipify.org || curl -s -m 3 ifconfig.me', (err, stdout) => {
    if (!err && stdout.trim()) {
      cachedPublicIp = stdout.trim();
    } else if (!cachedPublicIp) {
      cachedPublicIp = cachedPrivateIp || '127.0.0.1';
    }
  });
}

// Background ping tracker to 1.1.1.1
function refreshPing() {
  exec('ping -c 1 -W 2 1.1.1.1', (err, stdout) => {
    if (!err && stdout) {
      const match = stdout.match(/time=([\d.]+)\s*ms/);
      if (match) {
        cachedPing = parseFloat(match[1]);
      }
    }
  });
}

// Execute initial detection
initStaticInfo();
refreshPublicIp();
refreshPing();
setInterval(refreshPing, 15000).unref();
setInterval(refreshPublicIp, 300000).unref();

// Read /proc/stat for aggregate and per-core CPU usage
function getCPUStats() {
  const content = fs.readFileSync('/proc/stat', 'utf8');
  const lines = content.split('\n');
  const timestamp = Date.now();
  const cores = [];
  let aggregate = null;

  for (const line of lines) {
    if (!line.startsWith('cpu')) continue;
    const parts = line.trim().split(/\s+/);
    const name = parts[0];
    const user = parseFloat(parts[1]) || 0;
    const nice = parseFloat(parts[2]) || 0;
    const system = parseFloat(parts[3]) || 0;
    const idle = parseFloat(parts[4]) || 0;
    const iowait = parseFloat(parts[5]) || 0;
    const irq = parseFloat(parts[6]) || 0;
    const softirq = parseFloat(parts[7]) || 0;
    const steal = parseFloat(parts[8]) || 0;

    const idleTotal = idle + iowait;
    const nonIdle = user + nice + system + irq + softirq + steal;
    const total = idleTotal + nonIdle;

    const data = { name, idle: idleTotal, total, nonIdle };
    if (name === 'cpu') {
      aggregate = data;
    } else if (name.startsWith('cpu')) {
      const coreIdx = parseInt(name.replace('cpu', ''), 10);
      if (!isNaN(coreIdx)) {
        cores[coreIdx] = data;
      }
    }
  }

  let cpuUsage = 0;
  const perCoreUsage = [];

  if (prevCpu && aggregate) {
    const totalDelta = aggregate.total - prevCpu.aggregate.total;
    const idleDelta = aggregate.idle - prevCpu.aggregate.idle;
    if (totalDelta > 0) {
      cpuUsage = Math.max(0, Math.min(100, parseFloat((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1))));
    }

    for (let i = 0; i < cores.length; i++) {
      const cNow = cores[i];
      const cPrev = prevCpu.cores[i];
      if (cNow && cPrev) {
        const cTotalDelta = cNow.total - cPrev.total;
        const cIdleDelta = cNow.idle - cPrev.idle;
        if (cTotalDelta > 0) {
          const u = Math.max(0, Math.min(100, parseFloat((((cTotalDelta - cIdleDelta) / cTotalDelta) * 100).toFixed(1))));
          perCoreUsage.push(u);
        } else {
          perCoreUsage.push(0);
        }
      } else {
        perCoreUsage.push(0);
      }
    }
  } else {
    // Initial run
    cpuUsage = 0;
    for (let i = 0; i < cores.length; i++) perCoreUsage.push(0);
  }

  prevCpu = { aggregate, cores, timestamp };
  return { usage: cpuUsage, cores: perCoreUsage, coreCount: cores.length };
}

// Read /proc/meminfo for memory and swap stats
function getMemoryStats() {
  const content = fs.readFileSync('/proc/meminfo', 'utf8');
  const lines = content.split('\n');
  const values = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = parseInt(line.slice(colonIdx + 1).trim().split(/\s+/)[0], 10) * 1024; // convert kB to bytes
    values[key] = val;
  }

  const total = values['MemTotal'] || 0;
  const free = values['MemFree'] || 0;
  const available = values['MemAvailable'] || free;
  const buffers = values['Buffers'] || 0;
  const cached = (values['Cached'] || 0) + (values['SReclaimable'] || 0);
  const used = Math.max(0, total - available);
  const usedPct = total > 0 ? parseFloat(((used / total) * 100).toFixed(1)) : 0;

  const swapTotal = values['SwapTotal'] || 0;
  const swapFree = values['SwapFree'] || 0;
  const swapUsed = Math.max(0, swapTotal - swapFree);
  const swapPct = swapTotal > 0 ? parseFloat(((swapUsed / swapTotal) * 100).toFixed(1)) : 0;

  return {
    total,
    used,
    free,
    available,
    buffers,
    cached,
    usedPct,
    swapTotal,
    swapUsed,
    swapFree,
    swapPct
  };
}

// Read root filesystem and /proc/diskstats for IOPS & throughput
function getDiskStats() {
  let statfs = null;
  try {
    statfs = fs.statfsSync('/');
  } catch (err) {
    statfs = { bsize: 4096, blocks: 1, bfree: 1, bavail: 1, files: 1, ffree: 1 };
  }

  const totalBytes = statfs.blocks * statfs.bsize;
  const freeBytes = statfs.bavail * statfs.bsize;
  const usedBytes = Math.max(0, (statfs.blocks - statfs.bfree) * statfs.bsize);
  const usedPct = totalBytes > 0 ? parseFloat(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;

  const totalInodes = statfs.files;
  const freeInodes = statfs.ffree;
  const usedInodes = Math.max(0, totalInodes - freeInodes);
  const inodePct = totalInodes > 0 ? parseFloat(((usedInodes / totalInodes) * 100).toFixed(1)) : 0;

  let readIops = 0;
  let writeIops = 0;
  let readBytesSec = 0;
  let writeBytesSec = 0;

  try {
    const content = fs.readFileSync('/proc/diskstats', 'utf8');
    const lines = content.split('\n');
    let totalReads = 0;
    let totalSectorsRead = 0;
    let totalWrites = 0;
    let totalSectorsWritten = 0;

    for (const line of lines) {
      const p = line.trim().split(/\s+/);
      if (p.length < 14) continue;
      const devName = p[2];
      if (devName.startsWith('loop') || devName.startsWith('ram') || /^[a-z]+\d+$/.test(devName)) {
        continue;
      }
      totalReads += parseInt(p[3], 10) || 0;
      totalSectorsRead += parseInt(p[5], 10) || 0;
      totalWrites += parseInt(p[7], 10) || 0;
      totalSectorsWritten += parseInt(p[9], 10) || 0;
    }

    const now = Date.now();
    if (prevDisk) {
      const dt = Math.max(0.1, (now - prevDisk.timestamp) / 1000);
      readIops = Math.max(0, Math.round((totalReads - prevDisk.reads) / dt));
      writeIops = Math.max(0, Math.round((totalWrites - prevDisk.writes) / dt));
      readBytesSec = Math.max(0, Math.round(((totalSectorsRead - prevDisk.sectorsRead) * 512) / dt));
      writeBytesSec = Math.max(0, Math.round(((totalSectorsWritten - prevDisk.sectorsWritten) * 512) / dt));
    }

    prevDisk = {
      reads: totalReads,
      sectorsRead: totalSectorsRead,
      writes: totalWrites,
      sectorsWritten: totalSectorsWritten,
      timestamp: now
    };
  } catch {}

  return {
    mountPoint: '/',
    totalBytes,
    usedBytes,
    freeBytes,
    usedPct,
    totalInodes,
    usedInodes,
    freeInodes,
    inodePct,
    readIops,
    writeIops,
    readBytesSec,
    writeBytesSec
  };
}

// Read /proc/net/dev for Network throughput and interface stats
function getNetworkStats() {
  const content = fs.readFileSync('/proc/net/dev', 'utf8');
  const lines = content.split('\n');
  const now = Date.now();
  let primaryIface = 'enp0s6';
  let rxBytes = 0;
  let txBytes = 0;
  let rxPackets = 0;
  let txPackets = 0;

  const ifaceList = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const iface = line.slice(0, colonIdx).trim();
    const stats = line.slice(colonIdx + 1).trim().split(/\s+/);
    if (stats.length < 16) continue;

    const rBytes = parseInt(stats[0], 10) || 0;
    const rPackets = parseInt(stats[1], 10) || 0;
    const tBytes = parseInt(stats[8], 10) || 0;
    const tPackets = parseInt(stats[9], 10) || 0;

    ifaceList.push({ iface, rxBytes: rBytes, txBytes: tBytes });

    if (iface !== 'lo' && !iface.startsWith('docker')) {
      primaryIface = iface;
      rxBytes = rBytes;
      txBytes = tBytes;
      rxPackets = rPackets;
      txPackets = tPackets;
    }
  }

  let rxRate = 0;
  let txRate = 0;

  if (prevNet && prevNet.iface === primaryIface) {
    const dt = Math.max(0.1, (now - prevNet.timestamp) / 1000);
    rxRate = Math.max(0, Math.round((rxBytes - prevNet.rxBytes) / dt));
    txRate = Math.max(0, Math.round((txBytes - prevNet.txBytes) / dt));
  }

  prevNet = { iface: primaryIface, rxBytes, txBytes, timestamp: now };

  return {
    interface: primaryIface,
    rxRateBytesSec: rxRate,
    txRateBytesSec: txRate,
    rxTotalBytes: rxBytes,
    txTotalBytes: txBytes,
    rxPackets,
    txPackets,
    pingLatencyMs: cachedPing,
    interfaces: ifaceList
  };
}

// Read /proc/loadavg and /proc/uptime
function getLoadAndUptime() {
  const loadContent = fs.readFileSync('/proc/loadavg', 'utf8').trim();
  const uptimeContent = fs.readFileSync('/proc/uptime', 'utf8').trim();

  const loadParts = loadContent.split(/\s+/);
  const load1 = parseFloat(loadParts[0]) || 0;
  const load5 = parseFloat(loadParts[1]) || 0;
  const load15 = parseFloat(loadParts[2]) || 0;
  const procCounts = (loadParts[3] || '1/100').split('/');
  const activeProcs = parseInt(procCounts[0], 10) || 0;
  const totalProcs = parseInt(procCounts[1], 10) || 0;

  const uptimeSeconds = Math.floor(parseFloat(uptimeContent.split(/\s+/)[0]) || 0);
  const bootTimestamp = Date.now() - uptimeSeconds * 1000;

  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  let humanUptime = '';
  if (days > 0) humanUptime += `${days}d `;
  if (hours > 0 || days > 0) humanUptime += `${hours}h `;
  humanUptime += `${minutes}m ${seconds}s`;

  return {
    load1,
    load5,
    load15,
    activeProcs,
    totalProcs,
    uptimeSeconds,
    bootTimestamp,
    humanUptime: humanUptime.trim()
  };
}

// Compute health status: Healthy, Degraded, Critical
function getHealthStatus(cpuUsage, memPct, diskPct, load1, coreCount) {
  if (cpuUsage > 92 || memPct > 95 || diskPct > 95 || load1 > coreCount * 2.5) {
    return { status: 'Critical', color: 'rose' };
  }
  if (cpuUsage > 75 || memPct > 85 || diskPct > 85 || load1 > coreCount * 1.5) {
    return { status: 'Degraded', color: 'amber' };
  }
  return { status: 'Healthy', color: 'emerald' };
}

// Full Telemetry snapshot
function getFullTelemetry() {
  const cpu = getCPUStats();
  const memory = getMemoryStats();
  const disk = getDiskStats();
  const network = getNetworkStats();
  const loadUptime = getLoadAndUptime();
  const health = getHealthStatus(cpu.usage, memory.usedPct, disk.usedPct, loadUptime.load1, cpu.coreCount);

  return {
    timestamp: Date.now(),
    health,
    cpu,
    memory,
    disk,
    network,
    system: loadUptime
  };
}

// Static System Profile
function getSystemProfile() {
  const loadUptime = getLoadAndUptime();
  const memory = getMemoryStats();
  const disk = getDiskStats();

  return {
    hostname: os.hostname(),
    os: osAdapter.OS_PRETTY_NAME || cachedOsInfo,
    osFamily: osAdapter.OS_FAMILY,
    osId: osAdapter.OS_ID,
    osVersion: osAdapter.OS_VERSION,
    osName: osAdapter.OS_NAME,
    systemdAvailable: osAdapter.isSystemdAvailable(),
    kernel: os.release(),
    arch: os.arch(),
    cpuModel: cachedCpuModel,
    cpuCores: os.cpus().length,
    totalMemory: memory.total,
    totalDisk: disk.totalBytes,
    publicIp: cachedPublicIp || 'Detecting...',
    privateIp: cachedPrivateIp || '127.0.0.1',
    bootTimestamp: loadUptime.bootTimestamp,
    humanUptime: loadUptime.humanUptime
  };
}

// Top Processes via lightweight ps
function getTopProcesses(limit = 15) {
  return new Promise((resolve) => {
    exec(`ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%cpu | head -n ${limit + 1}`, (err, stdout) => {
      if (err || !stdout) {
        return resolve([]);
      }
      const lines = stdout.trim().split('\n');
      const processes = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 6) {
          processes.push({
            pid: parseInt(parts[0], 10),
            user: parts[1],
            cpu: parseFloat(parts[2]) || 0,
            mem: parseFloat(parts[3]) || 0,
            uptime: parts[4],
            command: parts.slice(5).join(' ')
          });
        }
      }
      resolve(processes);
    });
  });
}

module.exports = {
  getCPUStats,
  getMemoryStats,
  getDiskStats,
  getNetworkStats,
  getLoadAndUptime,
  getFullTelemetry,
  getSystemProfile,
  getTopProcesses
};
