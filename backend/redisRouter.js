const express = require('express');
const router = express.Router();
const { getRedisClient, infoToJSON } = require('./redisEngine');
const auditLogger = require('./auditLogger');
const { requireRole } = require('./auth');

/**
 * Middleware ensuring an active Redis client connection exists.
 * Returns 503 Service Unavailable if Redis is not installed, inactive, or unreachable.
 */
async function ensureRedis(req, res, next) {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return res.status(503).json({
        success: false,
        error: 'Redis service is inactive or unreachable on this VPS.',
        code: 'REDIS_INACTIVE'
      });
    }
    req.redis = redis;
    next();
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Redis connection failure: ' + err.message,
      code: 'REDIS_INACTIVE'
    });
  }
}

/**
 * Helper to parse raw CLI command string into an array of arguments,
 * respecting single and double quotes.
 */
function parseCommandLine(cmdString) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < cmdString.length; i++) {
    const char = cmdString[i];

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
      } else if (char === '\\' && i + 1 < cmdString.length) {
        current += cmdString[++i];
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
      } else if (/\s/.test(char)) {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

// ----------------------------------------------------
// A. DASHBOARD TELEMETRY
// ----------------------------------------------------
/**
 * GET /api/redis/status
 * Fetches INFO metrics from Redis and parses them into structured JSON telemetry.
 */
router.get('/status', ensureRedis, async (req, res) => {
  try {
    const rawInfo = await req.redis.info();
    const info = infoToJSON(rawInfo);

    const hits = parseInt(info.keyspace_hits || '0', 10);
    const misses = parseInt(info.keyspace_misses || '0', 10);
    const totalRequests = hits + misses;
    const hitRate = totalRequests > 0 ? ((hits / totalRequests) * 100).toFixed(2) : '0.00';

    let totalKeys = 0;
    if (info.sections && info.sections.keyspace) {
      for (const stats of Object.values(info.sections.keyspace)) {
        const match = stats.match(/keys=(\d+)/);
        if (match) totalKeys += parseInt(match[1], 10);
      }
    }

    res.json({
      success: true,
      active: true,
      telemetry: {
        version: info.redis_version || 'unknown',
        mode: info.redis_mode || 'standalone',
        os: info.os || '',
        uptime_seconds: parseInt(info.uptime_in_seconds || '0', 10),
        uptime_days: parseInt(info.uptime_in_days || '0', 10),
        used_memory_human: info.used_memory_human || '0B',
        used_memory_peak_human: info.used_memory_peak_human || '0B',
        total_system_memory_human: info.total_system_memory_human || 'N/A',
        mem_fragmentation_ratio: info.mem_fragmentation_ratio || '1.00',
        connected_clients: parseInt(info.connected_clients || '0', 10),
        blocked_clients: parseInt(info.blocked_clients || '0', 10),
        instantaneous_ops_per_sec: parseInt(info.instantaneous_ops_per_sec || '0', 10),
        keyspace_hits: hits,
        keyspace_misses: misses,
        hit_rate: parseFloat(hitRate),
        total_keys: totalKeys
      },
      raw_info: info
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// B. KEYSPACE BROWSER (SCAN-BASED)
// ----------------------------------------------------
/**
 * GET /api/redis/keys
 * Iterates through keyspace using SCAN cursor MATCH pattern COUNT count.
 * Never blocks the Redis event loop with KEYS *.
 */
router.get('/keys', ensureRedis, async (req, res) => {
  try {
    const cursor = req.query.cursor || '0';
    const pattern = req.query.pattern || '*';
    const count = parseInt(req.query.count || '100', 10);

    const [nextCursor, rawKeys] = await req.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);

    if (!rawKeys || rawKeys.length === 0) {
      return res.json({
        success: true,
        cursor: nextCursor,
        keys: []
      });
    }

    // Pipeline to fetch TYPE and TTL for all returned keys simultaneously
    const pipeline = req.redis.pipeline();
    for (const key of rawKeys) {
      pipeline.type(key);
      pipeline.ttl(key);
    }

    const results = await pipeline.exec();
    const items = [];

    for (let i = 0; i < rawKeys.length; i++) {
      const typeErr = results[i * 2][0];
      const type = typeErr ? 'unknown' : results[i * 2][1];

      const ttlErr = results[i * 2 + 1][0];
      const ttl = ttlErr ? -1 : results[i * 2 + 1][1];

      items.push({
        key: rawKeys[i],
        type,
        ttl
      });
    }

    res.json({
      success: true,
      cursor: nextCursor,
      keys: items
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/redis/keys/:key
 * Retrieves exact value based on its specific data type.
 */
router.get('/keys/:key', ensureRedis, async (req, res) => {
  try {
    const key = req.params.key;
    const type = await req.redis.type(key);

    if (type === 'none') {
      return res.status(404).json({ success: false, error: `Key "${key}" does not exist.` });
    }

    const ttl = await req.redis.ttl(key);
    let value = null;

    switch (type) {
      case 'string':
        value = await req.redis.get(key);
        break;
      case 'hash':
        value = await req.redis.hgetall(key);
        break;
      case 'list':
        value = await req.redis.lrange(key, 0, -1);
        break;
      case 'set':
        value = await req.redis.smembers(key);
        break;
      case 'zset': {
        const rawZset = await req.redis.zrange(key, 0, -1, 'WITHSCORES');
        const formattedZset = [];
        for (let i = 0; i < rawZset.length; i += 2) {
          formattedZset.push({
            member: rawZset[i],
            score: parseFloat(rawZset[i + 1])
          });
        }
        value = formattedZset;
        break;
      }
      case 'stream': {
        value = await req.redis.xrevrange(key, '+', '-', 'COUNT', 100);
        break;
      }
      default:
        value = await req.redis.dump(key);
        break;
    }

    res.json({
      success: true,
      key,
      type,
      ttl,
      value
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/redis/keys/:key (or POST /api/redis/keys)
 * Sets or updates a key's value and/or expiration TTL.
 */
async function handleSetKey(req, res) {
  try {
    const key = req.params.key || req.body?.key;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, error: 'A valid key name is required.' });
    }

    const { type = 'string', value, ttl } = req.body || {};

    if (value !== undefined) {
      if (type === 'string') {
        const strVal = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
        if (ttl && Number(ttl) > 0) {
          await req.redis.set(key, strVal, 'EX', Number(ttl));
        } else {
          await req.redis.set(key, strVal);
        }
      } else if (type === 'hash') {
        await req.redis.del(key);
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          await req.redis.hset(key, value);
        }
      } else if (type === 'list') {
        await req.redis.del(key);
        const listItems = Array.isArray(value) ? value : [value];
        if (listItems.length > 0) {
          await req.redis.rpush(key, ...listItems.map(String));
        }
      } else if (type === 'set') {
        await req.redis.del(key);
        const setMembers = Array.isArray(value) ? value : [value];
        if (setMembers.length > 0) {
          await req.redis.sadd(key, ...setMembers.map(String));
        }
      } else if (type === 'zset') {
        await req.redis.del(key);
        if (Array.isArray(value) && value.length > 0) {
          const zargs = [];
          for (const item of value) {
            const score = typeof item === 'object' && item !== null ? Number(item.score || 0) : 0;
            const member = typeof item === 'object' && item !== null ? String(item.member || '') : String(item);
            zargs.push(score, member);
          }
          if (zargs.length > 0) {
            await req.redis.zadd(key, ...zargs);
          }
        }
      }
    }

    // Apply or update TTL
    if (ttl !== undefined && ttl !== null) {
      const numTtl = Number(ttl);
      if (numTtl === -1) {
        await req.redis.persist(key);
      } else if (numTtl > 0) {
        await req.redis.expire(key, numTtl);
      }
    }

    const updatedTtl = await req.redis.ttl(key);
    const updatedType = await req.redis.type(key);

    res.json({
      success: true,
      message: `Key "${key}" saved successfully.`,
      key,
      type: updatedType,
      ttl: updatedTtl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

router.put('/keys/:key', ensureRedis, handleSetKey);
router.post('/keys', ensureRedis, handleSetKey);

/**
 * DELETE /api/redis/keys/:key
 * Deletes the specified key from Redis.
 */
router.delete('/keys/:key', ensureRedis, async (req, res) => {
  try {
    const key = req.params.key;
    const deletedCount = await req.redis.del(key);

    res.json({
      success: true,
      deleted: deletedCount > 0,
      message: deletedCount > 0 ? `Key "${key}" was removed.` : `Key "${key}" was not found.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// C. TERMINAL & MAINTENANCE
// ----------------------------------------------------
/**
 * POST /api/redis/flush
 * Flushes current database (FLUSHDB) or all databases (FLUSHALL).
 */
router.post('/flush', ensureRedis, async (req, res) => {
  try {
    const target = (req.query.target || req.body?.target || 'db').toLowerCase();

    if (target === 'all') {
      await req.redis.flushall();
    } else {
      await req.redis.flushdb();
    }

    auditLogger.logEvent({
      action: 'REDIS_FLUSH',
      user: req.user?.username || 'system',
      ip: req.clientIp || req.ip,
      userAgent: req.headers['user-agent'],
      targetResource: target === 'all' ? 'FLUSHALL' : 'FLUSHDB',
      payload: { target },
      severity: 'WARNING'
    });

    res.json({
      success: true,
      message: target === 'all' ? 'All Redis databases flushed.' : 'Current Redis database flushed.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/redis/cli
 * Executes a raw command string through redis.call(cmd, ...args).
 */
router.post('/cli', ensureRedis, async (req, res) => {
  try {
    const rawCmd = (req.body?.command || req.query.command || '').trim();
    if (!rawCmd) {
      return res.status(400).json({ success: false, error: 'Command string is required.' });
    }

    const tokens = parseCommandLine(rawCmd);
    if (tokens.length === 0) {
      return res.status(400).json({ success: false, error: 'Command cannot be empty.' });
    }

    const [cmd, ...args] = tokens;
    const result = await req.redis.call(cmd.toLowerCase(), ...args);

    res.json({
      success: true,
      command: rawCmd,
      output: result
    });
  } catch (err) {
    // Return friendly error response for CLI terminal display
    res.json({
      success: false,
      command: req.body?.command || '',
      error: err.message || String(err)
    });
  }
});

module.exports = router;
