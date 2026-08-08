import Redis from 'ioredis';
import { createLogger } from './logger';

const logger = createLogger('redis');

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
}

export async function setCache(key: string, value: string, expirySeconds?: number): Promise<void> {
  const client = getRedisClient();
  if (expirySeconds) {
    await client.setex(key, expirySeconds, value);
  } else {
    await client.set(key, value);
  }
}

export async function getCache(key: string): Promise<string | null> {
  const client = getRedisClient();
  return client.get(key);
}

export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

export async function incrementWithExpiry(key: string, expirySeconds: number): Promise<number> {
  const client = getRedisClient();
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, expirySeconds);
  }
  return count;
}
