// Local type definitions to avoid circular dependencies
interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Entity {
  id: string;
  name: string;
  type: string;
  data: Record<string, any>;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface Workflow {
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

interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, any>;
  nextSteps?: string[];
}

interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event';
  config: Record<string, any>;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

const generateId = (): string => {
  return crypto.randomUUID();
};

// Test data factories
export const createTestUser = (overrides: Partial<User> = {}): User => {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

export const createTestEntity = (overrides: Partial<Entity> = {}): Entity => {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: 'Test Entity',
    type: 'test',
    data: { test: true },
    metadata: { env: 'test' },
    createdAt: now,
    updatedAt: now,
    createdBy: generateId(),
    ...overrides,
  };
};

export const createTestWorkflow = (overrides: Partial<Workflow> = {}): Workflow => {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: 'Test Workflow',
    description: 'A test workflow',
    status: 'active',
    steps: [
      {
        id: generateId(),
        type: 'start',
        config: {},
        nextSteps: [],
      },
    ],
    triggers: [
      {
        type: 'manual',
        config: {},
      },
    ],
    createdAt: now,
    updatedAt: now,
    createdBy: generateId(),
    ...overrides,
  };
};

// HTTP test utilities
export const testRequest = async (
  url: string,
  options: RequestInit = {}
): Promise<{ response: Response; body: any }> => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return { response, body };
};

export const testGet = (url: string, headers: Record<string, string> = {}) => {
  return testRequest(url, { method: 'GET', headers });
};

export const testPost = (url: string, data: any, headers: Record<string, string> = {}) => {
  return testRequest(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers,
  });
};

export const testPut = (url: string, data: any, headers: Record<string, string> = {}) => {
  return testRequest(url, {
    method: 'PUT',
    body: JSON.stringify(data),
    headers,
  });
};

export const testDelete = (url: string, headers: Record<string, string> = {}) => {
  return testRequest(url, { method: 'DELETE', headers });
};

// Assertion utilities (using Bun's test framework)
export const expectSuccess = (response: ApiResponse, expectedData?: any) => {
  if (!response.success) {
    throw new Error(`Expected success but got error: ${response.error}`);
  }
  if (expectedData !== undefined && JSON.stringify(response.data) !== JSON.stringify(expectedData)) {
    throw new Error(`Expected data ${JSON.stringify(expectedData)} but got ${JSON.stringify(response.data)}`);
  }
};

export const expectError = (response: ApiResponse, expectedError?: string) => {
  if (response.success) {
    throw new Error(`Expected error but got success with data: ${JSON.stringify(response.data)}`);
  }
  if (expectedError && response.error !== expectedError) {
    throw new Error(`Expected error "${expectedError}" but got "${response.error}"`);
  }
};

export const expectValidationError = (response: ApiResponse) => {
  if (response.success) {
    throw new Error(`Expected validation error but got success`);
  }
  if (!response.error?.includes('Validation error')) {
    throw new Error(`Expected validation error but got: ${response.error}`);
  }
};

// Database test utilities
export const createTestDatabase = () => {
  const Database = require('bun:sqlite');
  return new Database(':memory:');
};

export const cleanupTestDatabase = (db: any) => {
  db.close();
};

// Mock utilities
export const createMockLogger = () => {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    trace: () => {},
    child: () => createMockLogger(),
  };
};

export const createMockRedisClient = () => {
  const store = new Map<string, string>();
  
  return {
    get: (key: string) => store.get(key) || null,
    set: (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    },
    exists: (key: string) => store.has(key) ? 1 : 0,
    expire: () => Promise.resolve(1),
    keys: (pattern: string) => {
      // Simple pattern matching for testing
      if (pattern === '*') {
        return Array.from(store.keys());
      }
      return Array.from(store.keys()).filter(key => key.includes(pattern.replace('*', '')));
    },
    flushall: () => {
      store.clear();
      return 'OK';
    },
    publish: () => Promise.resolve(1),
    subscribe: () => {},
    unsubscribe: () => {},
    quit: () => Promise.resolve('OK'),
  };
};

// Test environment utilities
export const setupTestEnvironment = () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_SECRET = 'test-secret';
  process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use test database
};

export const teardownTestEnvironment = () => {
  // Clean up test environment
  delete process.env.NODE_ENV;
  delete process.env.LOG_LEVEL;
  delete process.env.JWT_SECRET;
  delete process.env.REDIS_URL;
};

// Timing utilities
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const waitForCondition = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await waitFor(interval);
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Integration test utilities
export const startTestServer = async (port: number, app: any): Promise<{ server: any; url: string }> => {
  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });
  
  const url = `http://localhost:${port}`;
  
  // Wait for server to be ready
  await waitForCondition(async () => {
    try {
      const response = await fetch(`${url}/health`);
      return response.ok;
    } catch {
      return false;
    }
  });
  
  return { server, url };
};

export const stopTestServer = (server: any) => {
  server.stop();
};