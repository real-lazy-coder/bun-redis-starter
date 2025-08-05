import config from '../config';
import { SendSmsDto } from '../models/validation';

export interface SmsProvider {
  name: string;
  send(sms: SendSmsDto): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Mock Twilio Provider
export class TwilioProvider implements SmsProvider {
  name = 'twilio';

  async send(sms: SendSmsDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.sms.config.accountSid || !config.providers.sms.config.authToken) {
        throw new Error('Twilio credentials not configured');
      }

      console.log(`[Twilio] Sending SMS to: ${Array.isArray(sms.to) ? sms.to.join(', ') : sms.to}`);
      console.log(`[Twilio] Content: ${sms.content.substring(0, 50)}...`);

      // Mock Twilio API call
      await new Promise(resolve => setTimeout(resolve, 300));

      // Simulate occasional failures
      if (Math.random() < 0.05) { // 5% failure rate
        throw new Error('Twilio: Invalid phone number format');
      }

      const messageId = `twilio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Twilio error',
      };
    }
  }
}

// Mock AWS SNS Provider
export class AWSSNSProvider implements SmsProvider {
  name = 'aws-sns';

  async send(sms: SendSmsDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.sms.config.region) {
        throw new Error('AWS SNS region not configured');
      }

      console.log(`[AWS SNS] Sending SMS to: ${Array.isArray(sms.to) ? sms.to.join(', ') : sms.to}`);
      console.log(`[AWS SNS] Content: ${sms.content.substring(0, 50)}...`);

      // Mock AWS SNS API call
      await new Promise(resolve => setTimeout(resolve, 250));

      // Simulate occasional failures
      if (Math.random() < 0.03) { // 3% failure rate
        throw new Error('AWS SNS: Message delivery failed');
      }

      const messageId = `sns-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown AWS SNS error',
      };
    }
  }
}

// SMS Provider Factory
export function createSmsProvider(): SmsProvider {
  switch (config.providers.sms.type) {
    case 'aws-sns':
      return new AWSSNSProvider();
    case 'twilio':
    default:
      return new TwilioProvider();
  }
}