const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');

const UPLOADS_BASE = '/opt/NexusControl/.uploads';

async function initUploads() {
  await fsp.mkdir(UPLOADS_BASE, { recursive: true });
}

async function saveChunk(uploadId, chunkIndex, buffer) {
  await initUploads();
  const uploadDir = path.join(UPLOADS_BASE, uploadId);
  await fsp.mkdir(uploadDir, { recursive: true });

  const chunkPath = path.join(uploadDir, `chunk_${chunkIndex}`);
  await fsp.writeFile(chunkPath, buffer);
  return { success: true, chunkIndex };
}

async function getUploadedChunks(uploadId) {
  const uploadDir = path.join(UPLOADS_BASE, uploadId);
  try {
    const files = await fsp.readdir(uploadDir);
    const indices = files
      .filter(f => f.startsWith('chunk_'))
      .map(f => parseInt(f.replace('chunk_', ''), 10))
      .filter(n => !isNaN(n));
    return indices;
  } catch {
    return [];
  }
}

async function assembleChunks(uploadId, targetDir, fileName, totalChunks) {
  const uploadDir = path.join(UPLOADS_BASE, uploadId);
  const normTargetDir = path.resolve(path.normalize(targetDir));
  await fsp.mkdir(normTargetDir, { recursive: true });

  const finalPath = path.join(normTargetDir, fileName);
  const writeStream = fs.createWriteStream(finalPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(uploadDir, `chunk_${i}`);
    if (!fs.existsSync(chunkPath)) {
      writeStream.close();
      throw new Error(`Missing chunk #${i} for upload ${uploadId}`);
    }
    const data = await fsp.readFile(chunkPath);
    writeStream.write(data);
  }

  await new Promise((resolve, reject) => {
    writeStream.end((err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // Clean up chunks
  await fsp.rm(uploadDir, { recursive: true, force: true });

  const stat = await fsp.stat(finalPath);
  return {
    success: true,
    path: finalPath,
    name: fileName,
    size: stat.size
  };
}

async function cancelUpload(uploadId) {
  const uploadDir = path.join(UPLOADS_BASE, uploadId);
  await fsp.rm(uploadDir, { recursive: true, force: true });
  return { success: true };
}

module.exports = {
  initUploads,
  saveChunk,
  getUploadedChunks,
  assembleChunks,
  cancelUpload
};
