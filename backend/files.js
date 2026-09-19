const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const mime = require('mime-types');
const tasks = require('./tasks');

let userMap = null;
let groupMap = null;

function loadUserAndGroupMaps() {
  if (userMap && groupMap) return;
  userMap = new Map();
  groupMap = new Map();

  try {
    const passwd = fs.readFileSync('/etc/passwd', 'utf8');
    for (const line of passwd.split('\n')) {
      const parts = line.split(':');
      if (parts.length >= 3) {
        userMap.set(parseInt(parts[2], 10), parts[0]);
      }
    }
  } catch {}

  try {
    const group = fs.readFileSync('/etc/group', 'utf8');
    for (const line of group.split('\n')) {
      const parts = line.split(':');
      if (parts.length >= 3) {
        groupMap.set(parseInt(parts[2], 10), parts[0]);
      }
    }
  } catch {}
}

function getUserName(uid) {
  loadUserAndGroupMaps();
  return userMap.get(uid) || uid.toString();
}

function getGroupName(gid) {
  loadUserAndGroupMaps();
  return groupMap.get(gid) || gid.toString();
}

// Format POSIX permission mode (e.g. "drwxr-xr-x", "-rw-r--r--")
function formatPermissions(mode, isDir, isSymlink) {
  const flags = [
    isDir ? 'd' : isSymlink ? 'l' : '-',
    mode & 0o400 ? 'r' : '-',
    mode & 0o200 ? 'w' : '-',
    mode & 0o100 ? (mode & 0o4000 ? 's' : 'x') : (mode & 0o4000 ? 'S' : '-'),
    mode & 0o040 ? 'r' : '-',
    mode & 0o020 ? 'w' : '-',
    mode & 0o010 ? (mode & 0o2000 ? 's' : 'x') : (mode & 0o2000 ? 'S' : '-'),
    mode & 0o004 ? 'r' : '-',
    mode & 0o002 ? 'w' : '-',
    mode & 0o001 ? (mode & 0o1000 ? 't' : 'x') : (mode & 0o1000 ? 'T' : '-')
  ];
  return flags.join('');
}

function formatOctalMode(mode) {
  return '0' + (mode & 0o777).toString(8);
}

// Sanitize path to prevent malformed directory traversal
function sanitizePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return '/';
  const resolved = path.resolve('/', path.normalize(inputPath));
  return resolved;
}

// Check if file is likely binary
function isBinaryBuffer(buffer) {
  const checkLen = Math.min(buffer.length, 1024);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

// Generate Hex Dump format for binary preview
function generateHexDump(buffer, maxBytes = 4096) {
  const len = Math.min(buffer.length, maxBytes);
  const rows = [];

  for (let offset = 0; offset < len; offset += 16) {
    const chunk = buffer.slice(offset, Math.min(offset + 16, len));
    const hexBytes = [];
    let asciiStr = '';

    for (let i = 0; i < 16; i++) {
      if (i < chunk.length) {
        const b = chunk[i];
        hexBytes.push(b.toString(16).padStart(2, '0').toUpperCase());
        asciiStr += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
      } else {
        hexBytes.push('  ');
      }
    }

    const offsetHex = offset.toString(16).padStart(8, '0').toUpperCase();
    const hexPart1 = hexBytes.slice(0, 8).join(' ');
    const hexPart2 = hexBytes.slice(8, 16).join(' ');

    rows.push({
      offset: offsetHex,
      hex: `${hexPart1}  ${hexPart2}`,
      ascii: asciiStr
    });
  }

  return rows;
}

// List Directory with rich metadata
async function listDirectory(dirPath = '/', showHidden = false) {
  const normPath = sanitizePath(dirPath);
  const dirStat = await fsp.stat(normPath);
  if (!dirStat.isDirectory()) {
    throw new Error(`Path '${normPath}' is not a directory.`);
  }

  const entries = await fsp.readdir(normPath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.') && entry.name !== '.') {
      continue;
    }

    const itemPath = path.join(normPath, entry.name);
    let lstat;
    try {
      lstat = await fsp.lstat(itemPath);
    } catch {
      continue; // Skip inaccessible or broken entries
    }

    const isDir = entry.isDirectory();
    const isSymlink = entry.isSymbolicLink();
    let symlinkTarget = null;

    if (isSymlink) {
      try {
        symlinkTarget = await fsp.readlink(itemPath);
      } catch {}
    }

    const ext = path.extname(entry.name).toLowerCase();
    const mimeType = mime.lookup(entry.name) || (isDir ? 'inode/directory' : 'application/octet-stream');
    const isArchive = ['.tar', '.gz', '.tgz', '.zip', '.bz2', '.xz', '.7z'].includes(ext);

    items.push({
      name: entry.name,
      path: itemPath,
      isDirectory: isDir,
      isSymbolicLink: isSymlink,
      symlinkTarget,
      size: isDir ? 0 : lstat.size,
      permissions: formatPermissions(lstat.mode, isDir, isSymlink),
      octalMode: formatOctalMode(lstat.mode),
      owner: getUserName(lstat.uid),
      group: getGroupName(lstat.gid),
      uid: lstat.uid,
      gid: lstat.gid,
      mtime: lstat.mtime.toISOString(),
      ext,
      mimeType,
      isArchive
    });
  }

  // Sort directories first, then alphabetical
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  // Calculate free space for current mount
  let freeBytes = 0;
  let totalBytes = 0;
  try {
    const s = fs.statfsSync(normPath);
    freeBytes = s.bavail * s.bsize;
    totalBytes = s.blocks * s.bsize;
  } catch {}

  const parentPath = normPath === '/' ? null : path.dirname(normPath);

  return {
    currentPath: normPath,
    parentPath,
    items,
    totalCount: items.length,
    freeBytes,
    totalBytes
  };
}

