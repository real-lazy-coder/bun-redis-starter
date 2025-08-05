import type { Context, Next } from 'hono';
import type { Logger } from 'pino';

// Metrics collection interface
interface ServiceMetrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    perSecond: number;
    averageResponseTime: number;
    responseTimeP95: number;
    responseTimeP99: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    rss: number;
    external: number;
  };
  cpu: {
    percentage: number;
    userTime: number;
    systemTime: number;
  };
  dependencies: {
    database: {
      status: 'up' | 'down';
      responseTime: number;
      connections: number;
      queries: number;
      averageQueryTime: number;
    };
    redis: {
      status: 'up' | 'down';
      responseTime: number;
      connections: number;
    };
  };
  uptime: number;
  timestamp: string;
}

// Global metrics store
class MetricsCollector {
  private requests: Array<{ timestamp: number; duration: number; success: boolean }> = [];
  private queryTimes: Array<{ timestamp: number; duration: number }> = [];
  private startTime = Date.now();
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();

  // Add request metrics
  addRequest(duration: number, success: boolean) {
    const now = Date.now();
    this.requests.push({ timestamp: now, duration, success });
    
    // Keep only last 1000 requests or last hour
    const oneHourAgo = now - 60 * 60 * 1000;
    this.requests = this.requests.filter(r => 
      r.timestamp > oneHourAgo && this.requests.indexOf(r) >= this.requests.length - 1000
    );
  }

  // Add database query metrics
  addQuery(duration: number) {
    const now = Date.now();
    this.queryTimes.push({ timestamp: now, duration });
    
    // Keep only last 500 queries or last hour
    const oneHourAgo = now - 60 * 60 * 1000;
    this.queryTimes = this.queryTimes.filter(q => 
      q.timestamp > oneHourAgo && this.queryTimes.indexOf(q) >= this.queryTimes.length - 500
    );
  }

  // Calculate requests per second
  private getRequestsPerSecond(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const recentRequests = this.requests.filter(r => r.timestamp > oneMinuteAgo);
    return Math.round(recentRequests.length / 60);
  }

  // Calculate percentiles
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)] || 0;
  }

  // Get CPU usage percentage
  private getCpuUsage(): number {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastCpuTime;
    
    if (timeDiff > 0) {
      const totalUsage = (currentUsage.user + currentUsage.system) / 1000; // Convert to ms
      const percentage = (totalUsage / timeDiff) * 100;
      
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuTime = currentTime;
      
      return Math.min(Math.round(percentage), 100);
    }
    
    return 0;
  }

  // Check dependency health
  async checkDependencyHealth(): Promise<ServiceMetrics['dependencies']> {
    const dependencies: ServiceMetrics['dependencies'] = {
      database: {
        status: 'up',
        responseTime: 0,
        connections: 1,
        queries: this.queryTimes.length,
        averageQueryTime: 0,
      },
      redis: {
        status: 'up',
        responseTime: 0,
        connections: 1,
      },
    };

    // Database health check
    try {
      const start = Date.now();
      // This would be replaced with actual database ping in real implementation
      await new Promise(resolve => setTimeout(resolve, 1)); // Simulate DB check
      dependencies.database.responseTime = Date.now() - start;
      
      if (this.queryTimes.length > 0) {
        const totalTime = this.queryTimes.reduce((sum, q) => sum + q.duration, 0);
        dependencies.database.averageQueryTime = Math.round(totalTime / this.queryTimes.length);
      }
    } catch (error) {
      dependencies.database.status = 'down';
    }

    // Redis health check
    try {
      const start = Date.now();
      // This would be replaced with actual Redis ping in real implementation
      await new Promise(resolve => setTimeout(resolve, 1)); // Simulate Redis check
      dependencies.redis.responseTime = Date.now() - start;
    } catch (error) {
      dependencies.redis.status = 'down';
    }

    return dependencies;
  }

  // Get comprehensive metrics
  async getMetrics(): Promise<ServiceMetrics> {
    const memoryUsage = process.memoryUsage();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    const successfulRequests = this.requests.filter(r => r.success);
    const failedRequests = this.requests.filter(r => !r.success);
    const requestDurations = this.requests.map(r => r.duration);
    
    const dependencies = await this.checkDependencyHealth();

    return {
      requests: {
        total: this.requests.length,
        success: successfulRequests.length,
        errors: failedRequests.length,
        perSecond: this.getRequestsPerSecond(),
        averageResponseTime: requestDurations.length > 0 
          ? Math.round(requestDurations.reduce((sum, d) => sum + d, 0) / requestDurations.length)
          : 0,
        responseTimeP95: this.calculatePercentile(requestDurations, 95),
        responseTimeP99: this.calculatePercentile(requestDurations, 99),
      },
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        rss: memoryUsage.rss,
        external: memoryUsage.external,
      },
      cpu: {
        percentage: this.getCpuUsage(),
        userTime: process.cpuUsage().user,
        systemTime: process.cpuUsage().system,
      },
      dependencies,
      uptime,
      timestamp: new Date().toISOString(),
    };
  }

  // Reset metrics (useful for testing)
  reset() {
    this.requests = [];
    this.queryTimes = [];
    this.startTime = Date.now();
  }
}

