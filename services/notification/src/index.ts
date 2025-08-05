import { Hono } from 'hono';
import pino from 'pino';
import config from './config';
import healthRoutes from './routes/health';
import metricsRoutes from './routes/metrics';
import notificationRoutes from './routes/notifications';
import templateRoutes from './routes/templates';
import preferencesRoutes from './routes/preferences';

// Initialize logger
const logger = pino({
  name: config.name,
  level: config.logging.level,
  ...(config.logging.pretty && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: true,
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Initialize Hono app
const app = new Hono();

// Basic middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  
  // Store logger reference for access in routes
  (c as any).logger = logger;

  logger.info({ method, url }, 'Request started');
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  logger.info({ method, url, status, duration }, 'Request completed');
});

// Error handling
app.use('*', async (c, next) => {
  try {
    await next();
  } catch (error) {
    logger.error(error, 'Request error');
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// CORS
app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (origin && config.cors.origin.includes(origin)) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
  }
  
  if (config.cors.credentials) {
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
});

// Security Headers
app.use('*', async (c, next) => {
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
});

// Routes
app.route('/health', healthRoutes);
app.route('/metrics', metricsRoutes);
app.route('/notifications', notificationRoutes);
app.route('/templates', templateRoutes);
app.route('/preferences', preferencesRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: config.name,
    version: config.version,
    status: 'running',
    timestamp: new Date().toISOString(),
    capabilities: [
      'Multi-channel notifications (Email, SMS, Push)',
      'Template management with variable substitution',
      'User preference management',
      'Notification scheduling and queuing',
      'Batch notification processing',
      'Delivery tracking and history',
      'Rate limiting per channel',
    ],
    providers: {
      email: config.providers.email.type,
      sms: config.providers.sms.type,
      push: config.providers.push.type,
    },
  });
});

// Start server
const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

logger.info({
  port: config.port,
  host: config.host,
  pid: process.pid,
}, `🚀 ${config.name} v${config.version} is running!`);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  server.stop();
  process.exit(0);
});

export default app;