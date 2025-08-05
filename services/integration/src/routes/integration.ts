import { Hono } from 'hono';
import { ApiClientService } from '../services/apiClient';
import { CreateApiConfigSchema, UpdateApiConfigSchema, ApiRequestSchema } from '../models/validation';
import { RateLimitService } from '../services/rateLimiter';

const integrationRoutes = new Hono();
const apiClientService = new ApiClientService();
const rateLimitService = new RateLimitService();

// Middleware for rate limiting
integrationRoutes.use('*', async (c, next) => {
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const rateLimit = await rateLimitService.checkRateLimit(clientIp);

  c.res.headers.set('X-RateLimit-Limit', '100');
  c.res.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  c.res.headers.set('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

  if (!rateLimit.allowed) {
    return c.json({
      success: false,
      error: 'Rate limit exceeded',
      rateLimitReset: new Date(rateLimit.resetTime).toISOString(),
    }, 429);
  }

  await next();
});

// API Configuration Management
integrationRoutes.post('/api-configs', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = CreateApiConfigSchema.parse(body);
    
    const apiConfig = await apiClientService.createApiConfig(validatedData);
    
    return c.json({
      success: true,
      data: apiConfig,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request data',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

integrationRoutes.get('/api-configs', async (c) => {
  try {
    const apiConfigs = await apiClientService.listApiConfigs();
    
    return c.json({
      success: true,
      data: apiConfigs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve API configurations',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

integrationRoutes.get('/api-configs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const apiConfig = await apiClientService.getApiConfig(id);
    
    if (!apiConfig) {
      return c.json({
        success: false,
        error: 'API configuration not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    return c.json({
      success: true,
      data: apiConfig,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve API configuration',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

integrationRoutes.put('/api-configs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validatedData = UpdateApiConfigSchema.parse(body);
    
    const apiConfig = await apiClientService.updateApiConfig(id, validatedData);
    
    if (!apiConfig) {
      return c.json({
        success: false,
        error: 'API configuration not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    return c.json({
      success: true,
      data: apiConfig,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update API configuration',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

integrationRoutes.delete('/api-configs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await apiClientService.deleteApiConfig(id);
    
    return c.json({
      success: true,
      message: 'API configuration deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete API configuration',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// API Call Execution
integrationRoutes.post('/api-configs/:id/call', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validatedRequest = ApiRequestSchema.parse(body);
    
    // Check circuit breaker
    const circuitBreaker = await rateLimitService.checkCircuitBreaker(id);
    if (circuitBreaker.state === 'open') {
      return c.json({
        success: false,
        error: 'Service temporarily unavailable (circuit breaker open)',
        timestamp: new Date().toISOString(),
      }, 503);
    }
    
    try {
      const response = await apiClientService.makeApiCall(id, validatedRequest);
      
      // Record success for circuit breaker
      await rateLimitService.recordCircuitBreakerSuccess(id);
      
      return c.json({
        success: true,
        data: {
          status: response.status,
          headers: response.headers,
          body: response.body,
          duration: response.duration,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (apiError) {
      // Record failure for circuit breaker
      await rateLimitService.recordCircuitBreakerFailure(id);
      throw apiError;
    }
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'API call failed',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Health Check
integrationRoutes.post('/api-configs/:id/health', async (c) => {
  try {
    const id = c.req.param('id');
    const healthResult = await apiClientService.checkApiHealth(id);
    
    return c.json({
      success: true,
      data: healthResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Request History
integrationRoutes.get('/api-configs/:id/history', async (c) => {
  try {
    const id = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    
    const history = await apiClientService.getRequestHistory(id, limit);
    
    return c.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve request history',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

export default integrationRoutes;