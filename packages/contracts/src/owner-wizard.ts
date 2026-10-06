import {z} from 'zod';
export const ownerWizardFields=z.object({title:z.string().max(160).optional(),transaction:z.enum(['sale','rent']).optional(),districtId:z.union([z.uuid(),z.literal('')]).optional(),communityId:z.union([z.uuid(),z.literal('')]).optional(),area:z.string().max(40).optional(),beds:z.string().max(3).optional(),livingRooms:z.string().max(3).optional(),price:z.string().max(40).optional(),rentPeriod:z.enum(['day','month','year']).optional(),description:z.string().max(5000).optional(),contact:z.string().max(100).optional(),contactAudience:z.enum(['reviewers_only','assigned_team']).optional(),consent:z.boolean().optional()}).strict();
export const ownerWizardCreate=z.object({version:z.literal(0),city:z.string().regex(/^[a-z0-9-]{1,50}$/)}).strict();
export const ownerWizardUpdate=z.object({version:z.number().int().positive(),step:z.number().int().min(0).max(4),data:ownerWizardFields}).strict();
export const ownerWizardSubmit=z.object({version:z.number().int().positive(),consent:z.literal(true)}).strict();
export type OwnerWizardFields=z.infer<typeof ownerWizardFields>;
