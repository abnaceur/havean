import {z} from 'zod';
import {listingFilters} from './domain';
export const rankingFilters=listingFilters.safeExtend({period:z.enum(['7d','30d']).default('7d'),sort:z.literal('recommended').default('recommended')});
export const viewSignal=z.strictObject({eventId:z.uuid(),version:z.number().int().min(1),consent:z.boolean()});
export const boostCreate=z.strictObject({resourceType:z.enum(['listing','development']),resourceId:z.uuid(),city:z.string().regex(/^[a-z0-9-]{1,50}$/),points:z.coerce.number().int().min(0).max(100),sponsored:z.boolean(),publicLabel:z.string().trim().min(1).max(80),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),status:z.enum(['active','paused']).default('active')}).superRefine((x,ctx)=>{const interval=Date.parse(x.endsAt)-Date.parse(x.startsAt);if(interval<=0||interval>366*86400000)ctx.addIssue({code:'custom',path:['endsAt'],message:'End must follow start within 366 days'});});
export const boostUpdate=boostCreate.safeExtend({version:z.number().int().min(1)});
