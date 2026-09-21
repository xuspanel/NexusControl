const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const auditLogger = require('./auditLogger');

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

let selectConfigStmt;
let selectRawConfigStmt;
let upsertConfigStmt;

// Token cache in-memory
let cachedAccessToken = null;
let tokenExpiresAt = 0;

function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS gdrive_configs (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_secret TEXT,
      refresh_token TEXT,
      folder_id TEXT,
      active INTEGER NOT NULL DEFAULT 0
    );
  `);

  selectConfigStmt = db.prepare(`
    SELECT id, client_id,
           CASE
             WHEN length(client_secret) > 4 THEN '••••••••' || substr(client_secret, -4)
             ELSE '••••••••'
           END as client_secret_masked,
           CASE
             WHEN length(refresh_token) > 4 THEN '••••••••' || substr(refresh_token, -4)
             ELSE '••••••••'
           END as refresh_token_masked,
           folder_id,
           active
    FROM gdrive_configs
    ORDER BY rowid DESC
    LIMIT 1
  `);

  selectRawConfigStmt = db.prepare(`
    SELECT * FROM gdrive_configs ORDER BY rowid DESC LIMIT 1
  `);

  upsertConfigStmt = db.prepare(`
    INSERT OR REPLACE INTO gdrive_configs (id, client_id, client_secret, refresh_token, folder_id, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
}

initDb();

/**
 * Get Google Drive configuration for UI display (secrets masked)
 */
function getGDriveConfig() {
  const row = selectConfigStmt.get();
  if (!row) {
    return {
      configured: false,
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      folderId: '',
      active: false
    };
  }

  return {
    configured: true,
    id: row.id,
    clientId: row.client_id || '',
    clientSecret: row.client_secret_masked || '',
    refreshToken: row.refresh_token_masked || '',
    folderId: row.folder_id || '',
    active: Boolean(row.active)
  };
}

/**
 * Get raw Google Drive configuration for operational use
 */
function getRawGDriveConfig() {
  return selectRawConfigStmt.get() || null;
}

/**
 * Save / update Google Drive configuration
 */
function saveGDriveConfig({ clientId, clientSecret, refreshToken, folderId, active }) {
  if (!clientId || typeof clientId !== 'string') {
    throw new Error('Google OAuth2 Client ID is required.');
  }

  const existing = selectRawConfigStmt.get();

  let finalClientSecret = clientSecret;
  if (!finalClientSecret || finalClientSecret.startsWith('••••')) {
    if (existing && existing.client_secret) {
      finalClientSecret = existing.client_secret;
    } else {
      throw new Error('Google OAuth2 Client Secret is required.');
    }
  }

  let finalRefreshToken = refreshToken;
  if (!finalRefreshToken || finalRefreshToken.startsWith('••••')) {
    if (existing && existing.refresh_token) {
      finalRefreshToken = existing.refresh_token;
    } else {
      throw new Error('Google OAuth2 Refresh Token is required.');
    }
  }

  const id = existing?.id || 'default_gdrive';
  const numericActive = active ? 1 : 0;

  upsertConfigStmt.run(
    id,
    clientId.trim(),
    finalClientSecret.trim(),
    finalRefreshToken.trim(),
    folderId ? folderId.trim() : '',
    numericActive
  );

  // Invalidate token cache on config update
  cachedAccessToken = null;
  tokenExpiresAt = 0;

  return getGDriveConfig();
}

/**
 * Refresh OAuth2 Access Token using native fetch
 */
async function refreshAccessToken(config) {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch {
      const text = await response.text();
      errorData = { error: 'http_error', error_description: text };
    }
    const description = errorData.error_description ? ` - ${errorData.error_description}` : '';
    throw new Error(`Google OAuth2 Error: ${errorData.error || 'unknown_error'}${description}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Google OAuth2 Error: ${data.error} - ${data.error_description || 'unknown'}`);
  }

  cachedAccessToken = data.access_token;
  const expiresInMs = (data.expires_in || 3600) * 1000;
  tokenExpiresAt = now + expiresInMs;

  return cachedAccessToken;
}

/**
 * Test Google Drive credentials & target folder write access
 */
