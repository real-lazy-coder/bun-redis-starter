import { Hono } from 'hono';
import { NotificationStorage } from '../models';
import { NotificationPreferenceSchema, UpdateNotificationPreferenceSchema } from '../models/validation';

const preferencesRoutes = new Hono();

// Initialize storage
const storage = new NotificationStorage();

// Get user preferences
preferencesRoutes.get('/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const preferences = await storage.getUserPreferences(userId);
    
    if (!preferences) {
      // Return default preferences if none exist
      const defaultPreferences = {
        userId,
        email: {
          enabled: true,
          address: '',
          frequency: 'immediate' as const,
          categories: [],
        },
        sms: {
          enabled: false,
          frequency: 'immediate' as const,
          categories: [],
        },
        push: {
          enabled: true,
          deviceTokens: [],
          frequency: 'immediate' as const,
          categories: [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      return c.json({
        success: true,
        data: defaultPreferences,
        timestamp: new Date().toISOString(),
      });
    }
    
    return c.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve user preferences',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Create or update user preferences
preferencesRoutes.put('/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    
    // Get existing preferences or create new ones
    const existing = await storage.getUserPreferences(userId);
    let preferences;
    
    if (existing) {
      // Update existing preferences
      const updateData = UpdateNotificationPreferenceSchema.parse(body);
      preferences = {
        ...existing,
        ...updateData,
        email: updateData.email ? { ...existing.email, ...updateData.email } : existing.email,
        sms: updateData.sms ? { ...existing.sms, ...updateData.sms } : existing.sms,
        push: updateData.push ? { ...existing.push, ...updateData.push } : existing.push,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Create new preferences
      const createData = NotificationPreferenceSchema.parse({ userId, ...body });
      preferences = {
        ...createData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    
    await storage.saveUserPreferences(preferences);
    
    return c.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user preferences',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Delete user preferences
preferencesRoutes.delete('/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    await storage.deleteUserPreferences(userId);
    
    return c.json({
      success: true,
      message: 'User preferences deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete user preferences',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Update email preferences
preferencesRoutes.patch('/:userId/email', async (c) => {
  try {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    
    const existing = await storage.getUserPreferences(userId);
    if (!existing) {
      return c.json({
        success: false,
        error: 'User preferences not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    const updatedPreferences = {
      ...existing,
      email: { ...existing.email, ...body },
      updatedAt: new Date().toISOString(),
    };
    
    await storage.saveUserPreferences(updatedPreferences);
    
    return c.json({
      success: true,
      data: updatedPreferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update email preferences',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Update SMS preferences
preferencesRoutes.patch('/:userId/sms', async (c) => {
  try {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    
    const existing = await storage.getUserPreferences(userId);
    if (!existing) {
      return c.json({
        success: false,
        error: 'User preferences not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    const updatedPreferences = {
      ...existing,
      sms: { ...existing.sms, ...body },
      updatedAt: new Date().toISOString(),
    };
    
    await storage.saveUserPreferences(updatedPreferences);
    
    return c.json({
      success: true,
      data: updatedPreferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update SMS preferences',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Update push notification preferences
preferencesRoutes.patch('/:userId/push', async (c) => {
  try {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    
    const existing = await storage.getUserPreferences(userId);
    if (!existing) {
      return c.json({
        success: false,
        error: 'User preferences not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    const updatedPreferences = {
      ...existing,
      push: { ...existing.push, ...body },
      updatedAt: new Date().toISOString(),
    };
    
    await storage.saveUserPreferences(updatedPreferences);
    
    return c.json({
      success: true,
      data: updatedPreferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update push notification preferences',
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Add device token for push notifications
preferencesRoutes.post('/:userId/push/devices', async (c) => {
  try {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    const { deviceToken } = body;
    
    if (!deviceToken) {
      return c.json({
        success: false,
        error: 'Device token is required',
        timestamp: new Date().toISOString(),
      }, 400);
    }
    
    const existing = await storage.getUserPreferences(userId);
    if (!existing) {
      return c.json({
        success: false,
        error: 'User preferences not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    // Add device token if not already present
    const deviceTokens = existing.push.deviceTokens || [];
    if (!deviceTokens.includes(deviceToken)) {
      deviceTokens.push(deviceToken);
    }
    
    const updatedPreferences = {
      ...existing,
      push: { ...existing.push, deviceTokens },
      updatedAt: new Date().toISOString(),
    };
    
    await storage.saveUserPreferences(updatedPreferences);
    
    return c.json({
      success: true,
      data: updatedPreferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add device token',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Remove device token for push notifications
preferencesRoutes.delete('/:userId/push/devices/:deviceToken', async (c) => {
  try {
    const userId = c.req.param('userId');
    const deviceToken = c.req.param('deviceToken');
    
    const existing = await storage.getUserPreferences(userId);
    if (!existing) {
      return c.json({
        success: false,
        error: 'User preferences not found',
        timestamp: new Date().toISOString(),
      }, 404);
    }
    
    // Remove device token
    const deviceTokens = (existing.push.deviceTokens || []).filter(token => token !== deviceToken);
    
    const updatedPreferences = {
      ...existing,
      push: { ...existing.push, deviceTokens },
      updatedAt: new Date().toISOString(),
    };
    
    await storage.saveUserPreferences(updatedPreferences);
    
    return c.json({
      success: true,
      data: updatedPreferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove device token',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

export default preferencesRoutes;