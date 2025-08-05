import { Hono } from 'hono';
import { NotificationStorage } from '../models';
import { TemplateService } from '../services/templateService';
import { CreateTemplateSchema, UpdateTemplateSchema } from '../models/validation';

const templateRoutes = new Hono();

// Initialize services
const storage = new NotificationStorage();
const templateService = new TemplateService(storage);

// Create template
templateRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = CreateTemplateSchema.parse(body);
    
    const template = await templateService.createTemplate(validatedData);
    
    return c.json({
      success: true,
      data: template,
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

// List templates
templateRoutes.get('/', async (c) => {
  try {
    const type = c.req.query('type') as 'email' | 'sms' | 'push' | undefined;
    const templates = await templateService.listTemplates(type);
    
    return c.json({
      success: true,
      data: templates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve templates',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Get template by ID
templateRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const template = await templateService.getTemplate(id);
    
    if (!template) {
      return c.json({
        success: false,
        error: 'Template not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    return c.json({
      success: true,
      data: template,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve template',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Update template
templateRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validatedData = UpdateTemplateSchema.parse(body);
    
    const template = await templateService.updateTemplate(id, validatedData);
    
    return c.json({
      success: true,
      data: template,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template',
      timestamp: new Date().toISOString(),
    }, error instanceof Error && error.message.includes('not found') ? 404 : 500);
  }
});

// Delete template
templateRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await templateService.deleteTemplate(id);
    
    return c.json({
      success: true,
      message: 'Template deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template',
      timestamp: new Date().toISOString(),
    }, error instanceof Error && error.message.includes('not found') ? 404 : 500);
  }
});

// Preview template with sample data
templateRoutes.post('/:id/preview', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const sampleVariables = body.variables || {};
    
    const preview = await templateService.getTemplatePreview(id, sampleVariables);
    
    return c.json({
      success: true,
      data: preview,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate template preview',
      timestamp: new Date().toISOString(),
    }, error instanceof Error && error.message.includes('not found') ? 404 : 500);
  }
});

// Validate template
templateRoutes.post('/:id/validate', async (c) => {
  try {
    const id = c.req.param('id');
    const template = await templateService.getTemplate(id);
    
    if (!template) {
      return c.json({
        success: false,
        error: 'Template not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    const validation = await templateService.validateTemplate(template.content, template.variables);
    
    return c.json({
      success: true,
      data: validation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate template',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

export default templateRoutes;