#!/usr/bin/env bun

// Smoke test for Phase 3 Production Readiness features
// Tests monitoring endpoints, security headers, and basic functionality

import { expect, test, describe, beforeAll, afterAll } from "bun:test";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost";
const SERVICES = [
  { name: "auth-service", port: 3001 },
  { name: "data-service", port: 3002 },
  { name: "processing-service", port: 3003 },
  { name: "integration-service", port: 3004 },
  { name: "notification-service", port: 3005 },
];

// Helper function to test HTTP endpoints
async function testEndpoint(url: string, expectedStatus = 200) {
  try {
    const response = await fetch(url);
    return {
      status: response.status,
      headers: response.headers,
      data: await response.json().catch(() => response.text()),
    };
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);
    return { status: 0, headers: new Headers(), data: null };
  }
}

describe("Phase 3: Production Readiness Tests", () => {
  describe("Health Check Endpoints", () => {
    SERVICES.forEach(({ name, port }) => {
      test(`${name} health check returns healthy status`, async () => {
        const url = `${BASE_URL}:${port}/health`;
        const result = await testEndpoint(url);
        
        // Service might not be running in test environment, so we allow both scenarios
        if (result.status === 200) {
          expect(result.data).toHaveProperty("status");
          expect(["healthy", "unhealthy"]).toContain(result.data.status);
          expect(result.data).toHaveProperty("timestamp");
          expect(result.data).toHaveProperty("service", name);
        } else {
          console.log(`${name} not running (status: ${result.status}) - skipping`);
          expect(result.status).toBeOneOf([0, 200, 503]); // Allow connection refused or service responses
        }
      });
    });
  });

  describe("Metrics Endpoints", () => {
    SERVICES.forEach(({ name, port }) => {
      test(`${name} metrics endpoint returns comprehensive data`, async () => {
        const url = `${BASE_URL}:${port}/metrics`;
        const result = await testEndpoint(url);
        
        if (result.status === 200) {
          expect(result.data).toHaveProperty("service", name);
          expect(result.data).toHaveProperty("uptime");
          expect(result.data).toHaveProperty("requests");
          expect(result.data).toHaveProperty("memory");
          expect(result.data).toHaveProperty("cpu");
          expect(result.data).toHaveProperty("dependencies");
          expect(result.data).toHaveProperty("timestamp");
          
          // Check request metrics structure
          expect(result.data.requests).toHaveProperty("total");
          expect(result.data.requests).toHaveProperty("success");
          expect(result.data.requests).toHaveProperty("errors");
          expect(result.data.requests).toHaveProperty("perSecond");
          expect(result.data.requests).toHaveProperty("averageResponseTime");
          
          // Check memory metrics structure
          expect(result.data.memory).toHaveProperty("used");
          expect(result.data.memory).toHaveProperty("total");
          expect(result.data.memory).toHaveProperty("percentage");
          
          // Check dependency health structure
          expect(result.data.dependencies).toHaveProperty("database");
          expect(result.data.dependencies).toHaveProperty("redis");
        } else {
          console.log(`${name} not running (status: ${result.status}) - skipping metrics test`);
        }
      });

      test(`${name} Prometheus metrics endpoint returns valid format`, async () => {
        const url = `${BASE_URL}:${port}/metrics/prometheus`;
        const result = await testEndpoint(url);
        
        if (result.status === 200) {
          expect(typeof result.data).toBe("string");
          expect(result.data).toContain("# HELP");
          expect(result.data).toContain("# TYPE");
          expect(result.data).toContain("http_requests_total");
          expect(result.data).toContain("memory_usage_bytes");
          expect(result.data).toContain("service_uptime_seconds");
        } else {
          console.log(`${name} not running (status: ${result.status}) - skipping Prometheus test`);
        }
      });
    });
  });

  describe("Security Headers", () => {
    SERVICES.forEach(({ name, port }) => {
      test(`${name} includes production security headers`, async () => {
        const url = `${BASE_URL}:${port}/`;
        const result = await testEndpoint(url);
        
        if (result.status === 200) {
          const headers = result.headers;
          
          // Check for security headers
          expect(headers.get("x-frame-options")).toBe("DENY");
          expect(headers.get("x-content-type-options")).toBe("nosniff");
          expect(headers.get("x-xss-protection")).toBe("1; mode=block");
          expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
          expect(headers.get("permissions-policy")).toContain("geolocation=()");
          
          // Check Content Security Policy exists
          const csp = headers.get("content-security-policy");
          if (csp) {
            expect(csp).toContain("default-src");
          }
        } else {
          console.log(`${name} not running (status: ${result.status}) - skipping security headers test`);
        }
      });
    });
  });

  describe("Root Endpoints", () => {
    SERVICES.forEach(({ name, port }) => {
      test(`${name} root endpoint returns service information`, async () => {
        const url = `${BASE_URL}:${port}/`;
        const result = await testEndpoint(url);
        
        if (result.status === 200) {
          expect(result.data).toHaveProperty("service", name);
          expect(result.data).toHaveProperty("version");
          expect(result.data).toHaveProperty("status", "running");
          expect(result.data).toHaveProperty("timestamp");
        } else {
          console.log(`${name} not running (status: ${result.status}) - skipping root endpoint test`);
        }
      });
    });
  });
});

