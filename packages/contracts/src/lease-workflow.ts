import {z} from 'zod';
export const leaseActivation=z.object({version:z.number().int().positive(),unitVersion:z.number().int().positive(),grantVersion:z.number().int().positive(),tenantVersion:z.number().int().positive(),confirm:z.literal(true)}).strict();
