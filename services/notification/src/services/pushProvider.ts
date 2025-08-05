import config from '../config';
import { SendPushDto } from '../models/validation';

export interface PushProvider {
  name: string;
  send(push: SendPushDto): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Mock Firebase Cloud Messaging Provider
export class FCMProvider implements PushProvider {
  name = 'fcm';

  async send(push: SendPushDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.push.config.serverKey) {
        throw new Error('FCM server key not configured');
      }

      console.log(`[FCM] Sending push notification to: ${Array.isArray(push.to) ? push.to.length + ' devices' : '1 device'}`);
      console.log(`[FCM] Title: ${push.title}`);
      console.log(`[FCM] Body: ${push.body}`);

      // Mock FCM API call
      await new Promise(resolve => setTimeout(resolve, 200));

      // Simulate occasional failures
      if (Math.random() < 0.02) { // 2% failure rate
        throw new Error('FCM: Invalid registration token');
      }

      const messageId = `fcm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown FCM error',
      };
    }
  }
}

// Mock Apple Push Notification Service Provider
export class APNSProvider implements PushProvider {
  name = 'apns';

  async send(push: SendPushDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.push.config.keyId || !config.providers.push.config.teamId) {
        throw new Error('APNS credentials not configured');
      }

      console.log(`[APNS] Sending push notification to: ${Array.isArray(push.to) ? push.to.length + ' devices' : '1 device'}`);
      console.log(`[APNS] Title: ${push.title}`);
      console.log(`[APNS] Body: ${push.body}`);

      // Mock APNS API call
      await new Promise(resolve => setTimeout(resolve, 300));

      // Simulate occasional failures
      if (Math.random() < 0.03) { // 3% failure rate
        throw new Error('APNS: Invalid device token');
      }

      const messageId = `apns-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown APNS error',
      };
    }
  }
}

// Mock Web Push Provider
export class WebPushProvider implements PushProvider {
  name = 'web-push';

  async send(push: SendPushDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.push.config.vapidPublicKey || !config.providers.push.config.vapidPrivateKey) {
        throw new Error('Web Push VAPID keys not configured');
      }

      console.log(`[Web Push] Sending push notification to: ${Array.isArray(push.to) ? push.to.length + ' subscriptions' : '1 subscription'}`);
      console.log(`[Web Push] Title: ${push.title}`);
      console.log(`[Web Push] Body: ${push.body}`);

      // Mock Web Push API call
      await new Promise(resolve => setTimeout(resolve, 150));

      // Simulate occasional failures
      if (Math.random() < 0.04) { // 4% failure rate
        throw new Error('Web Push: Subscription no longer valid');
      }

      const messageId = `web-push-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Web Push error',
      };
    }
  }
}

// Push Provider Factory
export function createPushProvider(): PushProvider {
  switch (config.providers.push.type) {
    case 'apns':
      return new APNSProvider();
    case 'web-push':
      return new WebPushProvider();
    case 'fcm':
    default:
      return new FCMProvider();
  }
}