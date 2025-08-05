import { Hono } from 'hono';
import type { Context } from 'hono';
import config from '../config';
import { getServiceMetrics, getPrometheusMetrics } from 'shared-monitoring';

const metrics = new Hono();

// JSON metrics endpoint
metrics.get('/', async (c: Context) => {
  try {
    const serviceMetrics = await getServiceMetrics();
    
    const response = {
      service: config.name,
      version: config.version,
      ...serviceMetrics,
    };

    return c.json(response);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Metrics error');
    
    return c.json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// Prometheus metrics endpoint
metrics.get('/prometheus', async (c: Context) => {
  try {
    const prometheusMetrics = await getPrometheusMetrics();
    
    c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.text(prometheusMetrics);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Prometheus metrics error');
    
    return c.text('# Error collecting metrics\n', 500);
  }
});

export default metrics;