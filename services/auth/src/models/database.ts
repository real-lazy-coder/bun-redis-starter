import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// User table schema
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  password: text('password').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  lastLoginAt: text('last_login_at'),
  loginCount: integer('login_count').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Auth tokens table for refresh tokens
export const authTokens = sqliteTable('auth_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshToken: text('refresh_token').notNull().unique(),
  deviceInfo: text('device_info'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: text('expires_at').notNull(),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Password reset tokens
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  used: integer('used', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Email verification tokens
export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  used: integer('used', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// API Keys for service-to-service authentication
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>().default([]),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  usageCount: integer('usage_count').default(0),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// User sessions for concurrent login management
export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionToken: text('session_token').notNull().unique(),
  deviceInfo: text('device_info'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  expiresAt: text('expires_at').notNull(),
  lastActivityAt: text('last_activity_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Role-based permissions
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description'),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>().default([]),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// User role assignments (many-to-many)
export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedBy: text('assigned_by').references(() => users.id),
  assignedAt: text('assigned_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Database setup
const sqlite = new Database('./data/auth.db');
export const db = drizzle(sqlite);

// Ensure data directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync('./data', { recursive: true });
} catch {
  // Directory already exists
}

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;