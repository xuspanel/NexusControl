const express = require('express');
const path = require('node:path');
const fsp = require('node:fs/promises');
const multer = require('multer');
const files = require('./files');
const trash = require('./trash');
const archive = require('./archive');
const uploadEngine = require('./upload');
const tasks = require('./tasks');
const auditLogger = require('./auditLogger');

const router = express.Router();
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function isPathInside(target, allowed) {
  const normTarget = path.resolve('/', target);
  const normAllowed = path.resolve('/', allowed);
  if (normAllowed === '/') return true;
  return normTarget === normAllowed || normTarget.startsWith(normAllowed.endsWith('/') ? normAllowed : normAllowed + '/');
}

// Strict File System Jail and Path Traversal Guard
function enforceDirectoryJail(req, res, next) {
  const isCustom = req.user?.role === 'custom';

  const candidatePaths = [];
  if (typeof req.query.path === 'string') candidatePaths.push(req.query.path);
  if (typeof req.query.target === 'string') candidatePaths.push(req.query.target);
  if (typeof req.query.destination === 'string') candidatePaths.push(req.query.destination);
  if (typeof req.query.file === 'string') candidatePaths.push(req.query.file);
  if (typeof req.query.dir === 'string') candidatePaths.push(req.query.dir);

  if (req.body) {
    if (typeof req.body.path === 'string') candidatePaths.push(req.body.path);
    if (typeof req.body.target === 'string') candidatePaths.push(req.body.target);
    if (typeof req.body.source === 'string') candidatePaths.push(req.body.source);
    if (typeof req.body.destination === 'string') candidatePaths.push(req.body.destination);
    if (typeof req.body.dir === 'string') candidatePaths.push(req.body.dir);
    if (typeof req.body.from === 'string') candidatePaths.push(req.body.from);
    if (typeof req.body.to === 'string') candidatePaths.push(req.body.to);
    if (Array.isArray(req.body.paths)) {
      for (const p of req.body.paths) {
        if (typeof p === 'string') candidatePaths.push(p);
      }
    }
  }

  // If custom user accesses directory listing without explicit query, default to root check
  if (isCustom && candidatePaths.length === 0 && req.path === '/list') {
    candidatePaths.push('/');
  }

  if (isCustom) {
    const allowedDirs = req.user?.granular_policies?.resources?.allowed_directories || [];

    for (const target of candidatePaths) {
      if (target.includes('\0')) {
        auditLogger.logEvent({
          action: 'SECURITY_VIOLATION',
          user: req.user?.username || 'unknown',
          ip: req.clientIp || req.ip,
          userAgent: req.headers['user-agent'],
          targetResource: target,
          payload: { reason: 'NULL_BYTE_INJECTION', requestedPath: target }
        });
        return res.status(400).json({ error: 'Null byte injection detected in path.' });
      }

      const normalized = path.resolve('/', target);
      const isTraversal = target.includes('..');
      const isAllowed = allowedDirs.length > 0 && allowedDirs.some(allowed => isPathInside(normalized, allowed));

      if (isTraversal || !isAllowed) {
        auditLogger.logEvent({
          action: 'SECURITY_VIOLATION',
          user: req.user?.username || 'unknown',
          ip: req.clientIp || req.ip,
          userAgent: req.headers['user-agent'],
          targetResource: target,
          payload: {
            reason: isTraversal ? 'PATH_TRAVERSAL_ATTEMPT' : 'DIRECTORY_JAILBREAK_ATTEMPT',
            requestedPath: target,
            resolvedPath: normalized,
            allowedDirectories: allowedDirs
          }
        });
        return res.status(403).json({
          error: 'Forbidden: Path outside allowed directory policy.',
          requestedPath: target,
          allowedDirectories: allowedDirs
        });
      }
    }
  } else {
    // Non-custom users (superadmin, operator)
    for (const target of candidatePaths) {
      if (target.includes('\0')) {
        return res.status(400).json({ error: 'Null byte injection detected in path.' });
      }
      if (target.includes('..')) {
        return res.status(403).json({ error: 'Path traversal forbidden: relative parent traversal ("..") is blocked.' });
      }
      const normalized = path.resolve('/', target);
      if (normalized === '/etc/shadow' || normalized === '/etc/gshadow') {
        return res.status(403).json({ error: 'Access to system authentication files is strictly forbidden.' });
      }
    }
  }

  next();
}

router.use(enforceDirectoryJail);

