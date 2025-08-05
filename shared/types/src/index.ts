import { z } from 'zod';

// Common API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// Health Check Types
export interface HealthCheck {
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

// Metrics Types
export interface ServiceMetrics {
  requests: {
    total: number;
    perSecond: number;
    averageResponseTime: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    percentage: number;
  };
  database: {
    connections: number;
    queries: number;
    averageQueryTime: number;
  };
}

// User Types
export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(['user', 'admin']).default('user'),
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// Data Entity Types
export const CreateEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  data: z.record(z.any()),
  metadata: z.record(z.string()).optional(),
});

export const UpdateEntitySchema = CreateEntitySchema.partial();

export type CreateEntityDto = z.infer<typeof CreateEntitySchema>;
export type UpdateEntityDto = z.infer<typeof UpdateEntitySchema>;

export interface Entity {
  id: string;
  name: string;
  type: string;
  data: Record<string, any>;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Workflow Types
export const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.any()),
    nextSteps: z.array(z.string()).optional(),
  })),
  triggers: z.array(z.object({
    type: z.enum(['manual', 'schedule', 'event']),
    config: z.record(z.any()),
  })),
});

export const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

export type CreateWorkflowDto = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflowDto = z.infer<typeof UpdateWorkflowSchema>;

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'draft';
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, any>;
  nextSteps?: string[];
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event';
  config: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  error?: string;
  results: Record<string, any>;
  context: Record<string, any>;
}

// Event Types
export interface Event {
  id: string;
  type: string;
  source: string;
  data: Record<string, any>;
  timestamp: string;
  correlationId?: string;
}

// Service Configuration Types
export interface ServiceConfig {
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