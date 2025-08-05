import { Hono } from 'hono';
import { WebhookService } from '../services/webhook';
import { CreateWebhookConfigSchema, UpdateWebhookConfigSchema, WebhookEventSchema } from '../models/validation';

const webhookRoutes = new Hono();
const webhookService = new WebhookService();

// Webhook Configuration Management
webhookRoutes.post('/configs', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = CreateWebhookConfigSchema.parse(body);
    
    const webhookConfig = await webhookService.createWebhookConfig(validatedData);
    
    return c.json({
      success: true,
      data: webhookConfig,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request data',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

webhookRoutes.get('/configs', async (c) => {
  try {
    const webhookConfigs = await webhookService.listWebhookConfigs();
    
    return c.json({
      success: true,
      data: webhookConfigs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve webhook configurations',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

webhookRoutes.get('/configs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const webhookConfig = await webhookService.getWebhookConfig(id);
    
    if (!webhookConfig) {
      return c.json({
        success: false,
        error: 'Webhook configuration not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    return c.json({
      success: true,
      data: webhookConfig,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve webhook configuration',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

webhookRoutes.put('/configs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validatedData = UpdateWebhookConfigSchema.parse(body);
    
    const webhookConfig = await webhookService.updateWebhookConfig(id, validatedData);
    
    if (!webhookConfig) {
      return c.json({
        success: false,
        error: 'Webhook configuration not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    return c.json({
      success: true,
      data: webhookConfig,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update webhook configuration',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

webhookRoutes.delete('/configs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await webhookService.deleteWebhookConfig(id);
    
    return c.json({
      success: true,
      message: 'Webhook configuration deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete webhook configuration',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Webhook Event Broadcasting
webhookRoutes.post('/broadcast', async (c) => {
  try {
    const body = await c.req.json();
    const validatedEvent = WebhookEventSchema.parse(body);
    
    await webhookService.broadcastEvent(validatedEvent);
    
    return c.json({
      success: true,
      message: 'Event broadcasted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to broadcast event',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Send to specific webhook
webhookRoutes.post('/configs/:id/send', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validatedEvent = WebhookEventSchema.parse(body);
    
    await webhookService.sendWebhook(id, validatedEvent);
    
    return c.json({
      success: true,
      message: 'Webhook sent successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send webhook',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Delivery History
webhookRoutes.get('/configs/:id/deliveries', async (c) => {
  try {
    const id = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    
    const deliveries = await webhookService.getDeliveryHistory(id, limit);
    
    return c.json({
      success: true,
      data: deliveries,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve delivery history',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Redeliver webhook
webhookRoutes.post('/deliveries/:id/redeliver', async (c) => {
  try {
    const id = c.req.param('id');
    
    await webhookService.redeliverWebhook(id);
    
    return c.json({
      success: true,
      message: 'Webhook redelivered successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to redeliver webhook',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Incoming webhook endpoint (for receiving webhooks from external services)
webhookRoutes.post('/incoming/:secret?', async (c) => {
  try {
    const secret = c.req.param('secret');
    const headers = Object.fromEntries(c.req.header() as any);
    const body = await c.req.text();
    
    const result = await webhookService.processIncomingWebhook(headers, body, secret);
    
    if (!result.valid) {
      return c.json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      }, 400);
    }
    
    // TODO: Process the incoming webhook event
    // This could involve routing to appropriate handlers, storing in database, etc.
    
    return c.json({
      success: true,
      message: 'Webhook received and processed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process incoming webhook',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

export default webhookRoutes;