// 1. List directory
router.get('/list', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    const showHidden = req.query.showHidden === 'true';
    const data = await files.listDirectory(dirPath, showHidden);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Read file content (Text or Hex view)
router.get('/read', async (req, res) => {
  try {
    const filePath = req.query.path;
    const forceHex = req.query.hex === 'true';
    if (!filePath) return res.status(400).json({ error: 'path is required.' });

    const data = await files.readFileContent(filePath, 2 * 1024 * 1024, forceHex);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Save / Write file content with strict safety guardrails
const handleSaveFile = async (req, res) => {
  try {
    const { path: filePath, content } = req.body || {};
    if (!filePath) return res.status(400).json({ error: 'path is required.' });
    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required and cannot be undefined.' });
    }
    const data = await files.writeFileContent(filePath, content);
    auditLogger.logEvent({
      action: 'FILE_WRITE',
      user: req.user?.username || 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: filePath,
      payload: { size: typeof content === 'string' ? content.length : 0 }
    });
    res.json(data);
  } catch (err) {
    console.error('[SAVE FILE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

router.post('/save', handleSaveFile);
router.post('/write', handleSaveFile);

// 3b. Authenticated File Download
router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path is required.' });
    const normPath = files.sanitizePath(filePath);
    const stat = await fsp.stat(normPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot download a directory directly. Compress to archive first.' });
    }
    const fileName = path.basename(normPath);
    res.download(normPath, fileName);
  } catch (err) {
    console.error('[DOWNLOAD ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Create empty file
router.post('/create', async (req, res) => {
  try {
    const { path: parentPath, name } = req.body;
    if (!parentPath || !name) return res.status(400).json({ error: 'path and name are required.' });
    const data = await files.createFile(parentPath, name);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Create directory
router.post('/mkdir', async (req, res) => {
  try {
    const { path: parentPath, name } = req.body;
    if (!parentPath || !name) return res.status(400).json({ error: 'path and name are required.' });
    const data = await files.createDirectory(parentPath, name);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Rename item
router.post('/rename', async (req, res) => {
  try {
    const { oldPath, newName } = req.body;
    if (!oldPath || !newName) return res.status(400).json({ error: 'oldPath and newName are required.' });
    const data = await files.renameItem(oldPath, newName);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Duplicate item
router.post('/duplicate', async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    if (!targetPath) return res.status(400).json({ error: 'path is required.' });
    const data = await files.duplicateItem(targetPath);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Chmod permissions
router.post('/chmod', async (req, res) => {
  try {
    const { path: targetPath, mode, recursive } = req.body;
    if (!targetPath || mode === undefined) return res.status(400).json({ error: 'path and mode are required.' });
    const data = await files.chmodItem(targetPath, mode, !!recursive);
    auditLogger.logEvent({
      action: 'FILE_CHMOD',
      user: req.user?.username || 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: targetPath,
      payload: { mode, recursive: !!recursive }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Conflict dry-run check
router.post('/conflicts', (req, res) => {
  try {
    const { sources, destinationDir } = req.body;
    if (!Array.isArray(sources) || !destinationDir) {
      return res.status(400).json({ error: 'sources array and destinationDir are required.' });
    }
    const conflicts = files.checkConflicts(sources, destinationDir);
    res.json({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Copy items
router.post('/copy', async (req, res) => {
  try {
    const { sources, destinationDir, resolution } = req.body;
    if (!Array.isArray(sources) || !destinationDir) {
      return res.status(400).json({ error: 'sources array and destinationDir are required.' });
    }

    const conflicts = files.checkConflicts(sources, destinationDir);
    if (conflicts.length > 0 && !resolution) {
      return res.status(409).json({ error: 'File conflict detected', conflicts });
    }

    const data = await files.copyItems(sources, destinationDir, resolution);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Move items
router.post('/move', async (req, res) => {
  try {
    const { sources, destinationDir, resolution } = req.body;
    if (!Array.isArray(sources) || !destinationDir) {
      return res.status(400).json({ error: 'sources array and destinationDir are required.' });
    }

    const conflicts = files.checkConflicts(sources, destinationDir);
    if (conflicts.length > 0 && !resolution) {
      return res.status(409).json({ error: 'File conflict detected', conflicts });
    }

    const data = await files.moveItems(sources, destinationDir, resolution);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Deletion Routing
// POST /api/files/trash - Move items to Trash
router.post('/trash', async (req, res) => {
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'paths array is required.' });
    }
    const data = await trash.moveToTrash(paths);
    auditLogger.logEvent({
      action: 'FILE_TRASH',
      user: req.user?.username || 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: paths.join(', '),
      payload: { paths }
    });
    res.json({ success: true, trashed: data });
  } catch (err) {
    console.error('[TRASH ROUTE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files - Permanent delete
router.delete('/', async (req, res) => {
  try {
    let paths = req.body?.paths;
    if (!paths && req.query?.path) {
      paths = [req.query.path];
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'paths array is required.' });
    }
    const data = await files.deletePermanent(paths);
    auditLogger.logEvent({
      action: 'FILE_DELETE_PERMANENT',
      user: req.user?.username || 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: paths.join(', '),
      payload: { paths }
    });
    res.json(data);
  } catch (err) {
    console.error('[PERMANENT DELETE ROUTE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/delete & POST /api/files/delete (compatibility aliases)
const handleDelete = async (req, res) => {
  try {
    const { paths, permanent } = req.body || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'paths array is required.' });
    }

    if (permanent) {
      const data = await files.deletePermanent(paths);
      auditLogger.logEvent({
        action: 'FILE_DELETE_PERMANENT',
        user: req.user?.username || 'root',
        ip: req.clientIp || req.ip,
        userAgent: req.headers['user-agent'],
        targetResource: paths.join(', '),
        payload: { paths }
      });
      res.json(data);
    } else {
      const data = await trash.moveToTrash(paths);
      auditLogger.logEvent({
        action: 'FILE_TRASH',
        user: req.user?.username || 'root',
        ip: req.clientIp || req.ip,
        userAgent: req.headers['user-agent'],
        targetResource: paths.join(', '),
        payload: { paths }
      });
      res.json({ success: true, trashed: data });
    }
  } catch (err) {
    console.error('[DELETE ROUTE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

router.post('/delete', handleDelete);
router.delete('/delete', handleDelete);

// 13. Trash Bin operations
router.get('/trash', async (req, res) => {
  try {
    const items = await trash.listTrash();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trash/restore', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required.' });
    }
    const restored = await trash.restoreFromTrash(ids);
    res.json({ success: true, restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trash/empty', async (req, res) => {
  try {
    await trash.emptyTrash();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trash/delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required.' });
    }
    await trash.deleteFromTrashPermanent(ids);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Archive operations
router.post('/archive', async (req, res) => {
  try {
    const { targetFile, sources, format } = req.body;
    if (!targetFile || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: 'targetFile and sources are required.' });
    }
    const result = await archive.createArchive(targetFile, sources, format || 'tar.gz');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const archivePath = req.body.archivePath || req.body.archiveFile || req.body.path;
    const targetDir = req.body.targetDir || req.body.destinationDir || req.body.destination || req.body.dest;
    if (!archivePath) {
      return res.status(400).json({ error: 'archivePath or archiveFile is required.' });
    }
    const finalTargetDir = targetDir || path.dirname(path.resolve(path.normalize(archivePath)));
    const result = await archive.extractArchive(archivePath, finalTargetDir);
    auditLogger.logEvent({
      action: 'ARCHIVE_EXTRACT',
      user: req.user?.username || 'root',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: archivePath,
      payload: { destination: finalTargetDir, result }
    });
    res.json(result);
  } catch (err) {
    console.error('[EXTRACT ROUTE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// 15. Storage Mounts
router.get('/mounts', (req, res) => {
  try {
    const mounts = files.getMounts();
    res.json(mounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Search (Filename and Content Grep)
router.post('/search', async (req, res) => {
  try {
    const { baseDir, query, contentSearch, isRegex, maxResults } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required.' });
    const results = await files.searchFiles(baseDir || '/', query, !!contentSearch, !!isRegex, maxResults || 100);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Background Tasks
router.get('/tasks', (req, res) => {
  res.json(tasks.getAllTasks());
});

router.get('/tasks/:id', (req, res) => {
  const task = tasks.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// 18. Chunked Uploads
router.post('/upload/chunk', (req, res, next) => {
  uploadMem.single('chunk')(req, res, (err) => {
    if (err) {
      console.error('[UPLOAD CHUNK MULTER ERROR]', err);
      return res.status(500).json({ error: `Upload error: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  try {
    const uploadId = req.body.uploadId || req.body.fileId;
    const chunkIndex = req.body.chunkIndex;
    if (!uploadId || chunkIndex === undefined || !req.file) {
      return res.status(400).json({ error: 'uploadId (or fileId), chunkIndex, and chunk file are required.' });
    }
    const result = await uploadEngine.saveChunk(uploadId, parseInt(chunkIndex, 10), req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error('[UPLOAD CHUNK SAVE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/upload/status', async (req, res) => {
  try {
    const uploadId = req.query.uploadId || req.query.fileId;
    if (!uploadId) return res.status(400).json({ error: 'uploadId or fileId is required.' });
    const uploadedChunks = await uploadEngine.getUploadedChunks(uploadId);
    res.json({ uploadId, uploadedChunks });
  } catch (err) {
    console.error('[UPLOAD STATUS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

const handleAssemble = async (req, res) => {
  try {
    const uploadId = req.body.uploadId || req.body.fileId;
    const { targetDir, fileName, totalChunks } = req.body;
    if (!uploadId || !targetDir || !fileName || !totalChunks) {
      return res.status(400).json({ error: 'uploadId/fileId, targetDir, fileName, and totalChunks are required.' });
    }
    const result = await uploadEngine.assembleChunks(uploadId, targetDir, fileName, parseInt(totalChunks, 10));
    res.json(result);
  } catch (err) {
    console.error('[UPLOAD ASSEMBLE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

router.post('/upload/complete', handleAssemble);
router.post('/upload/assemble', handleAssemble);

router.post('/upload/cancel', async (req, res) => {
  try {
    const uploadId = req.body.uploadId || req.body.fileId;
    if (!uploadId) return res.status(400).json({ error: 'uploadId or fileId is required.' });
    await uploadEngine.cancelUpload(uploadId);
    res.json({ success: true });
  } catch (err) {
    console.error('[UPLOAD CANCEL ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