// Read file content (supports text vs hex view)
async function readFileContent(filePath, maxBytes = 2 * 1024 * 1024, forceHex = false) {
  const normPath = sanitizePath(filePath);
  const stat = await fsp.stat(normPath);

  if (stat.isDirectory()) {
    throw new Error('Cannot view directory as a file.');
  }

  const fd = await fsp.open(normPath, 'r');
  const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
  await fd.read(buffer, 0, buffer.length, 0);
  await fd.close();

  const binary = forceHex || isBinaryBuffer(buffer);

  if (binary) {
    const hexRows = generateHexDump(buffer);
    return {
      isBinary: true,
      path: normPath,
      name: path.basename(normPath),
      size: stat.size,
      hexRows,
      truncated: stat.size > maxBytes
    };
  }

  return {
    isBinary: false,
    path: normPath,
    name: path.basename(normPath),
    size: stat.size,
    content: buffer.toString('utf8'),
    truncated: stat.size > maxBytes
  };
}

// Write file content atomically
async function writeFileContent(filePath, content) {
  if (content === undefined) {
    throw new Error('Content payload cannot be undefined.');
  }
  const normPath = sanitizePath(filePath);
  await fsp.mkdir(path.dirname(normPath), { recursive: true });
  await fsp.writeFile(normPath, content, 'utf8');
  const stat = await fsp.stat(normPath);
  return { success: true, path: normPath, size: stat.size, mtime: stat.mtime };
}

// Create new empty file
async function createFile(parentPath, name) {
  const normParent = sanitizePath(parentPath);
  const targetPath = path.join(normParent, name.replace(/[\/\\]/g, ''));
  if (fs.existsSync(targetPath)) {
    throw new Error(`File '${name}' already exists.`);
  }
  await fsp.writeFile(targetPath, '', 'utf8');
  return { success: true, path: targetPath, name };
}

// Create new directory
async function createDirectory(parentPath, name) {
  const normParent = sanitizePath(parentPath);
  const targetPath = path.join(normParent, name.replace(/[\/\\]/g, ''));
  if (fs.existsSync(targetPath)) {
    throw new Error(`Folder '${name}' already exists.`);
  }
  await fsp.mkdir(targetPath, { recursive: true });
  return { success: true, path: targetPath, name };
}

// Rename item
async function renameItem(oldPath, newName) {
  const normOld = sanitizePath(oldPath);
  const cleanName = newName.replace(/[\/\\]/g, '').trim();
  if (!cleanName) throw new Error('Invalid file name.');

  const targetPath = path.join(path.dirname(normOld), cleanName);
  if (fs.existsSync(targetPath)) {
    throw new Error(`An item named '${cleanName}' already exists.`);
  }

  await fsp.rename(normOld, targetPath);
  return { success: true, oldPath: normOld, newPath: targetPath, name: cleanName };
}

