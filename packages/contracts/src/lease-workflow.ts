import {z} from 'zod';
import {leaseDraftUpdate} from './lease-drafts';
export const leaseActivation=z.object({version:z.number().int().positive(),unitVersion:z.number().int().positive(),grantVersion:z.number().int().positive(),tenantVersion:z.number().int().positive(),confirm:z.literal(true)}).strict();
export const leaseRenewal=leaseDraftUpdate.safeExtend({reason:z.string().trim().min(5).max(500)});
export const leaseEnding=z.object({version:z.number().int().positive(),kind:z.enum(['completed','terminated']),reason:z.string().trim().min(5).max(500),confirm:z.literal(true)}).strict();
export const leaseWorkflowRecord=z.object({id:z.uuid(),version:z.number().int().positive(),status:z.string(),unitId:z.uuid(),tenantId:z.uuid(),community:z.string(),tenant:z.string(),startDate:z.string(),endDate:z.string(),rent:z.string(),currency:z.string(),dueDay:z.number().int().nullable(),native:z.boolean(),previousLeaseId:z.uuid().nullable(),nextLeaseId:z.uuid().nullable(),ending:z.object({version:z.number().int(),kind:z.enum(['completed','terminated']),reason:z.string(),at:z.string(),availabilityReviewRequired:z.literal(true)}).nullable(),activity:z.array(z.object({version:z.number().int(),action:z.string(),at:z.string(),reason:z.string().nullable()}))});
export type LeaseWorkflowRecord=z.infer<typeof leaseWorkflowRecord>;
