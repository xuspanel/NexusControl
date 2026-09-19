const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const TRASH_DIR = '/opt/NexusControl/.trash';
const META_FILE = path.join(TRASH_DIR, 'metadata.json');

async function initTrash() {
  await fsp.mkdir(TRASH_DIR, { recursive: true, mode: 0o755 });
  try {
    await fsp.access(META_FILE);
  } catch {
    await fsp.writeFile(META_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

async function readMetadata() {
  await initTrash();
  try {
    const raw = await fsp.readFile(META_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[TRASH METADATA ERROR] Read error:', err.message);
    return [];
  }
}

async function writeMetadata(meta) {
  try {
    await fsp.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  } catch (err) {
    console.error('[TRASH METADATA ERROR] Write error:', err.message);
    throw err;
  }
}

async function moveToTrash(itemPaths) {
  await initTrash();
  const meta = await readMetadata();
  const results = [];

  for (const itemPath of itemPaths) {
    try {
      const norm = path.resolve(path.normalize(itemPath));
      // Disallow deleting system root
      if (norm === '/' || norm === '/opt' || norm === '/opt/NexusControl' || norm === TRASH_DIR) {
        throw new Error(`Cannot delete protected system directory: ${norm}`);
      }

      const stat = await fsp.lstat(norm);
      const id = crypto.randomBytes(8).toString('hex');
      const baseName = path.basename(norm);
      const trashedName = `${id}_${baseName}`;
      const targetTrashPath = path.join(TRASH_DIR, trashedName);

      try {
        await fsp.rename(norm, targetTrashPath);
      } catch (err) {
        if (err.code === 'EXDEV') {
          if (stat.isDirectory()) {
            await fsp.cp(norm, targetTrashPath, { recursive: true });
          } else {
            await fsp.copyFile(norm, targetTrashPath);
          }
          await fsp.rm(norm, { recursive: true, force: true });
        } else {
          throw err;
        }
      }

      const record = {
        id,
        originalPath: norm,
        name: baseName,
        trashedName,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        trashedAt: Date.now()
      };

      meta.push(record);
      results.push(record);
    } catch (err) {
      console.error(`[TRASH ITEM ERROR] Failed to trash item ${itemPath}:`, err);
      throw err;
    }
  }

  await writeMetadata(meta);
  return results;
}

async function listTrash() {
  const meta = await readMetadata();
  const valid = [];

  for (const item of meta) {
    const p = path.join(TRASH_DIR, item.trashedName);
    try {
      await fsp.access(p);
      valid.push(item);
    } catch {}
  }

  if (valid.length !== meta.length) {
    await writeMetadata(valid);
  }

  return valid.sort((a, b) => b.trashedAt - a.trashedAt);
}

async function restoreFromTrash(ids) {
  await initTrash();
  const meta = await readMetadata();
  const remaining = [];
  const restored = [];

  for (const item of meta) {
    if (ids.includes(item.id)) {
      const trashItemPath = path.join(TRASH_DIR, item.trashedName);
      let targetPath = item.originalPath;

      // Ensure parent dir exists
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });

      // If destination already exists, append (restored)
      try {
        await fsp.access(targetPath);
        const parsed = path.parse(targetPath);
        targetPath = path.join(parsed.dir, `${parsed.name} (restored ${Date.now()})${parsed.ext}`);
      } catch {}

      try {
        await fsp.rename(trashItemPath, targetPath);
      } catch (err) {
        if (err.code === 'EXDEV') {
          const stat = await fsp.lstat(trashItemPath);
          if (stat.isDirectory()) {
            await fsp.cp(trashItemPath, targetPath, { recursive: true });
          } else {
            await fsp.copyFile(trashItemPath, targetPath);
          }
          await fsp.rm(trashItemPath, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
      restored.push({ id: item.id, restoredPath: targetPath });
    } else {
      remaining.push(item);
    }
  }

  await writeMetadata(remaining);
  return restored;
}

async function deleteFromTrashPermanent(ids) {
  await initTrash();
  const meta = await readMetadata();
  const remaining = [];

  for (const item of meta) {
    if (ids.includes(item.id)) {
      const p = path.join(TRASH_DIR, item.trashedName);
      try {
        await fsp.rm(p, { recursive: true, force: true });
      } catch {}
    } else {
      remaining.push(item);
    }
  }

  await writeMetadata(remaining);
  return { success: true };
}

async function emptyTrash() {
  await initTrash();
  const files = await fsp.readdir(TRASH_DIR);
  for (const file of files) {
    if (file !== 'metadata.json') {
      await fsp.rm(path.join(TRASH_DIR, file), { recursive: true, force: true });
    }
  }
  await writeMetadata([]);
  return { success: true };
}

module.exports = {
  TRASH_DIR,
  initTrash,
  moveToTrash,
  listTrash,
  restoreFromTrash,
  deleteFromTrashPermanent,
  emptyTrash
};
