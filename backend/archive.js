const { execFile } = require('node:child_process');
const fsp = require('node:fs/promises');
const path = require('node:path');
const tasks = require('./tasks');

async function createArchive(targetFile, sources, format = 'tar.gz') {
  const normTarget = path.resolve(path.normalize(targetFile));
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('No sources specified for archive.');

  const parentDir = path.dirname(path.resolve(path.normalize(sources[0])));
  await fsp.mkdir(path.dirname(normTarget), { recursive: true });

  const relativeSources = sources.map(s => {
    const abs = path.resolve(path.normalize(s));
    return path.relative(parentDir, abs) || path.basename(abs);
  });

  const task = tasks.createTask('archive', `Compressing ${sources.length} items into ${path.basename(normTarget)}`);

  // Run asynchronously in background
  (async () => {
    try {
      const isZip = format === 'zip' || normTarget.endsWith('.zip');
      if (isZip) {
        await new Promise((resolve, reject) => {
          execFile('zip', ['-r', normTarget, ...relativeSources], { cwd: parentDir }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr?.trim() || err.message));
            resolve();
          });
        });
      } else {
        // Default to tar.gz with explicit cwd option
        await new Promise((resolve, reject) => {
          execFile('tar', ['-czf', normTarget, ...relativeSources], { cwd: parentDir }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr?.trim() || err.message));
            resolve();
          });
        });
      }

      tasks.updateTask(task.id, { progress: 100, status: 'completed' });
    } catch (err) {
      console.error('[ARCHIVE ERROR]', err);
      tasks.updateTask(task.id, { status: 'failed', error: err.message });
    }
  })();

  return { taskId: task.id, targetFile: normTarget };
}

async function extractArchive(archivePath, targetDir) {
  const normArchive = path.resolve(path.normalize(archivePath));
  const normDest = path.resolve(path.normalize(targetDir));

  await fsp.mkdir(normDest, { recursive: true });

  const task = tasks.createTask('extract', `Extracting ${path.basename(normArchive)} to ${normDest}`);

  (async () => {
    try {
      const lower = normArchive.toLowerCase();
      if (lower.endsWith('.zip')) {
        await new Promise((resolve, reject) => {
          execFile('unzip', ['-o', normArchive, '-d', normDest], { cwd: normDest }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr?.trim() || err.message));
            resolve();
          });
        });
      } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
        await new Promise((resolve, reject) => {
          execFile('tar', ['-xf', normArchive, '-C', normDest], { cwd: normDest }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr?.trim() || err.message));
            resolve();
          });
        });
      } else {
        throw new Error('Unsupported archive format. Supported: .tar.gz, .tgz, .tar, .zip');
      }

      tasks.updateTask(task.id, { progress: 100, status: 'completed' });
    } catch (err) {
      console.error('[EXTRACT ERROR]', err);
      tasks.updateTask(task.id, { status: 'failed', error: err.message });
    }
  })();

  return { taskId: task.id, destination: normDest };
}

module.exports = {
  createArchive,
  extractArchive
};
