// Local type definitions to avoid import issues
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
}

const config: ServiceConfig = {
  name: 'processing-service',
  version: '1.0.0',
  port: parseInt(process.env.PORT || '3003', 10),
  host: process.env.HOST || '0.0.0.0',
  database: {
    type: 'sqlite',
    path: './data/processing.db',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '2', 10),
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
};

export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
};

// Service URLs for inter-service communication
export const serviceUrls = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  data: process.env.DATA_SERVICE_URL || 'http://localhost:3002',
};

export default config;