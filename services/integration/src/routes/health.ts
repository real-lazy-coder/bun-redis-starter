import { Hono } from 'hono';

const healthRoutes = new Hono();

let startTime = Date.now();

healthRoutes.get('/', async (c) => {
  const uptime = Date.now() - startTime;
  
  // Basic health check
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime / 1000),
    version: '1.0.0',
    dependencies: {
      redis: { status: 'up' },
      database: { status: 'up' },
    },
  };

  // TODO: Add actual dependency checks
  try {
    // Check Redis connection
    // Check database connection
    return c.json(health);
  } catch (error) {
    return c.json({
      ...health,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 503);
  }
});

export default healthRoutes;