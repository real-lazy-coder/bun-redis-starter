// Configuration for Notification Service
interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  host: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    pretty: boolean;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  providers: {
    email: {
      type: 'smtp' | 'sendgrid' | 'ses' | 'mailgun';
      config: Record<string, any>;
    };
    sms: {
      type: 'twilio' | 'aws-sns' | 'nexmo';
      config: Record<string, any>;
    };
    push: {
      type: 'fcm' | 'apns' | 'web-push';
      config: Record<string, any>;
    };
  };
  templates: {
    defaultLanguage: string;
    supportedLanguages: string[];
  };
  rateLimit: {
    emailPerMinute: number;
    smsPerMinute: number;
    pushPerMinute: number;
  };
}

const config: ServiceConfig = {
  name: 'notification-service',
  version: '1.0.0',
  port: parseInt(process.env.PORT || '3005', 10),
  host: process.env.HOST || '0.0.0.0',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '2', 10), // Use different DB
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  providers: {
    email: {
      type: (process.env.EMAIL_PROVIDER as any) || 'smtp',
      config: {
        // SMTP configuration
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        // SendGrid configuration
        apiKey: process.env.SENDGRID_API_KEY,
        // AWS SES configuration
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        // Mailgun configuration
        mailgunApiKey: process.env.MAILGUN_API_KEY,
        domain: process.env.MAILGUN_DOMAIN,
      },
    },
    sms: {
      type: (process.env.SMS_PROVIDER as any) || 'twilio',
      config: {
        // Twilio configuration
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        from: process.env.TWILIO_FROM_NUMBER,
        // AWS SNS configuration
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
    push: {
      type: (process.env.PUSH_PROVIDER as any) || 'fcm',
      config: {
        // Firebase Cloud Messaging
        serverKey: process.env.FCM_SERVER_KEY,
        // Apple Push Notification Service
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
        bundleId: process.env.APNS_BUNDLE_ID,
        // Web Push
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
        vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
        vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      },
    },
  },
  templates: {
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
    supportedLanguages: process.env.SUPPORTED_LANGUAGES?.split(',') || ['en'],
  },
  rateLimit: {
    emailPerMinute: parseInt(process.env.EMAIL_RATE_LIMIT || '60', 10),
    smsPerMinute: parseInt(process.env.SMS_RATE_LIMIT || '10', 10),
    pushPerMinute: parseInt(process.env.PUSH_RATE_LIMIT || '1000', 10),
  },
};

export default config;