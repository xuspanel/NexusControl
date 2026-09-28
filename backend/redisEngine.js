const Redis = require('ioredis');

let client = null;
let isConnecting = false;

/**
 * Parses the raw string output of Redis INFO command into a structured JSON object.
 * Maps both top-level keys and organized sections.
 * 
 * @param {string} rawInfo
 * @returns {object}
 */
function infoToJSON(rawInfo) {
  if (!rawInfo || typeof rawInfo !== 'string') return {};

  const result = { sections: {} };
  let currentSection = 'general';

  const lines = rawInfo.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      currentSection = trimmed.replace(/^#\s*/, '').toLowerCase().trim();
      if (!result.sections[currentSection]) {
        result.sections[currentSection] = {};
      }
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      // Store at root level for quick direct access
      result[key] = value;

      // Store inside its section
      if (!result.sections[currentSection]) {
        result.sections[currentSection] = {};
      }
      result.sections[currentSection][key] = value;
    }
  }

  return result;
}

/**
 * Creates and configures the Redis client with robust error suppression.
 */
function createClient() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;

  const redis = new Redis({
    host,
    port,
    password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 5000,
    retryStrategy(times) {
      if (times > 3) return null; // Stop reconnect loop if redis isn't present
      return 2000;
    },
    enableOfflineQueue: false
  });

  redis.on('error', (err) => {
    // Graceful error logging - do not crash process
    // console.warn('[RedisEngine] Notice:', err.message);
  });

  return redis;
}

/**
 * Safely retrieves or establishes an active Redis client connection.
 * If Redis is not installed, down, or fails to connect, returns null without throwing.
 * 
 * @returns {Promise<Redis|null>}
 */
async function getRedisClient() {
  if (client) {
    if (client.status === 'ready' || client.status === 'connect') {
      return client;
    }
    if (client.status === 'connecting' || client.status === 'reconnecting') {
      return client;
    }
  }

  if (isConnecting) {
    return null;
  }

  try {
    isConnecting = true;
    if (!client) {
      client = createClient();
    }

    if (client.status === 'wait' || client.status === 'close' || client.status === 'end') {
      await client.connect();
    } else {
      await client.ping();
    }

    return client;
  } catch (err) {
    // If connection fails, close client and return null gracefully
    try {
      if (client) {
        client.disconnect(false);
      }
    } catch {}
    client = null;
    return null;
  } finally {
    isConnecting = false;
  }
}

module.exports = {
  getRedisClient,
  infoToJSON
};