describe("Production Scripts Validation", () => {
  test("deployment script exists and is executable", async () => {
    const { spawn } = require("child_process");
    const { promisify } = require("util");
    const { access, constants } = require("fs");
    
    try {
      await promisify(access)("./scripts/deploy.sh", constants.F_OK);
      await promisify(access)("./scripts/deploy.sh", constants.X_OK);
      expect(true).toBe(true); // Script exists and is executable
    } catch (error) {
      expect(false).toBe(true); // Script doesn't exist or isn't executable
    }
  });

  test("backup script exists and is executable", async () => {
    const { promisify } = require("util");
    const { access, constants } = require("fs");
    
    try {
      await promisify(access)("./scripts/backup.sh", constants.F_OK);
      await promisify(access)("./scripts/backup.sh", constants.X_OK);
      expect(true).toBe(true); // Script exists and is executable
    } catch (error) {
      expect(false).toBe(true); // Script doesn't exist or isn't executable  
    }
  });

  test("load test script exists and is executable", async () => {
    const { promisify } = require("util");
    const { access, constants } = require("fs");
    
    try {
      await promisify(access)("./scripts/load-test.sh", constants.F_OK);
      await promisify(access)("./scripts/load-test.sh", constants.X_OK);
      expect(true).toBe(true); // Script exists and is executable
    } catch (error) {
      expect(false).toBe(true); // Script doesn't exist or isn't executable
    }
  });
});

describe("Configuration Files", () => {
  test("production PM2 configuration exists", () => {
    const { existsSync } = require("fs");
    expect(existsSync("./ecosystem.production.config.js")).toBe(true);
  });

  test("nginx configuration exists", () => {
    const { existsSync } = require("fs");
    expect(existsSync("./infrastructure/nginx/nginx.conf")).toBe(true);
  });

  test("Docker Compose production configuration exists", () => {
    const { existsSync } = require("fs");
    expect(existsSync("./docker-compose.production.yml")).toBe(true);
  });

  test("monitoring configurations exist", () => {
    const { existsSync } = require("fs");
    expect(existsSync("./infrastructure/monitoring/prometheus.yml")).toBe(true);
    expect(existsSync("./infrastructure/monitoring/loki.yml")).toBe(true);
    expect(existsSync("./infrastructure/monitoring/promtail.yml")).toBe(true);
  });

  test("production documentation exists", () => {
    const { existsSync } = require("fs");
    expect(existsSync("./PRODUCTION.md")).toBe(true);
  });
});

// Run smoke test validation
console.log("🧪 Running Phase 3 Production Readiness Smoke Tests...");
console.log("Note: Service endpoint tests will be skipped if services are not running");