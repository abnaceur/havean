import {z} from 'zod';
const version=z.number().int().positive(),role=z.enum(['agent','agency_manager']);
export const agencyInvite=z.object({version:z.literal(0),email:z.email().transform(v=>v.toLowerCase()),role,reason:z.string().trim().min(5).max(1000)}).strict();
export const agencyInviteDecision=z.object({version,action:z.enum(['accept','decline','cancel']),reason:z.string().trim().min(5).max(1000)}).strict();
export const agencyMembershipUpdate=z.object({version,role,status:z.enum(['active','inactive']),reason:z.string().trim().min(5).max(1000)}).strict();
export const agencyInvitationRecord=z.object({id:z.uuid(),organizationId:z.uuid(),organizationName:z.string(),email:z.email(),role,status:z.enum(['pending','accepted','declined','cancelled','expired']),version,expiresAt:z.string(),createdAt:z.string()});
export const agencyMemberRecord=z.object({id:z.uuid(),userId:z.uuid(),displayName:z.string(),role:z.string(),status:z.string(),version});
