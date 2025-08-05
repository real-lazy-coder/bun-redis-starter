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

// Rate limiting middleware (simple in-memory implementation)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context) => string;
}) => {
  const { windowMs, maxRequests, keyGenerator = (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown' } = options;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    
    const record = requestCounts.get(key);
    
    if (!record || now > record.resetTime) {
      requestCounts.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return await next();
    }

    if (record.count >= maxRequests) {
      return c.json(createErrorResponse('Too many requests'), 429);
    }

    record.count++;
    await next();
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