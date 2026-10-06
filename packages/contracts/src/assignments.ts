import {z} from 'zod';
export const leadAssignment=z.object({agentId:z.uuid(),version:z.number().int().positive(),reason:z.string().trim().min(5).max(1000)}).strict();
export const listingAssignment=leadAssignment.extend({listingId:z.uuid(),policy:z.enum(['preserve_leads','move_open_leads'])}).strict();
export const assignmentAgent=z.object({id:z.uuid(),name:z.string(),city:z.string().nullable(),districts:z.array(z.string()),eligibleUntil:z.string()});
export const assignmentResult=z.object({id:z.uuid(),version:z.number().int().positive(),agentId:z.uuid(),movedLeads:z.number().int().nonnegative()});
