import {z} from 'zod';
export const agentDirectoryFilters=z.object({city:z.string().regex(/^[a-z0-9-]{1,100}$/).default('bj'),q:z.string().trim().max(120).default(''),districtId:z.uuid().optional(),language:z.string().trim().min(2).max(40).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const agentStatistics=z.object({publishedListings:z.number().int().nonnegative(),completedViewings:z.null(),activityVerified:z.literal(false),asOf:z.string(),definition:z.string()});
