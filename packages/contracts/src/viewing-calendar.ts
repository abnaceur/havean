import {z} from 'zod';
export const viewingState=z.enum(['requested','confirmed','cancelled','completed','no_show']);
const date=z.string().date().refine(v=>Number(v.slice(0,4))>=1970&&Number(v.slice(0,4))<=2200,'Choose a supported calendar date');
export const viewingCalendarQuery=z.object({status:viewingState.optional(),from:date.optional(),to:date.optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict().refine(v=>!v.from||!v.to||v.to>=v.from,'End date must follow start date');
export const viewingRescheduleQuery=z.object({date:date.optional(),days:z.coerce.number().int().min(1).max(7).default(7)}).strict();
export const viewingReschedule=z.object({version:z.number().int().positive(),listingVersion:z.number().int().positive(),scheduleVersion:z.number().int().positive(),startAt:z.iso.datetime()}).strict();
export const viewingTerminalAction=z.object({version:z.number().int().positive(),status:z.enum(['completed','no_show'])}).strict();
export const calendarViewing=z.object({id:z.uuid(),listing_id:z.uuid(),agent_id:z.uuid(),start_at:z.string(),end_at:z.string(),status:viewingState,version:z.number().int().positive(),title:z.string(),time_zone:z.string(),zone_source:z.enum(['recorded','current']),current_listing_version:z.number().int().positive(),current_schedule_version:z.number().int().positive().nullable(),buffer_minutes:z.number().int().nonnegative()});
