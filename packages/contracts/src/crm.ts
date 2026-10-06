import {z} from 'zod';
export const leadStatus=z.enum(['new','assigned','contacted','qualified','viewing','offer','won','lost']);
export const leadStageUpdate=z.object({version:z.number().int().positive(),status:leadStatus}).strict();
export const leadNoteCreate=z.object({version:z.number().int().positive(),text:z.string().trim().min(2).max(2000)}).strict();
export const leadQueueFilters=z.object({status:leadStatus.optional(),resourceType:z.enum(['listing','development','agent','provider']).optional(),agentId:z.uuid().optional(),text:z.string().trim().max(100).optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const leadActivity=z.object({id:z.uuid(),lead_id:z.uuid(),kind:z.enum(['created','stage','assignment','note']),actor_id:z.uuid().nullable(),version:z.number().int().positive(),previous_status:z.string().nullable(),status:z.string(),agent_id:z.uuid().nullable(),text:z.string().nullable(),created_at:z.string()});
