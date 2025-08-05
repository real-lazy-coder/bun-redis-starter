import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { 
  db, 
  apiKeys, 
  users,
  type ApiKey,
  type NewApiKey,
} from '../models/database';

export interface CreateApiKeyRequest {
  name: string;
  permissions: string[];
  userId?: string;
  expiresInDays?: number;
  metadata?: Record<string, any>;
}

export class ApiKeyService {
  // Generate API key with prefix
  private generateApiKey(): string {
    const prefix = 'sk'; // Secret key prefix
    const randomPart = crypto.randomBytes(24).toString('base64')
      .replace(/[+/]/g, '')  // Remove URL-unsafe characters
      .substring(0, 32);     // Ensure consistent length
    
    return `${prefix}_${randomPart}`;
  }

  // Hash API key for storage
  private async hashApiKey(apiKey: string): Promise<string> {
    return await bcrypt.hash(apiKey, 10);
  }

  // Verify API key against hash
  private async verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(apiKey, hash);
  }

  // Create new API key
  async createApiKey(request: CreateApiKeyRequest): Promise<{ 
    success: boolean; 
    apiKey?: string; 
    keyData?: ApiKey; 
    error?: string; 
  }> {
    try {
      // Validate user if provided
      if (request.userId) {
        const [user] = await db.select().from(users).where(eq(users.id, request.userId));
        if (!user) {
          return { success: false, error: 'User not found' };
        }
      }

      // Generate API key
      const apiKey = this.generateApiKey();
      const keyHash = await this.hashApiKey(apiKey);

      // Calculate expiry date
      let expiresAt: string | undefined;
      if (request.expiresInDays) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + request.expiresInDays);
        expiresAt = expiry.toISOString();
      }

      // Create API key record
      const newApiKey: NewApiKey = {
        name: request.name,
        keyHash,
        userId: request.userId,
        permissions: request.permissions,
        expiresAt,
        metadata: request.metadata,
      };

      const [createdKey] = await db.insert(apiKeys).values(newApiKey).returning();

      return { 
        success: true, 
        apiKey, // Return the actual key only once
        keyData: createdKey 
      };
    } catch (error) {
      console.error('API key creation error:', error);
      return { success: false, error: 'Failed to create API key' };
    }
  }

  // Validate API key and return associated data
  async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    keyData?: ApiKey;
    userId?: string;
    permissions?: string[];
    error?: string;
  }> {
    try {
      // Get all active API keys (we need to check against all hashes)
      const activeKeys = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.isActive, true),
          // Only include keys that haven't expired
          gt(apiKeys.expiresAt, new Date().toISOString())
        ));

      // Check against each key hash
      for (const key of activeKeys) {
        const isValid = await this.verifyApiKey(apiKey, key.keyHash);
        if (isValid) {
          // Update usage stats
          await this.updateKeyUsage(key.id);

          return {
            valid: true,
            keyData: key,
            userId: key.userId || undefined,
            permissions: key.permissions,
          };
        }
      }

      return { valid: false, error: 'Invalid API key' };
    } catch (error) {
      console.error('API key validation error:', error);
      return { valid: false, error: 'API key validation failed' };
    }
  }

  // Update API key usage statistics
  private async updateKeyUsage(keyId: string): Promise<void> {
    await db.update(apiKeys)
      .set({ 
        lastUsedAt: new Date().toISOString(),
        usageCount: apiKeys.usageCount + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(apiKeys.id, keyId));
  }

  // List API keys for a user
  async listUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await db.select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
  }

  // List all API keys (admin only)
  async listAllApiKeys(): Promise<ApiKey[]> {
    return await db.select().from(apiKeys);
  }

  // Get API key by ID
  async getApiKey(keyId: string, userId?: string): Promise<ApiKey | null> {
    const conditions = [eq(apiKeys.id, keyId)];
    if (userId) {
      conditions.push(eq(apiKeys.userId, userId));
    }

    const [key] = await db.select()
      .from(apiKeys)
      .where(and(...conditions));

    return key || null;
  }

  // Update API key
  async updateApiKey(
    keyId: string, 
    updates: {
      name?: string;
      permissions?: string[];
      isActive?: boolean;
      expiresAt?: string;
      metadata?: Record<string, any>;
    },
    userId?: string
  ): Promise<{ success: boolean; keyData?: ApiKey; error?: string }> {
    try {
      const conditions = [eq(apiKeys.id, keyId)];
      if (userId) {
        conditions.push(eq(apiKeys.userId, userId));
      }

      const [updatedKey] = await db.update(apiKeys)
        .set({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .where(and(...conditions))
        .returning();

      if (!updatedKey) {
        return { success: false, error: 'API key not found' };
      }

      return { success: true, keyData: updatedKey };
    } catch (error) {
      console.error('API key update error:', error);
      return { success: false, error: 'Failed to update API key' };
    }
  }

  // Revoke API key
  async revokeApiKey(keyId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.updateApiKey(keyId, { isActive: false }, userId);
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('API key revocation error:', error);
      return { success: false, error: 'Failed to revoke API key' };
    }
  }

  // Delete API key
  async deleteApiKey(keyId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const conditions = [eq(apiKeys.id, keyId)];
      if (userId) {
        conditions.push(eq(apiKeys.userId, userId));
      }

      await db.delete(apiKeys).where(and(...conditions));
      return { success: true };
    } catch (error) {
      console.error('API key deletion error:', error);
      return { success: false, error: 'Failed to delete API key' };
    }
  }

  // Check if API key has permission
  hasPermission(keyPermissions: string[], requiredPermission: string): boolean {
    // Support wildcard permissions
    if (keyPermissions.includes('*')) {
      return true;
    }

    // Support namespace permissions (e.g., 'users:*' for all user operations)
    const [requiredNamespace] = requiredPermission.split(':');
    if (keyPermissions.includes(`${requiredNamespace}:*`)) {
      return true;
    }

    // Check exact permission
    return keyPermissions.includes(requiredPermission);
  }

  // Clean up expired API keys
  async cleanupExpiredKeys(): Promise<number> {
    const now = new Date().toISOString();
    
    const result = await db.delete(apiKeys)
      .where(and(
        eq(apiKeys.isActive, false),
        lt(apiKeys.expiresAt, now)
      ));

    // Return count of deleted keys (if supported by the database driver)
    return 0; // SQLite doesn't return affected rows in this setup
  }

  // Get API key usage statistics
  async getUsageStats(keyId: string, userId?: string): Promise<{
    keyData?: ApiKey;
    stats?: {
      totalUsage: number;
      lastUsed?: string;
      createdAt: string;
      isActive: boolean;
      daysUntilExpiry?: number;
    };
    error?: string;
  }> {
    try {
      const key = await this.getApiKey(keyId, userId);
      if (!key) {
        return { error: 'API key not found' };
      }

      let daysUntilExpiry: number | undefined;
      if (key.expiresAt) {
        const expiry = new Date(key.expiresAt);
        const now = new Date();
        daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        keyData: key,
        stats: {
          totalUsage: key.usageCount || 0,
          lastUsed: key.lastUsedAt || undefined,
          createdAt: key.createdAt,
          isActive: key.isActive,
          daysUntilExpiry,
        },
      };
    } catch (error) {
      console.error('Usage stats error:', error);
      return { error: 'Failed to get usage statistics' };
    }
  }
}