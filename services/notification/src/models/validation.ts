import { z } from 'zod';

// Notification Template Schemas
export const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['email', 'sms', 'push']),
  language: z.string().default('en'),
  subject: z.string().optional(), // For email templates
  content: z.string().min(1),
  variables: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>;

// Notification Request Schemas
export const SendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string().min(1),
  content: z.string().min(1),
  html: z.string().optional(),
  templateId: z.string().optional(),
  variables: z.record(z.any()).optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(), // Base64 encoded
    contentType: z.string(),
  })).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  scheduledAt: z.string().datetime().optional(),
});

export const SendSmsSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  content: z.string().min(1).max(1600), // SMS character limit
  templateId: z.string().optional(),
  variables: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  scheduledAt: z.string().datetime().optional(),
});

export const SendPushSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]), // Device tokens or user IDs
  title: z.string().min(1),
  body: z.string().min(1),
  icon: z.string().optional(),
  image: z.string().optional(),
  data: z.record(z.any()).optional(),
  templateId: z.string().optional(),
  variables: z.record(z.any()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  scheduledAt: z.string().datetime().optional(),
});

export const BatchNotificationSchema = z.object({
  type: z.enum(['email', 'sms', 'push']),
  notifications: z.array(z.union([SendEmailSchema, SendSmsSchema, SendPushSchema])),
  batchSize: z.number().min(1).max(1000).default(100),
  delayBetweenBatches: z.number().min(0).default(1000), // milliseconds
});

export type SendEmailDto = z.infer<typeof SendEmailSchema>;
export type SendSmsDto = z.infer<typeof SendSmsSchema>;
export type SendPushDto = z.infer<typeof SendPushSchema>;
export type BatchNotificationDto = z.infer<typeof BatchNotificationSchema>;

// Notification Preference Schemas
export const NotificationPreferenceSchema = z.object({
  userId: z.string(),
  email: z.object({
    enabled: z.boolean().default(true),
    address: z.string().email(),
    frequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']).default('immediate'),
    categories: z.array(z.string()).default([]),
  }),
  sms: z.object({
    enabled: z.boolean().default(false),
    number: z.string().optional(),
    frequency: z.enum(['immediate', 'daily']).default('immediate'),
    categories: z.array(z.string()).default([]),
  }),
  push: z.object({
    enabled: z.boolean().default(true),
    deviceTokens: z.array(z.string()).default([]),
    frequency: z.enum(['immediate', 'hourly']).default('immediate'),
    categories: z.array(z.string()).default([]),
  }),
});

export const UpdateNotificationPreferenceSchema = z.object({
  email: z.object({
    enabled: z.boolean(),
    address: z.string().email(),
    frequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']),
    categories: z.array(z.string()),
  }).partial().optional(),
  sms: z.object({
    enabled: z.boolean(),
    number: z.string(),
    frequency: z.enum(['immediate', 'daily']),
    categories: z.array(z.string()),
  }).partial().optional(),
  push: z.object({
    enabled: z.boolean(),
    deviceTokens: z.array(z.string()),
    frequency: z.enum(['immediate', 'hourly']),
    categories: z.array(z.string()),
  }).partial().optional(),
});

export type NotificationPreferenceDto = z.infer<typeof NotificationPreferenceSchema>;
export type UpdateNotificationPreferenceDto = z.infer<typeof UpdateNotificationPreferenceSchema>;