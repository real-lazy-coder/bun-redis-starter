import config from '../config';
import { SendEmailDto } from '../models/validation';

export interface EmailProvider {
  name: string;
  send(email: SendEmailDto): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Mock SMTP Provider (in production, use nodemailer or similar)
export class SMTPProvider implements EmailProvider {
  name = 'smtp';

  async send(email: SendEmailDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Mock SMTP sending - in production, use nodemailer
      console.log(`[SMTP] Sending email to: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`);
      console.log(`[SMTP] Subject: ${email.subject}`);
      console.log(`[SMTP] Content: ${email.content.substring(0, 100)}...`);

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate occasional failures for testing
      if (Math.random() < 0.05) { // 5% failure rate
        throw new Error('SMTP server temporarily unavailable');
      }

      const messageId = `smtp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SMTP error',
      };
    }
  }
}

// Mock SendGrid Provider
export class SendGridProvider implements EmailProvider {
  name = 'sendgrid';

  async send(email: SendEmailDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.email.config.apiKey) {
        throw new Error('SendGrid API key not configured');
      }

      console.log(`[SendGrid] Sending email to: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`);
      console.log(`[SendGrid] Subject: ${email.subject}`);

      // Mock SendGrid API call
      await new Promise(resolve => setTimeout(resolve, 200));

      // Simulate occasional failures
      if (Math.random() < 0.03) { // 3% failure rate
        throw new Error('SendGrid API rate limit exceeded');
      }

      const messageId = `sg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SendGrid error',
      };
    }
  }
}

// Mock AWS SES Provider
export class SESProvider implements EmailProvider {
  name = 'ses';

  async send(email: SendEmailDto): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!config.providers.email.config.region) {
        throw new Error('AWS SES region not configured');
      }

      console.log(`[AWS SES] Sending email to: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`);
      console.log(`[AWS SES] Subject: ${email.subject}`);

      // Mock AWS SES API call
      await new Promise(resolve => setTimeout(resolve, 150));

      // Simulate occasional failures
      if (Math.random() < 0.02) { // 2% failure rate
        throw new Error('AWS SES sending quota exceeded');
      }

      const messageId = `ses-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SES error',
      };
    }
  }
}

// Email Provider Factory
export function createEmailProvider(): EmailProvider {
  switch (config.providers.email.type) {
    case 'sendgrid':
      return new SendGridProvider();
    case 'ses':
      return new SESProvider();
    case 'smtp':
    default:
      return new SMTPProvider();
  }
}