// Global metrics collector instance
const metricsCollector = new MetricsCollector();

// Metrics collection middleware
export const metricsMiddleware = () => {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    let success = true;
    
    try {
      await next();
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - start;
      metricsCollector.addRequest(duration, success);
    }
  };
};

// Database query tracking middleware (for use in database operations)
export const trackQuery = async <T>(operation: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - start;
    metricsCollector.addQuery(duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    metricsCollector.addQuery(duration);
    throw error;
  }
};

// Get metrics for endpoints
export const getServiceMetrics = async (): Promise<ServiceMetrics> => {
  return metricsCollector.getMetrics();
};

// Prometheus-style metrics export
export const getPrometheusMetrics = async (): Promise<string> => {
  const metrics = await metricsCollector.getMetrics();
  
  const lines = [
    `# HELP http_requests_total Total number of HTTP requests`,
    `# TYPE http_requests_total counter`,
    `http_requests_total{status="success"} ${metrics.requests.success}`,
    `http_requests_total{status="error"} ${metrics.requests.errors}`,
    '',
    `# HELP http_request_duration_seconds Request duration in seconds`,
    `# TYPE http_request_duration_seconds histogram`,
    `http_request_duration_seconds_sum ${metrics.requests.averageResponseTime * metrics.requests.total / 1000}`,
    `http_request_duration_seconds_count ${metrics.requests.total}`,
    '',
    `# HELP memory_usage_bytes Memory usage in bytes`,
    `# TYPE memory_usage_bytes gauge`,
    `memory_usage_bytes{type="heap_used"} ${metrics.memory.used}`,
    `memory_usage_bytes{type="heap_total"} ${metrics.memory.total}`,
    `memory_usage_bytes{type="rss"} ${metrics.memory.rss}`,
    '',
    `# HELP cpu_usage_percent CPU usage percentage`,
    `# TYPE cpu_usage_percent gauge`,
    `cpu_usage_percent ${metrics.cpu.percentage}`,
    '',
    `# HELP service_uptime_seconds Service uptime in seconds`,
    `# TYPE service_uptime_seconds gauge`,
    `service_uptime_seconds ${metrics.uptime}`,
    '',
    `# HELP dependency_status Dependency status (1=up, 0=down)`,
    `# TYPE dependency_status gauge`,
    `dependency_status{name="database"} ${metrics.dependencies.database.status === 'up' ? 1 : 0}`,
    `dependency_status{name="redis"} ${metrics.dependencies.redis.status === 'up' ? 1 : 0}`,
    '',
  ];
  
  return lines.join('\n');
};

// Health check with dependency validation
export const performHealthCheck = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  checks: Record<string, { status: 'up' | 'down'; responseTime: number }>;
  timestamp: string;
}> => {
  const dependencies = await metricsCollector.checkDependencyHealth();
  
  const checks = {
    database: {
      status: dependencies.database.status,
      responseTime: dependencies.database.responseTime,
    },
    redis: {
      status: dependencies.redis.status,
      responseTime: dependencies.redis.responseTime,
    },
  };
  
  const allHealthy = Object.values(checks).every(check => check.status === 'up');
  
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  };
};

// Export for testing
export { metricsCollector };