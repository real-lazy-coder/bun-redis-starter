import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/models/database.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/processing.db',
  },
  verbose: true,
  strict: true,
});