// Duplicate item
async function duplicateItem(targetPath) {
  const norm = sanitizePath(targetPath);
  const stat = await fsp.stat(norm);
  const parent = path.dirname(norm);
  const parsed = path.parse(norm);

  let counter = 1;
  let dest = '';
  do {
    const copyName = stat.isDirectory() 
      ? `${parsed.name} (copy ${counter})` 
      : `${parsed.name} (copy ${counter})${parsed.ext}`;
    dest = path.join(parent, copyName);
    counter++;
  } while (fs.existsSync(dest));

  if (stat.isDirectory()) {
    await fsp.cp(norm, dest, { recursive: true });
  } else {
    await fsp.copyFile(norm, dest);
  }

  return { success: true, source: norm, destination: dest, name: path.basename(dest) };
}

// Change permissions (Chmod)
async function chmodItem(targetPath, mode, recursive = false) {
  const norm = sanitizePath(targetPath);
  const parsedMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;

  if (recursive) {
    const stat = await fsp.stat(norm);
    if (stat.isDirectory()) {
      await new Promise((resolve, reject) => {
        execFile('chmod', ['-R', formatOctalMode(parsedMode), norm], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      return { success: true, path: norm, mode: formatOctalMode(parsedMode) };
    }
  }

  await fsp.chmod(norm, parsedMode);
  return { success: true, path: norm, mode: formatOctalMode(parsedMode) };
}

// Dry-run conflict check for Copy/Move operations
function checkConflicts(sources, destDir) {
  const normDest = sanitizePath(destDir);
  const conflicts = [];

  for (const src of sources) {
    const normSrc = sanitizePath(src);
    const baseName = path.basename(normSrc);
    const targetPath = path.join(normDest, baseName);
    if (fs.existsSync(targetPath)) {
      conflicts.push({
        source: normSrc,
        destination: targetPath,
        name: baseName
      });
    }
  }

  return conflicts;
}

// Copy items with conflict resolution
async function copyItems(sources, destDir, resolution = 'overwrite') {
  const normDest = sanitizePath(destDir);
  const conflicts = checkConflicts(sources, normDest);

  if (conflicts.length > 0 && !resolution) {
    return { hasConflicts: true, conflicts };
  }

  const task = tasks.createTask('copy', `Copying ${sources.length} items to ${path.basename(normDest)}`);

  (async () => {
    try {
      for (let i = 0; i < sources.length; i++) {
        const src = sanitizePath(sources[i]);
        const baseName = path.basename(src);
        let dest = path.join(normDest, baseName);

        if (fs.existsSync(dest)) {
          if (resolution === 'skip') {
            continue;
          } else if (resolution === 'keepBoth') {
            const parsed = path.parse(dest);
            let c = 1;
            do {
              dest = path.join(normDest, `${parsed.name} (${c})${parsed.ext}`);
              c++;
            } while (fs.existsSync(dest));
          }
        }

        const stat = await fsp.stat(src);
        if (stat.isDirectory()) {
          await fsp.cp(src, dest, { recursive: true });
        } else {
          await fsp.copyFile(src, dest);
        }

        tasks.updateTask(task.id, { progress: Math.round(((i + 1) / sources.length) * 100) });
      }

      tasks.updateTask(task.id, { progress: 100, status: 'completed' });
    } catch (err) {
      tasks.updateTask(task.id, { status: 'failed', error: err.message });
    }
  })();

  return { taskId: task.id, count: sources.length };
}

// Move items with conflict resolution
async function moveItems(sources, destDir, resolution = 'overwrite') {
  const normDest = sanitizePath(destDir);
  const conflicts = checkConflicts(sources, normDest);

  if (conflicts.length > 0 && !resolution) {
    return { hasConflicts: true, conflicts };
  }

  const task = tasks.createTask('move', `Moving ${sources.length} items to ${path.basename(normDest)}`);

  (async () => {
    try {
      for (let i = 0; i < sources.length; i++) {
        const src = sanitizePath(sources[i]);
        const baseName = path.basename(src);
        let dest = path.join(normDest, baseName);

        if (fs.existsSync(dest)) {
          if (resolution === 'skip') {
            continue;
          } else if (resolution === 'keepBoth') {
            const parsed = path.parse(dest);
            let c = 1;
            do {
              dest = path.join(normDest, `${parsed.name} (${c})${parsed.ext}`);
              c++;
            } while (fs.existsSync(dest));
          } else if (resolution === 'overwrite') {
            await fsp.rm(dest, { recursive: true, force: true });
          }
        }

        try {
          await fsp.rename(src, dest);
        } catch (err) {
          if (err.code === 'EXDEV') {
            const stat = await fsp.lstat(src);
            if (stat.isDirectory()) {
              await fsp.cp(src, dest, { recursive: true });
            } else {
              await fsp.copyFile(src, dest);
            }
            await fsp.rm(src, { recursive: true, force: true });
          } else {
            throw err;
          }
        }
        tasks.updateTask(task.id, { progress: Math.round(((i + 1) / sources.length) * 100) });
      }

      tasks.updateTask(task.id, { progress: 100, status: 'completed' });
    } catch (err) {
      tasks.updateTask(task.id, { status: 'failed', error: err.message });
    }
  })();

  return { taskId: task.id, count: sources.length };
}

// Delete permanently
async function deletePermanent(itemPaths) {
  for (const p of itemPaths) {
    try {
      const norm = sanitizePath(p);
      if (norm === '/' || norm === '/etc' || norm === '/usr' || norm === '/boot') {
        throw new Error(`Cannot permanently delete system core: ${norm}`);
      }
      await fsp.rm(norm, { recursive: true, force: true });
    } catch (err) {
      console.error(`[PERMANENT DELETE ERROR] Failed to permanently delete ${p}:`, err);
      throw err;
    }
  }
  return { success: true, count: itemPaths.length };
}

// Dynamic mount points
function getMounts() {
  try {
    const content = fs.readFileSync('/proc/mounts', 'utf8');
    const lines = content.split('\n');
    const mounts = [];

    for (const line of lines) {
      if (!line.startsWith('/dev/')) continue;
      const parts = line.split(/\s+/);
      const dev = parts[0];
      const mnt = parts[1];
      const fsType = parts[2];

      // Exclude snaps and loop devices
      if (dev.startsWith('/dev/loop')) continue;

      let totalBytes = 0;
      let freeBytes = 0;
      let usedBytes = 0;
      let usedPct = 0;

      try {
        const s = fs.statfsSync(mnt);
        totalBytes = s.blocks * s.bsize;
        freeBytes = s.bavail * s.bsize;
        usedBytes = Math.max(0, totalBytes - freeBytes);
        usedPct = totalBytes > 0 ? parseFloat(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;
      } catch {}

      mounts.push({
        device: dev,
        mountPoint: mnt,
        fsType,
        totalBytes,
        freeBytes,
        usedBytes,
        usedPct
      });
    }

    return mounts;
  } catch {
    return [{ device: '/dev/sda1', mountPoint: '/', fsType: 'ext4', totalBytes: 0, freeBytes: 0, usedBytes: 0, usedPct: 0 }];
  }
}

// Advanced Search (filename and content grep)
async function searchFiles(baseDir, query, contentSearch = false, isRegex = false, maxResults = 100) {
  const normBase = sanitizePath(baseDir);
  const results = [];

  if (contentSearch) {
    // Safe grep content search
    return new Promise((resolve) => {
      const args = ['-r', '-n', '-I', '--max-count=1', query, normBase];
      execFile('grep', args, { maxBuffer: 1024 * 1024 * 2 }, (err, stdout) => {
        if (!stdout) return resolve([]);
        const lines = stdout.trim().split('\n');
        for (const line of lines.slice(0, maxResults)) {
          const firstColon = line.indexOf(':');
          const secondColon = line.indexOf(':', firstColon + 1);
          if (firstColon !== -1 && secondColon !== -1) {
            const fPath = line.slice(0, firstColon);
            const lineNum = line.slice(firstColon + 1, secondColon);
            const snippet = line.slice(secondColon + 1).trim();
            results.push({
              path: fPath,
              name: path.basename(fPath),
              line: parseInt(lineNum, 10),
              snippet: snippet.slice(0, 150)
            });
          }
        }
        resolve(results);
      });
    });
  }

  // Filename search using fast recursive readdir
  let matcher;
  try {
    matcher = isRegex ? new RegExp(query, 'i') : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  } catch {
    matcher = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  async function walk(dir, depth = 0) {
    if (depth > 6 || results.length >= maxResults) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const full = path.join(dir, entry.name);
      if (matcher.test(entry.name)) {
        results.push({
          path: full,
          name: entry.name,
          isDirectory: entry.isDirectory()
        });
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && !full.startsWith('/proc') && !full.startsWith('/sys')) {
        await walk(full, depth + 1);
      }
    }
  }

  await walk(normBase);
  return results;
}

module.exports = {
  sanitizePath,
  formatPermissions,
  formatOctalMode,
  listDirectory,
  readFileContent,
  writeFileContent,
  createFile,
  createDirectory,
  renameItem,
  duplicateItem,
  chmodItem,
  checkConflicts,
  copyItems,
  moveItems,
  deletePermanent,
  getMounts,
  searchFiles
};
