const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { S3Client, PutObjectCommand, HeadBucketCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const auditLogger = require('./auditLogger');

const dbPath = process.env.METRICS_DB_PATH || path.join(__dirname, 'metrics.db');
let db = new DatabaseSync(dbPath);

let selectConfigStmt;
let selectRawConfigStmt;
let upsertConfigStmt;

function initDb(databaseInstance) {
  if (databaseInstance) {
    db = databaseInstance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS s3_configs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      endpoint TEXT,
      region TEXT NOT NULL,
      bucket TEXT NOT NULL,
      access_key TEXT NOT NULL,
      secret_key TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0
    );
  `);

  selectConfigStmt = db.prepare(`
    SELECT id, provider, endpoint, region, bucket, access_key,
           CASE
             WHEN length(secret_key) > 4 THEN '••••••••' || substr(secret_key, -4)
             ELSE '••••••••'
           END as secret_key_masked,
           active
    FROM s3_configs
    ORDER BY rowid DESC
    LIMIT 1
  `);

  selectRawConfigStmt = db.prepare(`
    SELECT * FROM s3_configs ORDER BY rowid DESC LIMIT 1
  `);

  upsertConfigStmt = db.prepare(`
    INSERT OR REPLACE INTO s3_configs (id, provider, endpoint, region, bucket, access_key, secret_key, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

initDb();

function getS3Client(config) {
  const s3Config = {
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.access_key,
      secretAccessKey: config.secret_key
    }
  };

  if (config.endpoint && config.endpoint.trim()) {
    let endpoint = config.endpoint.trim();
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = 'https://' + endpoint;
    }
    s3Config.endpoint = endpoint;
  }

  if (config.provider === 'minio') {
    s3Config.forcePathStyle = true;
  }

  return new S3Client(s3Config);
}

/**
 * Get S3 config with masked secret key for UI display
 */
function getS3Config() {
  const row = selectConfigStmt.get();
  if (!row) {
    return {
      configured: false,
      provider: 'r2',
      endpoint: '',
      region: 'auto',
      bucket: '',
      accessKey: '',
      secretKey: '',
      active: false
    };
  }
  return {
    configured: true,
    id: row.id,
    provider: row.provider,
    endpoint: row.endpoint || '',
    region: row.region,
    bucket: row.bucket,
    accessKey: row.access_key,
    secretKey: row.secret_key_masked,
    active: Boolean(row.active)
  };
}

/**
 * Get raw S3 config for operations
 */
function getRawS3Config() {
  return selectRawConfigStmt.get() || null;
}

/**
 * Save / update S3 configuration
 */
function saveS3Config({ provider, endpoint, region, bucket, accessKey, secretKey, active }) {
  if (!bucket || typeof bucket !== 'string') {
    throw new Error('S3 Bucket name is required.');
  }
  if (!accessKey || typeof accessKey !== 'string') {
    throw new Error('S3 Access Key ID is required.');
  }

  const existing = selectRawConfigStmt.get();
  let finalSecretKey = secretKey;
  if (!finalSecretKey || finalSecretKey.startsWith('••••')) {
    if (existing && existing.secret_key) {
      finalSecretKey = existing.secret_key;
    } else {
      throw new Error('S3 Secret Access Key is required.');
    }
  }

  const id = existing?.id || 'default_s3';
  const numericActive = active ? 1 : 0;

  upsertConfigStmt.run(
    id,
    provider || 'r2',
    endpoint || '',
    region || 'auto',
    bucket.trim(),
    accessKey.trim(),
    finalSecretKey.trim(),
    numericActive
  );

  return getS3Config();
}

/**
 * Test connectivity and credentials with S3/R2 bucket
 */
async function testS3Connection(customConfig = null) {
  const config = customConfig ? {
    provider: customConfig.provider || 'r2',
    endpoint: customConfig.endpoint || '',
    region: customConfig.region || 'auto',
    bucket: customConfig.bucket,
    access_key: customConfig.accessKey,
    secret_key: customConfig.secretKey
  } : getRawS3Config();

  if (!config || !config.bucket || !config.access_key || !config.secret_key) {
    throw new Error('Incomplete S3 credentials.');
  }

  // If secretKey is masked, resolve from stored
  if (config.secret_key.startsWith('••••')) {
    const raw = getRawS3Config();
    if (raw && raw.secret_key) {
      config.secret_key = raw.secret_key;
    }
  }

  const client = getS3Client(config);

  try {
    // Attempt HeadBucket or ListObjectsV2 with maxKeys 1
    const command = new ListObjectsV2Command({
      Bucket: config.bucket,
      MaxKeys: 1
    });
    await client.send(command);
    return { success: true, message: `Successfully authenticated with bucket '${config.bucket}'.` };
  } catch (err) {
    throw new Error(`S3 connection test failed: ${err.message}`);
  }
}

/**
 * Upload local backup archive to S3 asynchronously
 */
async function uploadToS3(filePath) {
  const config = getRawS3Config();
  if (!config || !config.active) {
    return { uploaded: false, reason: 's3_replication_disabled' };
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file does not exist for upload: ${filePath}`);
  }

  const filename = path.basename(filePath);
  const client = getS3Client(config);
  const fileStream = fs.createReadStream(filePath);
  const stats = fs.statSync(filePath);

  try {
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: filename,
      Body: fileStream,
      ContentLength: stats.size
    });

    await client.send(command);

    auditLogger.logEvent({
      action: 'BACKUP_S3_UPLOAD_SUCCESS',
      user: 'system_backup_engine',
      ip: '127.0.0.1',
      targetResource: filename,
      payload: {
        bucket: config.bucket,
        provider: config.provider,
        sizeBytes: stats.size
      }
    });

    return {
      uploaded: true,
      filename,
      bucket: config.bucket,
      sizeBytes: stats.size
    };
  } catch (err) {
    console.error(`[S3Replication] Failed to upload ${filename} to S3 bucket ${config.bucket}:`, err.message);

    auditLogger.logEvent({
      action: 'BACKUP_S3_UPLOAD_FAILED',
      user: 'system_backup_engine',
      ip: '127.0.0.1',
      targetResource: filename,
      payload: {
        bucket: config.bucket,
        error: err.message
      }
    });

    throw err;
  }
}

module.exports = {
  initDb,
  getS3Config,
  getRawS3Config,
  saveS3Config,
  testS3Connection,
  uploadToS3
};
