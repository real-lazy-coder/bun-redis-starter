import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// External API Configurations
export const externalApiConfigs = sqliteTable('external_api_configs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'rest', 'graphql', 'soap', etc.
  baseUrl: text('base_url').notNull(),
  authType: text('auth_type').notNull(), // 'none', 'bearer', 'basic', 'api_key', 'oauth2'
  authConfig: text('auth_config', { mode: 'json' }).$type<Record<string, any>>(),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),
  timeout: integer('timeout').default(30000),
  retryAttempts: integer('retry_attempts').default(3),
  retryDelay: integer('retry_delay').default(1000),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  healthCheckUrl: text('health_check_url'),
  healthCheckInterval: integer('health_check_interval').default(300000), // 5 minutes
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Integration Requests Log
export const integrationRequests = sqliteTable('integration_requests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  apiConfigId: text('api_config_id').notNull().references(() => externalApiConfigs.id),
  method: text('method').notNull(),
  url: text('url').notNull(),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),
  requestBody: text('request_body'),
  responseStatus: integer('response_status'),
  responseHeaders: text('response_headers', { mode: 'json' }).$type<Record<string, string>>(),
  responseBody: text('response_body'),
  duration: integer('duration'), // Response time in milliseconds
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  correlationId: text('correlation_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Webhook Configurations
export const webhookConfigs = sqliteTable('webhook_configs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'),
  events: text('events', { mode: 'json' }).$type<string[]>().notNull(),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  validateSignature: integer('validate_signature', { mode: 'boolean' }).default(true),
  timeout: integer('timeout').default(30000),
  retryAttempts: integer('retry_attempts').default(3),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Webhook Deliveries Log
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  webhookConfigId: text('webhook_config_id').notNull().references(() => webhookConfigs.id),
  eventType: text('event_type').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, any>>().notNull(),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  duration: integer('duration'),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  deliveredAt: text('delivered_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// API Health Checks
export const apiHealthChecks = sqliteTable('api_health_checks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  apiConfigId: text('api_config_id').notNull().references(() => externalApiConfigs.id),
  status: text('status').notNull(), // 'up', 'down', 'degraded'
  responseTime: integer('response_time'),
  statusCode: integer('status_code'),
  error: text('error'),
  checkedAt: text('checked_at').default(sql`CURRENT_TIMESTAMP`),
});