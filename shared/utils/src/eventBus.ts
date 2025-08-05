import { createClient } from 'redis';

export interface Event {
  id: string;
  type: string;
  source: string;
  data: Record<string, any>;
  timestamp: string;
  correlationId?: string;
  version?: string;
}

export interface EventHandler {
  (event: Event): Promise<void>;
}

export class EventBus {
  private publisherClient;
  private subscriberClient;
  private handlers: Map<string, EventHandler[]> = new Map();
  private connected = false;

  constructor(redisConfig: { host: string; port: number; password?: string; db?: number }) {
    // Separate clients for publishing and subscribing
    const clientConfig = {
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
      password: redisConfig.password,
      database: redisConfig.db || 0,
    };

    this.publisherClient = createClient(clientConfig);
    this.subscriberClient = createClient(clientConfig);

    this.publisherClient.on('error', (err) => {
      console.error('Redis publisher client error:', err);
    });

    this.subscriberClient.on('error', (err) => {
      console.error('Redis subscriber client error:', err);
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await Promise.all([
      this.publisherClient.connect(),
      this.subscriberClient.connect(),
    ]);

    this.connected = true;
    console.log('EventBus connected to Redis');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await Promise.all([
      this.publisherClient.disconnect(),
      this.subscriberClient.disconnect(),
    ]);

    this.connected = false;
    console.log('EventBus disconnected from Redis');
  }

  // Publish an event
  async publish(event: Omit<Event, 'id' | 'timestamp'>): Promise<void> {
    if (!this.connected) {
      throw new Error('EventBus not connected');
    }

    const fullEvent: Event = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    const eventData = JSON.stringify(fullEvent);
    
    // Publish to both specific type channel and general events channel
    await Promise.all([
      this.publisherClient.publish(`events:${event.type}`, eventData),
      this.publisherClient.publish('events:all', eventData),
    ]);

    console.log(`Published event: ${event.type} from ${event.source}`);
  }

  // Subscribe to events of a specific type
  async subscribe(eventType: string, handler: EventHandler): Promise<void> {
    if (!this.connected) {
      throw new Error('EventBus not connected');
    }

    // Add handler to registry
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);

    // Subscribe to the channel
    await this.subscriberClient.subscribe(`events:${eventType}`, (message) => {
      this.handleEvent(eventType, message);
    });

    console.log(`Subscribed to events: ${eventType}`);
  }

  // Subscribe to all events
  async subscribeToAll(handler: EventHandler): Promise<void> {
    if (!this.connected) {
      throw new Error('EventBus not connected');
    }

    // Add handler to registry
    if (!this.handlers.has('*')) {
      this.handlers.set('*', []);
    }
    this.handlers.get('*')!.push(handler);

    // Subscribe to all events channel
    await this.subscriberClient.subscribe('events:all', (message) => {
      this.handleEvent('*', message);
    });

    console.log('Subscribed to all events');
  }

  // Handle incoming events
  private async handleEvent(eventType: string, message: string): Promise<void> {
    try {
      const event: Event = JSON.parse(message);
      const handlers = this.handlers.get(eventType) || [];

      // Execute all handlers concurrently
      await Promise.all(
        handlers.map(async (handler) => {
          try {
            await handler(event);
          } catch (error) {
            console.error(`Error handling event ${event.type}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Error parsing event message:', error);
    }
  }

  // Unsubscribe from events
  async unsubscribe(eventType: string): Promise<void> {
    if (!this.connected) return;

    await this.subscriberClient.unsubscribe(`events:${eventType}`);
    this.handlers.delete(eventType);

    console.log(`Unsubscribed from events: ${eventType}`);
  }

  // Get event history (if events are also stored)
  async getEventHistory(
    eventType?: string,
    limit = 100,
    offset = 0
  ): Promise<Event[]> {
    if (!this.connected) {
      throw new Error('EventBus not connected');
    }

    const key = eventType ? `events:history:${eventType}` : 'events:history:all';
    
    // Get events from sorted set (newest first)
    const eventStrings = await this.publisherClient.zRange(key, offset, offset + limit - 1, {
      REV: true,
    });

    return eventStrings.map(eventStr => JSON.parse(eventStr));
  }

  // Store event in history (optional feature)
  async storeEventHistory(event: Event): Promise<void> {
    if (!this.connected) return;

    const eventData = JSON.stringify(event);
    const timestamp = new Date(event.timestamp).getTime();

    // Store in both type-specific and general history
    await Promise.all([
      this.publisherClient.zAdd(`events:history:${event.type}`, {
        score: timestamp,
        value: eventData,
      }),
      this.publisherClient.zAdd('events:history:all', {
        score: timestamp,
        value: eventData,
      }),
    ]);

    // Trim history to last 10000 events
    await Promise.all([
      this.publisherClient.zRemRangeByRank(`events:history:${event.type}`, 0, -10001),
      this.publisherClient.zRemRangeByRank('events:history:all', 0, -10001),
    ]);
  }

  // Enhanced publish with history storage
  async publishWithHistory(event: Omit<Event, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: Event = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Store event in history
    await this.storeEventHistory(fullEvent);

    // Publish event
    await this.publish(fullEvent);
  }
}

// Event type constants
export const EventTypes = {
  // User events
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_PASSWORD_RESET: 'user.password_reset',

  // Data events
  ENTITY_CREATED: 'entity.created',
  ENTITY_UPDATED: 'entity.updated',
  ENTITY_DELETED: 'entity.deleted',

  // Workflow events
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  WORKFLOW_STEP_COMPLETED: 'workflow.step_completed',

  // Notification events
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
  NOTIFICATION_DELIVERED: 'notification.delivered',

  // Integration events
  API_CALL_SUCCESS: 'integration.api_call_success',
  API_CALL_FAILED: 'integration.api_call_failed',
  WEBHOOK_RECEIVED: 'integration.webhook_received',
  WEBHOOK_SENT: 'integration.webhook_sent',

  // System events
  SERVICE_STARTED: 'system.service_started',
  SERVICE_STOPPED: 'system.service_stopped',
  HEALTH_CHECK_FAILED: 'system.health_check_failed',
} as const;

// Helper function to create event bus instance
export function createEventBus(redisConfig: { 
  host: string; 
  port: number; 
  password?: string; 
  db?: number;
}): EventBus {
  return new EventBus(redisConfig);
}