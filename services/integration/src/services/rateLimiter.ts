import { createClient } from 'redis';
import config from '../config';

export class RateLimitService {
  private redisClient;

  constructor() {
    this.redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }

  async connect() {
    if (!this.redisClient.isOpen) {
      await this.redisClient.connect();
    }
  }

  async disconnect() {
    if (this.redisClient.isOpen) {
      await this.redisClient.disconnect();
    }
  }

  private getRateLimitKey(identifier: string, window: string): string {
    return `rate_limit:${identifier}:${window}`;
  }

  async checkRateLimit(
    identifier: string, // IP address, user ID, API key, etc.
    windowMs: number = config.rateLimiting.windowMs,
    maxRequests: number = config.rateLimiting.maxRequests
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    totalRequests: number;
  }> {
    await this.connect();

    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowEnd = windowStart + windowMs;
    const key = this.getRateLimitKey(identifier, windowStart.toString());

    // Use Redis transactions for atomic operations
    const multi = this.redisClient.multi();
    
    multi.incr(key);
    multi.expire(key, Math.ceil(windowMs / 1000));
    multi.ttl(key);

    const results = await multi.exec();
    const currentRequests = results[0] as number;
    const ttl = results[2] as number;

    const resetTime = ttl > 0 ? now + (ttl * 1000) : windowEnd;
    const remaining = Math.max(0, maxRequests - currentRequests);
    const allowed = currentRequests <= maxRequests;

    return {
      allowed,
      remaining,
      resetTime,
      totalRequests: currentRequests,
    };
  }

  async resetRateLimit(identifier: string): Promise<void> {
    await this.connect();
    
    const pattern = this.getRateLimitKey(identifier, '*');
    const keys = await this.redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
  }

  // Sliding window rate limiter (more precise but more resource intensive)
  async checkSlidingWindowRateLimit(
    identifier: string,
    windowMs: number = config.rateLimiting.windowMs,
    maxRequests: number = config.rateLimiting.maxRequests
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    totalRequests: number;
  }> {
    await this.connect();

    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `sliding_rate_limit:${identifier}`;

    // Remove old entries and count current requests
    const multi = this.redisClient.multi();
    multi.zRemRangeByScore(key, 0, windowStart);
    multi.zCard(key);
    multi.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
    multi.expire(key, Math.ceil(windowMs / 1000));

    const results = await multi.exec();
    const currentRequests = results[1] as number;

    const remaining = Math.max(0, maxRequests - currentRequests - 1); // -1 for the current request
    const allowed = currentRequests < maxRequests;
    const resetTime = now + windowMs;

    return {
      allowed,
      remaining,
      resetTime,
      totalRequests: currentRequests + 1,
    };
  }

  // Circuit breaker pattern for external API protection
  async checkCircuitBreaker(
    serviceId: string,
    failureThreshold: number = 5,
    recoveryTimeout: number = 60000 // 1 minute
  ): Promise<{
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime?: number;
  }> {
    await this.connect();

    const key = `circuit_breaker:${serviceId}`;
    const data = await this.redisClient.hGetAll(key);

    const failureCount = parseInt(data.failureCount || '0', 10);
    const lastFailureTime = data.lastFailureTime ? parseInt(data.lastFailureTime, 10) : undefined;
    const state = data.state || 'closed';

    const now = Date.now();

    // Check if we should transition from open to half-open
    if (state === 'open' && lastFailureTime && (now - lastFailureTime) > recoveryTimeout) {
      await this.redisClient.hSet(key, 'state', 'half-open');
      return { state: 'half-open', failureCount, lastFailureTime };
    }

    return { state: state as any, failureCount, lastFailureTime };
  }

  async recordCircuitBreakerSuccess(serviceId: string): Promise<void> {
    await this.connect();

    const key = `circuit_breaker:${serviceId}`;
    await this.redisClient.hSet(key, {
      state: 'closed',
      failureCount: '0',
    });
    await this.redisClient.hDel(key, 'lastFailureTime');
  }

  async recordCircuitBreakerFailure(
    serviceId: string,
    failureThreshold: number = 5
  ): Promise<void> {
    await this.connect();

    const key = `circuit_breaker:${serviceId}`;
    const now = Date.now();
    
    const failureCount = await this.redisClient.hIncrBy(key, 'failureCount', 1);
    await this.redisClient.hSet(key, 'lastFailureTime', now.toString());

    if (failureCount >= failureThreshold) {
      await this.redisClient.hSet(key, 'state', 'open');
    }

    await this.redisClient.expire(key, 3600); // Expire after 1 hour
  }

  // Get rate limit statistics
  async getRateLimitStats(identifier: string): Promise<{
    currentWindow: {
      requests: number;
      remaining: number;
      resetTime: number;
    };
    historical: {
      totalRequestsLast24h: number;
      averageRequestsPerHour: number;
    };
  }> {
    await this.connect();

    const now = Date.now();
    const windowMs = config.rateLimiting.windowMs;
    const maxRequests = config.rateLimiting.maxRequests;
    
    // Current window stats
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const currentKey = this.getRateLimitKey(identifier, windowStart.toString());
    const currentRequests = await this.redisClient.get(currentKey);
    const ttl = await this.redisClient.ttl(currentKey);
    
    // Historical stats (last 24 hours)
    const last24Hours = 24 * 60 * 60 * 1000;
    const windowsInDay = Math.floor(last24Hours / windowMs);
    const historicalKeys: string[] = [];
    
    for (let i = 0; i < windowsInDay; i++) {
      const windowTime = windowStart - (i * windowMs);
      historicalKeys.push(this.getRateLimitKey(identifier, windowTime.toString()));
    }

    const historicalValues = await this.redisClient.mGet(historicalKeys);
    const totalRequestsLast24h = historicalValues
      .filter((val: string | null) => val !== null)
      .reduce((sum: number, val: string | null) => sum + parseInt(val!, 10), 0);

    return {
      currentWindow: {
        requests: parseInt(currentRequests || '0', 10),
        remaining: Math.max(0, maxRequests - parseInt(currentRequests || '0', 10)),
        resetTime: ttl > 0 ? now + (ttl * 1000) : windowStart + windowMs,
      },
      historical: {
        totalRequestsLast24h,
        averageRequestsPerHour: Math.round(totalRequestsLast24h / 24),
      },
    };
  }
}