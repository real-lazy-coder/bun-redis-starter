import { createClient } from 'redis';
import config from '../config';

// Simple in-memory storage for notifications (Redis would be better for production)
export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'push';
  language: string;
  subject?: string;
  content: string;
  variables: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationHistory {
  id: string;
  type: 'email' | 'sms' | 'push';
  to: string | string[];
  subject?: string;
  content: string;
  status: 'pending' | 'sent' | 'failed' | 'scheduled';
  provider: string;
  error?: string;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
}

export interface NotificationPreference {
  userId: string;
  email: {
    enabled: boolean;
    address: string;
    frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    number?: string;
    frequency: 'immediate' | 'daily';
    categories: string[];
  };
  push: {
    enabled: boolean;
    deviceTokens: string[];
    frequency: 'immediate' | 'hourly';
    categories: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export class NotificationStorage {
  private redisClient;
  private templates: Map<string, NotificationTemplate> = new Map();
  private history: Map<string, NotificationHistory> = new Map();
  private preferences: Map<string, NotificationPreference> = new Map();

  constructor() {
    this.redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }

  async connect() {
    if (!this.redisClient.isOpen) {
      await this.redisClient.connect();
    }
  }

  async disconnect() {
    if (this.redisClient.isOpen) {
      await this.redisClient.disconnect();
    }
  }

  // Template Management
  async saveTemplate(template: NotificationTemplate): Promise<void> {
    this.templates.set(template.id, template);
    await this.connect();
    await this.redisClient.hSet(`template:${template.id}`, template as any);
  }

  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    const cached = this.templates.get(id);
    if (cached) return cached;

    await this.connect();
    const data = await this.redisClient.hGetAll(`template:${id}`);
    if (Object.keys(data).length === 0) return null;

    const template: NotificationTemplate = {
      ...data,
      variables: JSON.parse(data.variables || '[]'),
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
    } as NotificationTemplate;

    this.templates.set(id, template);
    return template;
  }

  async listTemplates(type?: string): Promise<NotificationTemplate[]> {
    await this.connect();
    const keys = await this.redisClient.keys('template:*');
    const templates: NotificationTemplate[] = [];

    for (const key of keys) {
      const data = await this.redisClient.hGetAll(key);
      if (Object.keys(data).length > 0) {
        const template: NotificationTemplate = {
          ...data,
          variables: JSON.parse(data.variables || '[]'),
          metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
        } as NotificationTemplate;

        if (!type || template.type === type) {
          templates.push(template);
        }
      }
    }

    return templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteTemplate(id: string): Promise<void> {
    this.templates.delete(id);
    await this.connect();
    await this.redisClient.del(`template:${id}`);
  }

  // Notification History
  async saveNotificationHistory(notification: NotificationHistory): Promise<void> {
    this.history.set(notification.id, notification);
    await this.connect();
    await this.redisClient.hSet(`notification:${notification.id}`, {
      ...notification,
      to: Array.isArray(notification.to) ? JSON.stringify(notification.to) : notification.to,
    } as any);

    // Add to sorted set for time-based queries
    await this.redisClient.zAdd('notifications:timeline', {
      score: Date.now(),
      value: notification.id,
    });
  }

  async getNotificationHistory(id: string): Promise<NotificationHistory | null> {
    const cached = this.history.get(id);
    if (cached) return cached;

    await this.connect();
    const data = await this.redisClient.hGetAll(`notification:${id}`);
    if (Object.keys(data).length === 0) return null;

    const notification: NotificationHistory = {
      ...data,
      to: data.to.startsWith('[') ? JSON.parse(data.to) : data.to,
    } as NotificationHistory;

    this.history.set(id, notification);
    return notification;
  }

  async listNotificationHistory(
    limit = 50,
    offset = 0,
    type?: string
  ): Promise<NotificationHistory[]> {
    await this.connect();
    const ids = await this.redisClient.zRange('notifications:timeline', offset, offset + limit - 1, { REV: true });
    const notifications: NotificationHistory[] = [];

    for (const id of ids) {
      const notification = await this.getNotificationHistory(id);
      if (notification && (!type || notification.type === type)) {
        notifications.push(notification);
      }
    }

    return notifications;
  }

  // User Preferences
  async saveUserPreferences(preferences: NotificationPreference): Promise<void> {
    this.preferences.set(preferences.userId, preferences);
    await this.connect();
    await this.redisClient.hSet(`preferences:${preferences.userId}`, preferences as any);
  }

  async getUserPreferences(userId: string): Promise<NotificationPreference | null> {
    const cached = this.preferences.get(userId);
    if (cached) return cached;

    await this.connect();
    const data = await this.redisClient.hGetAll(`preferences:${userId}`);
    if (Object.keys(data).length === 0) return null;

    const preferences: NotificationPreference = {
      ...data,
      email: JSON.parse(data.email),
      sms: JSON.parse(data.sms),
      push: JSON.parse(data.push),
    } as NotificationPreference;

    this.preferences.set(userId, preferences);
    return preferences;
  }

  async deleteUserPreferences(userId: string): Promise<void> {
    this.preferences.delete(userId);
    await this.connect();
    await this.redisClient.del(`preferences:${userId}`);
  }

  // Queue Management
  async enqueueNotification(
    type: 'email' | 'sms' | 'push',
    notification: any,
    priority: 'low' | 'normal' | 'high' = 'normal',
    scheduledAt?: Date
  ): Promise<void> {
    await this.connect();
    
    const queueName = `queue:${type}:${priority}`;
    const payload = JSON.stringify({
      ...notification,
      id: crypto.randomUUID(),
      enqueuedAt: new Date().toISOString(),
      scheduledAt: scheduledAt?.toISOString(),
    });

    if (scheduledAt && scheduledAt > new Date()) {
      // Schedule for later
      await this.redisClient.zAdd('scheduled:notifications', {
        score: scheduledAt.getTime(),
        value: payload,
      });
    } else {
      // Add to immediate processing queue
      await this.redisClient.lPush(queueName, payload);
    }
  }

  async dequeueNotification(
    type: 'email' | 'sms' | 'push',
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<any | null> {
    await this.connect();
    
    const queueName = `queue:${type}:${priority}`;
    const payload = await this.redisClient.rPop(queueName);
    
    return payload ? JSON.parse(payload) : null;
  }

  async getQueueLength(
    type: 'email' | 'sms' | 'push',
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<number> {
    await this.connect();
    const queueName = `queue:${type}:${priority}`;
    return await this.redisClient.lLen(queueName);
  }

  async processScheduledNotifications(): Promise<void> {
    await this.connect();
    
    const now = Date.now();
    const scheduled = await this.redisClient.zRangeByScore('scheduled:notifications', 0, now);
    
    for (const payload of scheduled) {
      const notification = JSON.parse(payload);
      const type = notification.type || 'email';
      const priority = notification.priority || 'normal';
      
      // Move to immediate processing queue
      await this.redisClient.lPush(`queue:${type}:${priority}`, payload);
      
      // Remove from scheduled
      await this.redisClient.zRem('scheduled:notifications', payload);
    }
  }
}