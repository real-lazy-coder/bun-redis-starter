import { eq, desc } from 'drizzle-orm';
import { db, externalApiConfigs, integrationRequests, apiHealthChecks } from '../models';
import { CreateApiConfigDto, UpdateApiConfigDto, ApiRequestDto } from '../models/validation';
import config from '../config';
import crypto from 'crypto';

interface RequestOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  correlationId?: string;
}

interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  duration: number;
}

export class ApiClientService {
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async makeRequest(
    apiConfig: any,
    request: ApiRequestDto,
    options: RequestOptions = {}
  ): Promise<ApiResponse> {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();
    
    try {
      const url = new URL(request.endpoint, apiConfig.baseUrl).toString();
      const timeout = request.timeout || apiConfig.timeout || config.externalApis.timeout;
      
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': `${config.name}/${config.version}`,
        'X-Correlation-ID': correlationId,
        ...apiConfig.headers,
        ...request.headers,
      };

      // Add authentication headers
      if (apiConfig.authType === 'bearer' && apiConfig.authConfig?.token) {
        headers['Authorization'] = `Bearer ${apiConfig.authConfig.token}`;
      } else if (apiConfig.authType === 'basic' && apiConfig.authConfig?.username && apiConfig.authConfig?.password) {
        const credentials = Buffer.from(`${apiConfig.authConfig.username}:${apiConfig.authConfig.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (apiConfig.authType === 'api_key' && apiConfig.authConfig?.key && apiConfig.authConfig?.keyHeader) {
        headers[apiConfig.authConfig.keyHeader] = apiConfig.authConfig.key;
      }

      const requestOptions: RequestInit = {
        method: request.method,
        headers,
        signal: AbortSignal.timeout(timeout),
      };

      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        requestOptions.body = typeof request.body === 'string' 
          ? request.body 
          : JSON.stringify(request.body);
      }

      const response = await fetch(url, requestOptions);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseBody: any;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      const duration = Date.now() - startTime;

      // Log request
      await db.insert(integrationRequests).values({
        apiConfigId: apiConfig.id,
        method: request.method,
        url,
        headers: request.headers || {},
        requestBody: request.body ? JSON.stringify(request.body) : null,
        responseStatus: response.status,
        responseHeaders,
        responseBody: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
        duration,
        correlationId,
      });

      return {
        status: response.status,
        headers: responseHeaders,
        body: responseBody,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log failed request
      await db.insert(integrationRequests).values({
        apiConfigId: apiConfig.id,
        method: request.method,
        url: new URL(request.endpoint, apiConfig.baseUrl).toString(),
        headers: request.headers || {},
        requestBody: request.body ? JSON.stringify(request.body) : null,
        duration,
        error: errorMessage,
        correlationId,
      });

      throw error;
    }
  }

  async makeApiCall(
    apiConfigId: string,
    request: ApiRequestDto,
    options: RequestOptions = {}
  ): Promise<ApiResponse> {
    const apiConfig = await db.select().from(externalApiConfigs).where(eq(externalApiConfigs.id, apiConfigId)).then(rows => rows[0]);
    
    if (!apiConfig) {
      throw new Error(`API configuration not found: ${apiConfigId}`);
    }

    if (!apiConfig.isActive) {
      throw new Error(`API configuration is inactive: ${apiConfigId}`);
    }

    const maxRetries = options.retryAttempts ?? apiConfig.retryAttempts ?? config.externalApis.retryAttempts;
    const retryDelay = options.retryDelay ?? apiConfig.retryDelay ?? config.externalApis.retryDelay;

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest(apiConfig, request, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  async createApiConfig(data: CreateApiConfigDto) {
    const [apiConfig] = await db.insert(externalApiConfigs).values({
      ...data,
      updatedAt: new Date().toISOString(),
    }).returning();

    return apiConfig;
  }

  async updateApiConfig(id: string, data: UpdateApiConfigDto) {
    const [apiConfig] = await db.update(externalApiConfigs)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(externalApiConfigs.id, id))
      .returning();

    return apiConfig;
  }

  async getApiConfig(id: string) {
    return db.select().from(externalApiConfigs).where(eq(externalApiConfigs.id, id)).then(rows => rows[0]);
  }

  async listApiConfigs() {
    return db.select().from(externalApiConfigs).orderBy(desc(externalApiConfigs.createdAt));
  }

  async deleteApiConfig(id: string) {
    await db.delete(externalApiConfigs).where(eq(externalApiConfigs.id, id));
  }

  async checkApiHealth(apiConfigId: string): Promise<{ status: 'up' | 'down' | 'degraded'; responseTime?: number; error?: string }> {
    try {
      const apiConfig = await this.getApiConfig(apiConfigId);
      if (!apiConfig || !apiConfig.healthCheckUrl) {
        return { status: 'down', error: 'No health check URL configured' };
      }

      const startTime = Date.now();
      const response = await fetch(apiConfig.healthCheckUrl, {
        method: 'GET',
        headers: {
          'User-Agent': `${config.name}/${config.version}`,
        },
        signal: AbortSignal.timeout(apiConfig.timeout || config.externalApis.timeout),
      });

      const responseTime = Date.now() - startTime;
      const status = response.ok ? 'up' : 'degraded';

      // Log health check
      await db.insert(apiHealthChecks).values({
        apiConfigId,
        status,
        responseTime,
        statusCode: response.status,
      });

      return { status, responseTime };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log failed health check
      await db.insert(apiHealthChecks).values({
        apiConfigId,
        status: 'down',
        error: errorMessage,
      });

      return { status: 'down', error: errorMessage };
    }
  }

  async getRequestHistory(apiConfigId: string, limit = 50) {
    return db.select()
      .from(integrationRequests)
      .where(eq(integrationRequests.apiConfigId, apiConfigId))
      .orderBy(desc(integrationRequests.createdAt))
      .limit(limit);
  }
}