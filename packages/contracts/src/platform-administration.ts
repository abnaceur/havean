import {z} from 'zod';
const version=z.number().int().positive(),reason=z.string().trim().min(10).max(1000);
export const platformRole=z.enum(['moderator','support','editor','admin']);
export const platformUserQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),text:z.string().trim().max(120).default(''),state:z.enum(['active','suspended']).optional()}).strict();
export const platformAccountAction=z.object({version,action:z.enum(['suspend','reactivate']),reason}).strict();
export const platformStaffSave=z.object({version:z.number().int().min(0),profileVersion:version,role:platformRole,status:z.enum(['active','revoked']),reason}).strict();
export const platformUser=z.object({id:z.uuid(),displayName:z.string(),email:z.string(),state:z.string(),version,staff:z.array(z.object({id:z.uuid(),role:platformRole,status:z.string(),version})),activity:z.array(z.object({id:z.uuid(),kind:z.string(),actorId:z.uuid(),at:z.string(),reason:z.string(),before:z.unknown(),after:z.unknown()}))});
export const platformUserPage=z.object({page:version,limit:z.literal(20),total:z.number().int().nonnegative(),items:z.array(platformUser)});
