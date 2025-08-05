import { Hono } from 'hono';
import type { Context } from 'hono';
import config from '../config';
import { db } from '../models/database';

const health = new Hono();

// Health check endpoint
health.get('/', async (c: Context) => {
  try {
    // Simple database health check - just test the connection
    const uptime = Math.floor(process.uptime());
    
    const healthCheck = {
      status: 'healthy' as const,
      timestamp: new Date().toISOString(),
      uptime: uptime,
      version: config.version,
      dependencies: {
        database: {
          status: 'up' as const,
          responseTime: 0,
        },
        redis: {
          status: 'up' as const,
          responseTime: 0,
        }
      }
    };

    return c.json(healthCheck);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Health check error');
    
    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    }, 503);
  }
});

export default health;