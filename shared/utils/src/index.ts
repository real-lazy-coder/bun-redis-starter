import pino from 'pino';
import jwt, { SignOptions } from 'jsonwebtoken';

// Local type definitions to avoid circular dependency
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

interface ApiError {
  code: string;
  message: string;
  details?: any;
}

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  dependencies: {
    [key: string]: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
  };
}

// Logger utility
export const createLogger = (serviceName: string, level: string = 'info', pretty: boolean = true) => {
  return pino({
    name: serviceName,
    level,
    ...(pretty && {
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
};

// Response utilities
export const createSuccessResponse = <T>(data: T, message?: string): ApiResponse<T> => {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
};

export const createErrorResponse = (error: string | ApiError, message?: string): ApiResponse => {
  return {
    success: false,
    error: typeof error === 'string' ? error : error.message,
    message,
    timestamp: new Date().toISOString(),
  };
};

// JWT utilities
export const generateAccessToken = (payload: string | object, secret: string, expiresIn: string | number = '1h'): string => {
  const options: SignOptions = { expiresIn: expiresIn as any };
  return jwt.sign(payload, secret, options);
};

export const generateRefreshToken = (payload: string | object, secret: string, expiresIn: string | number = '7d'): string => {
  const options: SignOptions = { expiresIn: expiresIn as any };
  return jwt.sign(payload, secret, options);
};

export const verifyToken = (token: string, secret: string): any => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Validation utilities
export const validateSchema = <T>(schema: any, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation error: ${result.error.message}`);
  }
  return result.data;
};

// Error handling utilities
export const createApiError = (code: string, message: string, details?: any): ApiError => {
  return { code, message, details };
};

export const handleAsyncError = (fn: Function) => {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw error;
    }
  };
};

// Health check utilities
export const createHealthCheck = async (
  serviceName: string,
  version: string,
  dependencies: { [key: string]: () => Promise<{ status: 'up' | 'down'; responseTime?: number; error?: string }> }
): Promise<HealthCheck> => {
  const startTime = Date.now();
  const dependencyChecks: HealthCheck['dependencies'] = {};
  
  for (const [name, check] of Object.entries(dependencies)) {
    try {
      const checkStart = Date.now();
      const result = await check();
      dependencyChecks[name] = {
        ...result,
        responseTime: Date.now() - checkStart,
      };
    } catch (error) {
      dependencyChecks[name] = {
        status: 'down' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  const allHealthy = Object.values(dependencyChecks).every((dep: any) => dep.status === 'up');
  const someUnhealthy = Object.values(dependencyChecks).some((dep: any) => dep.status === 'down');

  return {
    status: allHealthy ? 'healthy' : someUnhealthy ? 'unhealthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    version,
    dependencies: dependencyChecks,
  };
};

// Utility functions
export const generateId = (): string => {
  return crypto.randomUUID();
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const parseEnvPort = (port: string | undefined, defaultPort: number): number => {
  if (!port) return defaultPort;
  const parsed = parseInt(port, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return parsed;
};

export const parseEnvBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

// Date utilities
export const formatTimestamp = (date: Date = new Date()): string => {
  return date.toISOString();
};

export const parseTimestamp = (timestamp: string): Date => {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return date;
};

// Object utilities
export const pick = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
};

export const omit = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj } as Omit<T, K>;
  for (const key of keys) {
    delete (result as any)[key];
  }
  return result;
};

// Export event bus
export * from './eventBus';