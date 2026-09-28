const { infoToJSON, getRedisClient } = require('../redisEngine');

describe('Redis Engine & Helper Tests', () => {
  test('infoToJSON correctly parses raw INFO command string', () => {
    const mockInfo = `
# Server
redis_version:8.0.5
redis_mode:standalone
os:Linux 7.0.0 aarch64

# Memory
used_memory:1048576
used_memory_human:1.00M
used_memory_peak_human:2.50M
mem_fragmentation_ratio:1.24

# Stats
total_connections_received:42
keyspace_hits:90
keyspace_misses:10
instantaneous_ops_per_sec:15

# Keyspace
db0:keys=25,expires=5,avg_ttl=3600
`;

    const parsed = infoToJSON(mockInfo);

    expect(parsed.redis_version).toBe('8.0.5');
    expect(parsed.redis_mode).toBe('standalone');
    expect(parsed.used_memory_human).toBe('1.00M');
    expect(parsed.keyspace_hits).toBe('90');
    expect(parsed.keyspace_misses).toBe('10');
    expect(parsed.instantaneous_ops_per_sec).toBe('15');

    // Section structure
    expect(parsed.sections).toBeDefined();
    expect(parsed.sections.server.redis_version).toBe('8.0.5');
    expect(parsed.sections.memory.used_memory_peak_human).toBe('2.50M');
    expect(parsed.sections.stats.keyspace_hits).toBe('90');
    expect(parsed.sections.keyspace.db0).toBe('keys=25,expires=5,avg_ttl=3600');
  });

  test('infoToJSON handles empty or invalid input safely', () => {
    expect(infoToJSON(null)).toEqual({});
    expect(infoToJSON('')).toEqual({});
    expect(infoToJSON(undefined)).toEqual({});
  });

  test('getRedisClient connects or returns client/null gracefully', async () => {
    const client = await getRedisClient();
    if (client) {
      const ping = await client.ping();
      expect(ping).toBe('PONG');
    }
  });
});
