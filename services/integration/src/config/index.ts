// Configuration for Integration Service
interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  host: string;
  database: {
    type: 'sqlite';
    path: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    pretty: boolean;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimiting: {
    windowMs: number;    // Time window in milliseconds
    maxRequests: number; // Max requests per window
  };
  webhooks: {
    secretHeader: string;
    validateSignatures: boolean;
  };
  externalApis: {
    timeout: number;     // Request timeout in milliseconds
    retryAttempts: number;
    retryDelay: number;  // Base delay between retries in milliseconds
  };
}

const config: ServiceConfig = {
  name: 'integration-service',
  version: '1.0.0',
  port: parseInt(process.env.PORT || '3004', 10),
  host: process.env.HOST || '0.0.0.0',
  database: {
    type: 'sqlite',
    path: './data/integration.db',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '1', 10), // Use different DB than auth
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),    // 100 requests per window
  },
  webhooks: {
    secretHeader: process.env.WEBHOOK_SECRET_HEADER || 'x-webhook-signature',
    validateSignatures: process.env.WEBHOOK_VALIDATE_SIGNATURES !== 'false',
  },
  externalApis: {
    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),      // 30 seconds
    retryAttempts: parseInt(process.env.API_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.API_RETRY_DELAY || '1000', 10), // 1 second
  },
};

export default config;