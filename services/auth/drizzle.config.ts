import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/models/database.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/auth.db',
  },
  verbose: true,
  strict: true,
});