async function testGDriveConnection(customConfig = null) {
  let config = {};
  const raw = getRawGDriveConfig();

  if (customConfig) {
    const cid = customConfig.client_id || customConfig.clientId;
    let sec = customConfig.client_secret || customConfig.clientSecret;
    let ref = customConfig.refresh_token || customConfig.refreshToken;
    const fid = customConfig.folder_id !== undefined ? customConfig.folder_id : customConfig.folderId;

    if ((!sec || sec.startsWith('••••')) && raw?.client_secret) {
      sec = raw.client_secret;
    }
    if ((!ref || ref.startsWith('••••')) && raw?.refresh_token) {
      ref = raw.refresh_token;
    }

    config = {
      client_id: cid || raw?.client_id || '',
      client_secret: sec || '',
      refresh_token: ref || '',
      folder_id: fid !== undefined ? fid : (raw?.folder_id || '')
    };
  } else if (raw) {
    config = {
      client_id: raw.client_id || '',
      client_secret: raw.client_secret || '',
      refresh_token: raw.refresh_token || '',
      folder_id: raw.folder_id || ''
    };
  }

  if (!config.client_id || !config.client_secret || !config.refresh_token) {
    throw new Error('Incomplete Google Drive credentials. Please provide Client ID, Secret, and Refresh Token.');
  }

  const accessToken = await refreshAccessToken(config);

  // If a folder ID is specified, verify its existence and permissions
  if (config.folder_id && config.folder_id.trim()) {
    const folderId = encodeURIComponent(config.folder_id.trim());
    const folderUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,capabilities`;

    const folderRes = await fetch(folderUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const folderData = await folderRes.json();

    if (!folderRes.ok || folderData.error) {
      throw new Error(`Folder verification failed: ${folderData.error?.message || 'Folder not found or access denied.'}`);
    }

    return {
      success: true,
      message: `Connected successfully. Verified target folder: '${folderData.name}'.`
    };
  }

  // Otherwise, verify token by fetching user drive about info
  const aboutUrl = 'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota';
  const aboutRes = await fetch(aboutUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const aboutData = await aboutRes.json();

  if (!aboutRes.ok || aboutData.error) {
    throw new Error(`Drive access check failed: ${aboutData.error?.message || 'Access denied'}`);
  }

  return {
    success: true,
    message: `Connected successfully as ${aboutData.user?.emailAddress || 'authorized user'}.`
  };
}

/**
 * Step 1: Initiate Resumable Upload Session
 */
async function initiateResumableUpload(accessToken, filename, fileSize, folderId) {
  const initUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';

  const metadata = {
    name: filename,
    parents: folderId && folderId.trim() ? [folderId.trim()] : []
  };

  const response = await fetch(initUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(fileSize)
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to initiate Google Drive resumable upload (HTTP ${response.status}): ${errText}`);
  }

  const uploadLocation = response.headers.get('location');
  if (!uploadLocation) {
    throw new Error('Google Drive upload initiation succeeded but did not return a Location header.');
  }

  return uploadLocation;
}

/**
 * Step 2: Stream File to Resumable Upload Location using native https
 * Guaranteed zero-memory buffering for files of any size
 */
function streamFileToUploadLocation(locationUrl, filePath, fileSize) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(locationUrl);

    const options = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PUT',
      headers: {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream'
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseBody);
            resolve(parsed);
          } catch {
            resolve({ raw: responseBody });
          }
        } else {
          reject(new Error(`Google Drive stream upload failed with HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Stream request failed: ${err.message}`));
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (err) => {
      req.destroy();
      reject(new Error(`Failed to read file for Google Drive upload: ${err.message}`));
    });

    fileStream.pipe(req);
  });
}

/**
 * Upload local backup archive to Google Drive asynchronously
 */
async function uploadToGoogleDrive(filePath) {
  const config = getRawGDriveConfig();
  if (!config || !config.active) {
    return { uploaded: false, reason: 'gdrive_replication_disabled' };
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file does not exist for Google Drive upload: ${filePath}`);
  }

  const filename = path.basename(filePath);
  const stats = fs.statSync(filePath);

  try {
    const accessToken = await refreshAccessToken(config);
    const uploadLocation = await initiateResumableUpload(accessToken, filename, stats.size, config.folder_id);
    const driveFile = await streamFileToUploadLocation(uploadLocation, filePath, stats.size);

    auditLogger.logEvent({
      action: 'BACKUP_GDRIVE_UPLOAD_SUCCESS',
      user: 'system_backup_engine',
      ip: '127.0.0.1',
      targetResource: filename,
      payload: {
        driveFileId: driveFile.id,
        folderId: config.folder_id || 'root',
        sizeBytes: stats.size
      }
    });

    return {
      uploaded: true,
      filename,
      driveFileId: driveFile.id,
      sizeBytes: stats.size
    };
  } catch (err) {
    console.error(`[GDriveReplication] Failed to upload ${filename} to Google Drive:`, err.message);

    auditLogger.logEvent({
      action: 'BACKUP_GDRIVE_UPLOAD_FAILED',
      user: 'system_backup_engine',
      ip: '127.0.0.1',
      targetResource: filename,
      payload: {
        folderId: config.folder_id || 'root',
        error: err.message
      }
    });

    throw err;
  }
}

function _clearTokenCache() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

module.exports = {
  initDb,
  getGDriveConfig,
  getRawGDriveConfig,
  saveGDriveConfig,
  refreshAccessToken,
  testGDriveConnection,
  initiateResumableUpload,
  streamFileToUploadLocation,
  uploadToGoogleDrive,
  _clearTokenCache
};
