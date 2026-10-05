import {z} from 'zod';
export const notificationPreferences=z.object({emailEnabled:z.boolean(),inAppEnabled:z.boolean(),version:z.number().int().nonnegative()});
export const notificationPreferenceUpdate=notificationPreferences.strict();
export const notificationVersion=z.object({version:z.number().int().positive()}).strict();
export const notificationPlanInput=z.object({version:z.literal(0),listingVersion:z.number().int().positive()}).strict();
export const alertStatus=z.enum(['queued','processing','accepted','in_app','failed','cancelled']);
export const alertSummary=z.object({id:z.string().uuid(),version:z.number().int().positive(),status:alertStatus,dueAt:z.string(),attempts:z.number().int(),acceptanceRecordedAt:z.string().nullable(),errorCode:z.string().nullable()});
export const notificationRecord=z.object({id:z.string().uuid(),title:z.string(),body:z.string(),version:z.number().int().positive(),readAt:z.string().nullable(),createdAt:z.string(),link:z.string().nullable(),deliveryStatus:alertStatus.nullable()});
export const notificationEventInput=z.object({version:z.literal(0)}).strict();
