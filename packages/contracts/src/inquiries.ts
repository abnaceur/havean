import {z} from 'zod';
import {inquirySchema} from './domain';
export const inquirySessionCreate=z.object({version:z.literal(0)}).strict();
export const inquirySessionRecord=z.object({id:z.uuid(),version:z.number().int().positive(),expiresAt:z.string(),policyVersion:z.literal(1),windowSeconds:z.literal(600),maximumRequests:z.literal(5)});
export const guestInquiry=inquirySchema.safeExtend({sessionVersion:z.number().int().positive(),resourceVersion:z.number().int().positive(),consentPolicyVersion:z.literal(1),website:z.literal('').default('')}).strict();
export const guestInquiryReceipt=z.object({id:z.uuid(),status:z.literal('new'),created_at:z.string(),conversationId:z.null()});
