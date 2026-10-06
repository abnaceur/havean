import {z} from 'zod';
import {leadQueueFilters} from './crm';
import {viewingState} from './viewing-calendar';
export const leadExportQuery=leadQueueFilters.omit({page:true});
const date=z.string().date().refine(v=>Number(v.slice(0,4))>=1970&&Number(v.slice(0,4))<=2200,'Choose a supported date');
export const viewingExportQuery=z.object({status:viewingState.optional(),from:date.optional(),to:date.optional()}).strict().refine(v=>!v.from||!v.to||v.to>=v.from,'End date must follow start date');
export const csvExport=z.object({filename:z.string(),content:z.string(),records:z.number().int().nonnegative(),generatedAt:z.iso.datetime(),scope:z.enum(['team','assigned'])});
export const viewingReminderSummary=z.object({id:z.uuid(),version:z.number().int().positive(),status:z.enum(['queued','processing','failed','accepted','in_app','cancelled']),attempts:z.number().int().nonnegative(),dueAt:z.iso.datetime(),acceptedAt:z.iso.datetime().nullable(),errorCode:z.string().nullable()});
