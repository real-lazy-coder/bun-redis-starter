import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Entity table schema
export const entities = sqliteTable('entities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  type: text('type').notNull(),
  data: text('data').notNull(), // JSON string
  metadata: text('metadata').notNull().default('{}'), // JSON string
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  createdBy: text('created_by').notNull(),
});

// Database setup
const sqlite = new Database('./data/data.db');
export const db = drizzle(sqlite);

// Ensure data directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync('./data', { recursive: true });
} catch {
  // Directory already exists
}

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;