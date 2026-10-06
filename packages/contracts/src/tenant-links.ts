import {z} from 'zod';
export const tenantInvite=z.object({version:z.literal(0),grantId:z.uuid(),grantVersion:z.number().int().positive(),name:z.string().trim().min(2).max(100),email:z.email().transform(x=>x.toLowerCase())}).strict();
export const tenantInviteDecision=z.object({version:z.number().int().positive(),action:z.enum(['accept','decline','cancel']),reason:z.string().trim().min(5).max(500),consent:z.boolean().optional()}).strict().refine(x=>x.action!=='accept'||x.consent===true,'Confirm tenant account linkage');
export const tenantInviteRecord=z.object({id:z.uuid(),organizationId:z.uuid(),organization:z.string(),unitId:z.uuid(),community:z.string(),name:z.string(),email:z.string(),status:z.enum(['pending','accepted','declined','cancelled','expired']),version:z.number().int().positive(),expiresAt:z.string(),tenantId:z.uuid().nullable(),activity:z.array(z.object({version:z.number().int(),action:z.string(),at:z.string()}))});
export const tenantProfileRecord=z.object({id:z.uuid(),name:z.string(),email:z.string(),organization:z.string()});
export type TenantInviteRecord=z.infer<typeof tenantInviteRecord>;
export type TenantProfileRecord=z.infer<typeof tenantProfileRecord>;
