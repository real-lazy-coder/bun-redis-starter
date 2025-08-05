import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/models/*.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/integration.db',
  },
});