import { Hono } from 'hono';

const metricsRoutes = new Hono();

// Simple in-memory metrics (in production, use proper metrics collection)
let metrics = {
  requests: {
    total: 0,
    perSecond: 0,
    averageResponseTime: 0,
  },
  notifications: {
    email: {
      sent: 0,
      failed: 0,
      queued: 0,
      averageDeliveryTime: 0,
    },
    sms: {
      sent: 0,
      failed: 0,
      queued: 0,
      averageDeliveryTime: 0,
    },
    push: {
      sent: 0,
      failed: 0,
      queued: 0,
      averageDeliveryTime: 0,
    },
  },
  templates: {
    total: 0,
    byType: {
      email: 0,
      sms: 0,
      push: 0,
    },
  },
};

metricsRoutes.get('/', async (c) => {
  const memUsage = process.memoryUsage();
  
  return c.json({
    ...metrics,
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    cpu: {
      percentage: 0, // TODO: Implement CPU usage monitoring
    },
    queues: {
      // TODO: Get actual queue lengths from Redis
      email: { high: 0, normal: 0, low: 0 },
      sms: { high: 0, normal: 0, low: 0 },
      push: { high: 0, normal: 0, low: 0 },
    },
  });
});

export default metricsRoutes;