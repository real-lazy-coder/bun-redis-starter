import { Hono } from 'hono';
import { NotificationStorage } from '../models';
import { NotificationService } from '../services/notificationService';
import { SendEmailSchema, SendSmsSchema, SendPushSchema, BatchNotificationSchema } from '../models/validation';

const notificationRoutes = new Hono();

// Initialize services
const storage = new NotificationStorage();
const notificationService = new NotificationService(storage);

// Send email notification
notificationRoutes.post('/email', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = SendEmailSchema.parse(body);
    
    const result = await notificationService.sendEmail(validatedData);
    
    return c.json({
      success: result.success,
      data: {
        messageId: result.messageId,
        provider: 'email',
      },
      error: result.error,
      timestamp: new Date().toISOString(),
    }, result.success ? 200 : 500);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid email request',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Send SMS notification
notificationRoutes.post('/sms', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = SendSmsSchema.parse(body);
    
    const result = await notificationService.sendSms(validatedData);
    
    return c.json({
      success: result.success,
      data: {
        messageId: result.messageId,
        provider: 'sms',
      },
      error: result.error,
      timestamp: new Date().toISOString(),
    }, result.success ? 200 : 500);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid SMS request',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Send push notification
notificationRoutes.post('/push', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = SendPushSchema.parse(body);
    
    const result = await notificationService.sendPush(validatedData);
    
    return c.json({
      success: result.success,
      data: {
        messageId: result.messageId,
        provider: 'push',
      },
      error: result.error,
      timestamp: new Date().toISOString(),
    }, result.success ? 200 : 500);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid push notification request',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Send batch notifications
notificationRoutes.post('/batch', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = BatchNotificationSchema.parse(body);
    
    const result = await notificationService.processBatch(validatedData);
    
    return c.json({
      success: result.success,
      data: {
        stats: result.stats,
        results: result.results,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid batch notification request',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Get notification history
notificationRoutes.get('/history', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const type = c.req.query('type') as 'email' | 'sms' | 'push' | undefined;
    
    const history = await notificationService.getNotificationHistory(limit, offset, type);
    
    return c.json({
      success: true,
      data: history,
      pagination: {
        limit,
        offset,
        total: history.length, // TODO: Get actual total count
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve notification history',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Get notification by ID
notificationRoutes.get('/history/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const notification = await notificationService.getNotificationById(id);
    
    if (!notification) {
      return c.json({
        success: false,
        error: 'Notification not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    return c.json({
      success: true,
      data: notification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve notification',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Process scheduled notifications (admin endpoint)
notificationRoutes.post('/process-scheduled', async (c) => {
  try {
    await notificationService.processScheduledNotifications();
    
    return c.json({
      success: true,
      message: 'Scheduled notifications processed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process scheduled notifications',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Queue processing endpoints (for background workers)
notificationRoutes.post('/process-queues/email', async (c) => {
  try {
    await notificationService.processEmailQueue();
    
    return c.json({
      success: true,
      message: 'Email queue processed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process email queue',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

notificationRoutes.post('/process-queues/sms', async (c) => {
  try {
    await notificationService.processSmsQueue();
    
    return c.json({
      success: true,
      message: 'SMS queue processed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process SMS queue',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

notificationRoutes.post('/process-queues/push', async (c) => {
  try {
    await notificationService.processPushQueue();
    
    return c.json({
      success: true,
      message: 'Push notification queue processed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process push notification queue',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

export default notificationRoutes;