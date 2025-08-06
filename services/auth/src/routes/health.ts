import { Hono } from 'hono';
import type { Context } from 'hono';
import config from '../config';
import { performHealthCheck } from 'shared-monitoring';

const health = new Hono();

// Health check endpoint
health.get('/', async (c: Context) => {
  try {
    const uptime = Math.floor(process.uptime());
    const healthCheck = await performHealthCheck();
    
    const response = {
      service: config.name,
      version: config.version,
      status: healthCheck.status,
      uptime: uptime,
      timestamp: healthCheck.timestamp,
      dependencies: healthCheck.checks,
    };

    // Return 503 if unhealthy
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    return c.json(response, statusCode);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Health check error');
    
    return c.json({
      service: config.name,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    }, 503);
  }
});

export default health;