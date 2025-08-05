import { NotificationStorage } from '../models';
import { SendEmailDto, SendSmsDto, SendPushDto, BatchNotificationDto } from '../models/validation';
import { createEmailProvider } from './emailProvider';
import { createSmsProvider } from './smsProvider';
import { createPushProvider } from './pushProvider';
import { TemplateService } from './templateService';
import config from '../config';

export class NotificationService {
  private storage: NotificationStorage;
  private templateService: TemplateService;
  private emailProvider = createEmailProvider();
  private smsProvider = createSmsProvider();
  private pushProvider = createPushProvider();

  constructor(storage: NotificationStorage) {
    this.storage = storage;
    this.templateService = new TemplateService(storage);
  }

  // Rate limiting check
  private async checkRateLimit(type: 'email' | 'sms' | 'push'): Promise<boolean> {
    const limits = {
      email: config.rateLimit.emailPerMinute,
      sms: config.rateLimit.smsPerMinute,
      push: config.rateLimit.pushPerMinute,
    };

    // Simple rate limiting check (in production, use Redis-based sliding window)
    const queueLength = await this.storage.getQueueLength(type, 'normal');
    return queueLength < limits[type];
  }

  async sendEmail(emailData: SendEmailDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Check rate limit
      if (!(await this.checkRateLimit('email'))) {
        throw new Error('Email rate limit exceeded');
      }

      let finalEmail = { ...emailData };

      // Process template if provided
      if (emailData.templateId) {
        const rendered = await this.templateService.renderTemplate(
          emailData.templateId,
          emailData.variables || {}
        );

        finalEmail.content = rendered.content;
        if (rendered.subject) {
          finalEmail.subject = rendered.subject;
        }
      }

      // Schedule or send immediately
      if (emailData.scheduledAt) {
        const scheduledDate = new Date(emailData.scheduledAt);
        if (scheduledDate > new Date()) {
          await this.storage.enqueueNotification('email', finalEmail, emailData.priority, scheduledDate);
          return { success: true, messageId: 'scheduled' };
        }
      }

      // Send immediately
      const result = await this.emailProvider.send(finalEmail);

      // Store in history
      await this.storage.saveNotificationHistory({
        id: crypto.randomUUID(),
        type: 'email',
        to: finalEmail.to,
        subject: finalEmail.subject,
        content: finalEmail.content,
        status: result.success ? 'sent' : 'failed',
        provider: this.emailProvider.name,
        error: result.error,
        sentAt: result.success ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
      
      // Store failed notification in history
      await this.storage.saveNotificationHistory({
        id: crypto.randomUUID(),
        type: 'email',
        to: emailData.to,
        subject: emailData.subject,
        content: emailData.content,
        status: 'failed',
        provider: this.emailProvider.name,
        error: errorMessage,
        createdAt: new Date().toISOString(),
      });

      return { success: false, error: errorMessage };
    }
  }

  async sendSms(smsData: SendSmsDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Check rate limit
      if (!(await this.checkRateLimit('sms'))) {
        throw new Error('SMS rate limit exceeded');
      }

      let finalSms = { ...smsData };

      // Process template if provided
      if (smsData.templateId) {
        const rendered = await this.templateService.renderTemplate(
          smsData.templateId,
          smsData.variables || {}
        );
        finalSms.content = rendered.content;
      }

      // Validate SMS length
      if (finalSms.content.length > 1600) {
        throw new Error('SMS content exceeds maximum length');
      }

      // Schedule or send immediately
      if (smsData.scheduledAt) {
        const scheduledDate = new Date(smsData.scheduledAt);
        if (scheduledDate > new Date()) {
          await this.storage.enqueueNotification('sms', finalSms, smsData.priority, scheduledDate);
          return { success: true, messageId: 'scheduled' };
        }
      }

      // Send immediately
      const result = await this.smsProvider.send(finalSms);

      // Store in history
      await this.storage.saveNotificationHistory({
        id: crypto.randomUUID(),
        type: 'sms',
        to: finalSms.to,
        content: finalSms.content,
        status: result.success ? 'sent' : 'failed',
        provider: this.smsProvider.name,
        error: result.error,
        sentAt: result.success ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown SMS error';
      
      // Store failed notification in history
      await this.storage.saveNotificationHistory({
        id: crypto.randomUUID(),
        type: 'sms',
        to: smsData.to,
        content: smsData.content,
        status: 'failed',
        provider: this.smsProvider.name,
        error: errorMessage,
        createdAt: new Date().toISOString(),
      });

      return { success: false, error: errorMessage };
    }
  }

  async sendPush(pushData: SendPushDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Check rate limit
      if (!(await this.checkRateLimit('push'))) {
        throw new Error('Push notification rate limit exceeded');
      }

      let finalPush = { ...pushData };

      // Process template if provided
      if (pushData.templateId) {
        const rendered = await this.templateService.renderTemplate(
          pushData.templateId,
          pushData.variables || {}
        );
        
        // For push notifications, template content could be JSON with title/body
        try {
          const templateData = JSON.parse(rendered.content);
          if (templateData.title) finalPush.title = templateData.title;
          if (templateData.body) finalPush.body = templateData.body;
        } catch {
          // If not JSON, use as body content
          finalPush.body = rendered.content;
        }
      }

      // Schedule or send immediately
      if (pushData.scheduledAt) {
        const scheduledDate = new Date(pushData.scheduledAt);
        if (scheduledDate > new Date()) {
          await this.storage.enqueueNotification('push', finalPush, pushData.priority, scheduledDate);
          return { success: true, messageId: 'scheduled' };
        }
      }

      // Send immediately
      const result = await this.pushProvider.send(finalPush);

      // Store in history
      await this.storage.saveNotificationHistory({
        id: crypto.randomUUID(),
        type: 'push',
        to: finalPush.to,
        subject: finalPush.title,
        content: JSON.stringify({ title: finalPush.title, body: finalPush.body, data: finalPush.data }),
        status: result.success ? 'sent' : 'failed',
        provider: this.pushProvider.name,
        error: result.error,
        sentAt: result.success ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown push notification error';
      
      // Store failed notification in history
      await this.storage.saveNotificationHistory({
        id: crypto.randomUUID(),
        type: 'push',
        to: pushData.to,
        subject: pushData.title,
        content: JSON.stringify({ title: pushData.title, body: pushData.body, data: pushData.data }),
        status: 'failed',
        provider: this.pushProvider.name,
        error: errorMessage,
        createdAt: new Date().toISOString(),
      });

      return { success: false, error: errorMessage };
    }
  }

  async processBatch(batchData: BatchNotificationDto): Promise<{
    success: boolean;
    results: Array<{ success: boolean; messageId?: string; error?: string }>;
    stats: { total: number; successful: number; failed: number };
  }> {
    const results: Array<{ success: boolean; messageId?: string; error?: string }> = [];
    const batchSize = batchData.batchSize || 100;
    const delay = batchData.delayBetweenBatches || 1000;

    // Process notifications in batches
    for (let i = 0; i < batchData.notifications.length; i += batchSize) {
      const batch = batchData.notifications.slice(i, i + batchSize);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (notification) => {
        switch (batchData.type) {
          case 'email':
            return await this.sendEmail(notification as SendEmailDto);
          case 'sms':
            return await this.sendSms(notification as SendSmsDto);
          case 'push':
            return await this.sendPush(notification as SendPushDto);
          default:
            return { success: false, error: 'Invalid notification type' };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect results
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ success: false, error: result.reason?.message || 'Unknown error' });
        }
      });

      // Delay between batches (except for the last batch)
      if (i + batchSize < batchData.notifications.length && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const stats = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    };

    return {
      success: stats.failed === 0,
      results,
      stats,
    };
  }

  async getNotificationHistory(limit = 50, offset = 0, type?: string) {
    return await this.storage.listNotificationHistory(limit, offset, type);
  }

  async getNotificationById(id: string) {
    return await this.storage.getNotificationHistory(id);
  }

  // Process scheduled notifications (should be called periodically)
  async processScheduledNotifications(): Promise<void> {
    await this.storage.processScheduledNotifications();
  }

  // Queue processing methods (for background workers)
  async processEmailQueue(): Promise<void> {
    const priorities: ('high' | 'normal' | 'low')[] = ['high', 'normal', 'low'];
    
    for (const priority of priorities) {
      const notification = await this.storage.dequeueNotification('email', priority);
      if (notification) {
        await this.sendEmail(notification);
      }
    }
  }

  async processSmsQueue(): Promise<void> {
    const priorities: ('high' | 'normal' | 'low')[] = ['high', 'normal', 'low'];
    
    for (const priority of priorities) {
      const notification = await this.storage.dequeueNotification('sms', priority);
      if (notification) {
        await this.sendSms(notification);
      }
    }
  }

  async processPushQueue(): Promise<void> {
    const priorities: ('high' | 'normal' | 'low')[] = ['high', 'normal', 'low'];
    
    for (const priority of priorities) {
      const notification = await this.storage.dequeueNotification('push', priority);
      if (notification) {
        await this.sendPush(notification);
      }
    }
  }
}