import { db, users, authTokens } from './src/models/database';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

console.log('Creating database tables...');

// Create tables using SQL since drizzle-kit is not working
const createUserTable = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const createAuthTokensTable = `
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
`;

try {
  await db.run(createUserTable);
  await db.run(createAuthTokensTable);
  console.log('Database tables created successfully!');
} catch (error) {
  console.error('Error creating tables:', error);
}
