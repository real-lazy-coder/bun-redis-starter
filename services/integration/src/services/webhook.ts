import { eq, desc } from 'drizzle-orm';
import { db, webhookConfigs, webhookDeliveries } from '../models';
import { CreateWebhookConfigDto, UpdateWebhookConfigDto, WebhookEventDto } from '../models/validation';
import config from '../config';
import crypto from 'crypto';

export class WebhookService {
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  private verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async createWebhookConfig(data: CreateWebhookConfigDto) {
    const [webhookConfig] = await db.insert(webhookConfigs).values({
      ...data,
      updatedAt: new Date().toISOString(),
    }).returning();

    return webhookConfig;
  }

  async updateWebhookConfig(id: string, data: UpdateWebhookConfigDto) {
    const [webhookConfig] = await db.update(webhookConfigs)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(webhookConfigs.id, id))
      .returning();

    return webhookConfig;
  }

  async getWebhookConfig(id: string) {
    return db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id)).then(rows => rows[0]);
  }

  async listWebhookConfigs() {
    return db.select().from(webhookConfigs).orderBy(desc(webhookConfigs.createdAt));
  }

  async deleteWebhookConfig(id: string) {
    await db.delete(webhookConfigs).where(eq(webhookConfigs.id, id));
  }

  private async deliverWebhook(
    webhookConfig: any,
    event: WebhookEventDto,
    attempt: number = 0
  ): Promise<{ success: boolean; responseStatus?: number; responseBody?: string; error?: string; duration: number }> {
    const startTime = Date.now();
    
    try {
      const payload = JSON.stringify({
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': `${config.name}/${config.version}`,
        'X-Webhook-Event': event.type,
        'X-Delivery-ID': crypto.randomUUID(),
        ...webhookConfig.headers,
      };

      // Add signature if secret is configured
      if (webhookConfig.secret && webhookConfig.validateSignature) {
        const signature = this.generateSignature(payload, webhookConfig.secret);
        headers[config.webhooks.secretHeader] = `sha256=${signature}`;
      }

      const response = await fetch(webhookConfig.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(webhookConfig.timeout || config.externalApis.timeout),
      });

      const responseBody = await response.text();
      const duration = Date.now() - startTime;

      return {
        success: response.ok,
        responseStatus: response.status,
        responseBody,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  async sendWebhook(webhookConfigId: string, event: WebhookEventDto): Promise<void> {
    const webhookConfig = await this.getWebhookConfig(webhookConfigId);
    
    if (!webhookConfig) {
      throw new Error(`Webhook configuration not found: ${webhookConfigId}`);
    }

    if (!webhookConfig.isActive) {
      throw new Error(`Webhook configuration is inactive: ${webhookConfigId}`);
    }

    // Check if this event type is subscribed
    if (!webhookConfig.events.includes(event.type)) {
      return; // Silently skip unsubscribed events
    }

    const maxRetries = webhookConfig.retryAttempts || 3;
    let lastResult: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.deliverWebhook(webhookConfig, event, attempt);
      lastResult = result;

      const deliveryRecord = {
        webhookConfigId,
        eventType: event.type,
        payload: event,
        headers: webhookConfig.headers || {},
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        duration: result.duration,
        error: result.error,
        retryCount: attempt,
        deliveredAt: result.success ? new Date().toISOString() : null,
      };

      await db.insert(webhookDeliveries).values(deliveryRecord);

      if (result.success) {
        break; // Success, no need to retry
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await this.delay(delay);
      }
    }

    if (!lastResult.success) {
      throw new Error(`Webhook delivery failed after ${maxRetries + 1} attempts: ${lastResult.error}`);
    }
  }

  async broadcastEvent(event: WebhookEventDto): Promise<void> {
    const activeWebhooks = await db.select()
      .from(webhookConfigs)
      .where(eq(webhookConfigs.isActive, true));

    const deliveryPromises = activeWebhooks
      .filter(webhook => webhook.events.includes(event.type))
      .map(webhook => this.sendWebhook(webhook.id, event).catch(error => {
        console.error(`Failed to deliver webhook ${webhook.id}:`, error);
      }));

    await Promise.allSettled(deliveryPromises);
  }

  async processIncomingWebhook(
    headers: Record<string, string>,
    body: any,
    expectedSecret?: string
  ): Promise<{ valid: boolean; event?: any; error?: string }> {
    try {
      // Validate signature if secret is provided
      if (expectedSecret && config.webhooks.validateSignatures) {
        const signature = headers[config.webhooks.secretHeader];
        if (!signature) {
          return { valid: false, error: 'Missing webhook signature' };
        }

        const payload = typeof body === 'string' ? body : JSON.stringify(body);
        const signatureWithoutPrefix = signature.replace('sha256=', '');
        
        if (!this.verifySignature(payload, signatureWithoutPrefix, expectedSecret)) {
          return { valid: false, error: 'Invalid webhook signature' };
        }
      }

      // Parse event data
      const event = typeof body === 'string' ? JSON.parse(body) : body;

      return { valid: true, event };

    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid webhook payload'
      };
    }
  }

  async getDeliveryHistory(webhookConfigId: string, limit = 50) {
    return db.select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookConfigId, webhookConfigId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
  }

  async redeliverWebhook(deliveryId: string): Promise<void> {
    const delivery = await db.select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId))
      .then(rows => rows[0]);

    if (!delivery) {
      throw new Error(`Webhook delivery not found: ${deliveryId}`);
    }

    const event: WebhookEventDto = {
      type: delivery.eventType,
      data: delivery.payload as Record<string, any>,
      correlationId: crypto.randomUUID(),
    };

    await this.sendWebhook(delivery.webhookConfigId, event);
  }
}