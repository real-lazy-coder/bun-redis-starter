import type { Context, Next } from 'hono';
import type { Logger } from 'pino';

// Local utility functions to avoid circular dependencies
const createErrorResponse = (error: string, message?: string) => {
  return {
    success: false,
    error,
    message,
    timestamp: new Date().toISOString(),
  };
};

const verifyToken = (token: string, secret: string): any => {
  const jwt = require('jsonwebtoken');
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Error handling middleware
export const errorHandler = () => {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      const logger = c.get('logger') as Logger;
      logger.error(error, 'Request error');

      const errorResponse = createErrorResponse(
        error instanceof Error ? error.message : 'Internal server error'
      );

      return c.json(errorResponse, 500);
    }
  };
};

// Request logging middleware
export const requestLogger = (logger: Logger) => {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = c.req.method;
    const url = c.req.url;
    const userAgent = c.req.header('user-agent') || '';
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

    // Set logger in context for use in other middleware/handlers
    c.set('logger', logger);

    logger.info({
      method,
      url,
      userAgent,
      ip,
    }, 'Request started');

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    logger.info({
      method,
      url,
      status,
      duration,
      ip,
    }, 'Request completed');
  };
};

// CORS middleware
export const cors = (options: {
  origin: string[];
  credentials: boolean;
}) => {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    
    if (origin && options.origin.includes(origin)) {
      c.res.headers.set('Access-Control-Allow-Origin', origin);
    } else if (options.origin.includes('*')) {
      c.res.headers.set('Access-Control-Allow-Origin', '*');
    }

    if (options.credentials) {
      c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }

    await next();
  };
};

// Production security headers middleware
export const securityHeaders = () => {
  return async (c: Context, next: Next) => {
    // Security headers for production
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-XSS-Protection', '1; mode=block');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Content Security Policy
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
    c.res.headers.set('Content-Security-Policy', csp);
    
    // HSTS in production
    if (process.env.NODE_ENV === 'production') {
      c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    await next();
  };
};

// JWT Authentication middleware
export const jwtAuth = (secret: string, options: { optional?: boolean } = {}) => {
  return async (c: Context, next: Next) => {
    const authorization = c.req.header('authorization');
    
    if (!authorization) {
      if (options.optional) {
        return await next();
      }
      return c.json(createErrorResponse('Authorization header required'), 401);
    }

    const token = authorization.replace('Bearer ', '');
    
    try {
      const payload = verifyToken(token, secret);
      c.set('user', payload);
      await next();
    } catch (error) {
      if (options.optional) {
        return await next();
      }
      return c.json(createErrorResponse('Invalid token'), 401);
    }
  };
};

// Role-based authorization middleware
export const requireRole = (roles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json(createErrorResponse('Authentication required'), 401);
    }

    if (!roles.includes(user.role)) {
      return c.json(createErrorResponse('Insufficient permissions'), 403);
    }

    await next();
  };
};

// Request validation middleware
export const validateBody = <T>(schema: any) => {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validatedBody = schema.parse(body);
      c.set('validatedBody', validatedBody);
      await next();
    } catch (error) {
      const logger = c.get('logger') as Logger;
      logger.error(error, 'Request validation error');
      return c.json(createErrorResponse('Validation error', error instanceof Error ? error.message : 'Invalid request body'), 400);
    }
  };
};

export const validateQuery = <T>(schema: any) => {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      const validatedQuery = schema.parse(query);
      c.set('validatedQuery', validatedQuery);
      await next();
    } catch (error) {
      const logger = c.get('logger') as Logger;
      logger.error(error, 'Query validation error');
      return c.json(createErrorResponse('Validation error', error instanceof Error ? error.message : 'Invalid query parameters'), 400);
    }
  };
};

// Enhanced rate limiting middleware with Redis support
interface RateLimitStore {
  get(key: string): Promise<{ count: number; resetTime: number } | null>;
  set(key: string, value: { count: number; resetTime: number }, ttl: number): Promise<void>;
}

// In-memory fallback store
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  async get(key: string) {
    const record = this.store.get(key);
    if (!record || Date.now() > record.resetTime) {
      this.store.delete(key);
      return null;
    }
    return record;
  }

  async set(key: string, value: { count: number; resetTime: number }, ttl: number) {
    this.store.set(key, value);
    // Cleanup expired entries
    setTimeout(() => {
      const record = this.store.get(key);
      if (record && Date.now() > record.resetTime) {
        this.store.delete(key);
      }
    }, ttl);
  }
}

const defaultStore = new MemoryRateLimitStore();

export const rateLimit = (options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context) => string;
  store?: RateLimitStore;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
    store = defaultStore,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  return async (c: Context, next: Next) => {
    const key = `rate_limit:${keyGenerator(c)}`;
    const now = Date.now();
    
    let record = await store.get(key);
    
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    if (record.count >= maxRequests) {
      c.res.headers.set('X-RateLimit-Limit', maxRequests.toString());
      c.res.headers.set('X-RateLimit-Remaining', '0');
      c.res.headers.set('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
      
      return c.json(createErrorResponse('Too many requests'), 429);
    }

    // Execute the request
    await next();

    // Check if we should count this request
    const shouldCount = !(
      (skipSuccessfulRequests && c.res.status < 400) ||
      (skipFailedRequests && c.res.status >= 400)
    );

    if (shouldCount) {
      record.count++;
      await store.set(key, record, windowMs);
    }

    // Set rate limit headers
    c.res.headers.set('X-RateLimit-Limit', maxRequests.toString());
    c.res.headers.set('X-RateLimit-Remaining', Math.max(maxRequests - record.count, 0).toString());
    c.res.headers.set('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
  };
};

// Content type middleware
export const requireContentType = (contentType: string) => {
  return async (c: Context, next: Next) => {
    const requestContentType = c.req.header('content-type');
    
    if (!requestContentType || !requestContentType.includes(contentType)) {
      return c.json(createErrorResponse(`Content-Type must be ${contentType}`), 400);
    }

    await next();
  };
};

// Request timeout middleware
export const timeout = (ms: number) => {
  return async (c: Context, next: Next) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), ms);
    });

    try {
      await Promise.race([next(), timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Request timeout') {
        return c.json(createErrorResponse('Request timeout'), 408);
      }
      throw error;
    }
  };
};

// Input sanitization middleware
export const sanitizeInput = () => {
  return async (c: Context, next: Next) => {
    // Basic XSS protection - strip potentially dangerous characters
    const sanitizeString = (str: string): string => {
      return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    };

    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return sanitizeString(obj);
      } else if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      } else if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }
      return obj;
    };

    // Sanitize request body if it exists
    try {
      const contentType = c.req.header('content-type');
      if (contentType && contentType.includes('application/json')) {
        const originalJson = c.req.json;
        c.req.json = async () => {
          const body = await originalJson.call(c.req);
          return sanitizeObject(body);
        };
      }
    } catch (error) {
      // Continue without sanitization if there's an issue
    }

    await next();
  };
};