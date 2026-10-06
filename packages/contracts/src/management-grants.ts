import {z} from 'zod';
const expiry=z.iso.datetime({offset:true});
export const managementGrantCreate=z.object({version:z.literal(0),unitId:z.uuid(),unitVersion:z.number().int().positive(),ownerGrantVersion:z.number().int().positive(),organizationId:z.uuid(),expiresAt:expiry,consent:z.literal(true)}).strict();
export const managementGrantUpdate=z.discriminatedUnion('action',[z.object({action:z.literal('renew'),version:z.number().int().positive(),unitVersion:z.number().int().positive(),ownerGrantVersion:z.number().int().positive(),expiresAt:expiry,consent:z.literal(true)}).strict(),z.object({action:z.literal('revoke'),version:z.number().int().positive(),reason:z.string().trim().min(5).max(500)}).strict()]);
export const managementGrantPage=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const managementUnit=z.object({id:z.uuid(),version:z.number().int().positive(),ownerGrantVersion:z.number().int().positive(),community:z.string(),city:z.string(),currency:z.string(),area:z.string(),beds:z.number().int()});
export const managementGrantRecord=z.object({id:z.uuid(),unit_id:z.uuid(),organization_id:z.uuid(),organization:z.string(),owner:z.string(),version:z.number().int().positive(),status:z.enum(['active','revoked']),starts_at:z.string().nullable(),expires_at:z.string(),historical:z.boolean(),effective:z.boolean(),unitVersion:z.number().int().nullable(),ownerGrantVersion:z.number().int().nullable(),community:z.string(),city:z.string(),currency:z.string(),area:z.string(),beds:z.number().int(),activity:z.array(z.object({version:z.number().int(),action:z.string(),note:z.string(),at:z.string()}))});

export type ManagementGrantRecord=z.infer<typeof managementGrantRecord>;
export type ManagementUnitRecord=z.infer<typeof managementUnit>;
