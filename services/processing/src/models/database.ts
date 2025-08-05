import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Workflow table schema
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['active', 'inactive', 'draft'] }).notNull().default('draft'),
  steps: text('steps').notNull(), // JSON array of workflow steps
  triggers: text('triggers').notNull(), // JSON array of workflow triggers
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  createdBy: text('created_by').notNull(),
});

// Workflow executions table
export const workflowExecutions = sqliteTable('workflow_executions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  startedAt: text('started_at').notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
  error: text('error'),
  results: text('results').notNull().default('{}'), // JSON object
  context: text('context').notNull().default('{}'), // JSON object
  triggeredBy: text('triggered_by').notNull(),
});

// Database setup
const sqlite = new Database('./data/processing.db');
export const db = drizzle(sqlite);

// Ensure data directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync('./data', { recursive: true });
} catch {
  // Directory already exists
}

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;