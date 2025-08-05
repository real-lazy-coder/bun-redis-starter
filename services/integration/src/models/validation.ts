import { z } from 'zod';

// External API Config Schemas
export const CreateApiConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['rest', 'graphql', 'soap']),
  baseUrl: z.string().url(),
  authType: z.enum(['none', 'bearer', 'basic', 'api_key', 'oauth2']),
  authConfig: z.record(z.any()).optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().positive().optional(),
  retryAttempts: z.number().min(0).max(10).optional(),
  retryDelay: z.number().positive().optional(),
  healthCheckUrl: z.string().url().optional(),
  healthCheckInterval: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateApiConfigSchema = CreateApiConfigSchema.partial();

export type CreateApiConfigDto = z.infer<typeof CreateApiConfigSchema>;
export type UpdateApiConfigDto = z.infer<typeof UpdateApiConfigSchema>;

// Webhook Config Schemas
export const CreateWebhookConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).min(1),
  headers: z.record(z.string()).optional(),
  validateSignature: z.boolean().optional(),
  timeout: z.number().positive().optional(),
  retryAttempts: z.number().min(0).max(10).optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateWebhookConfigSchema = CreateWebhookConfigSchema.partial();

export type CreateWebhookConfigDto = z.infer<typeof CreateWebhookConfigSchema>;
export type UpdateWebhookConfigDto = z.infer<typeof UpdateWebhookConfigSchema>;

// API Request Schema
export const ApiRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  endpoint: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  timeout: z.number().positive().optional(),
  correlationId: z.string().optional(),
});

export type ApiRequestDto = z.infer<typeof ApiRequestSchema>;

// Webhook Event Schema
export const WebhookEventSchema = z.object({
  type: z.string(),
  data: z.record(z.any()),
  timestamp: z.string().optional(),
  correlationId: z.string().optional(),
});

export type WebhookEventDto = z.infer<typeof WebhookEventSchema>;