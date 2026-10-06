import {z} from 'zod';
import {money} from './domain';
const version=z.number().int().positive(),reason=z.string().trim().min(5).max(1000);
export const ownerPriceChange=z.object({version,ownerGrantVersion:version,price:money.refine(value=>BigInt(value.replace('.',''))>0,'Use a positive asking price.'),reason}).strict();
export const ownerLifecycleAction=z.object({version,ownerGrantVersion:version,action:z.enum(['pause','renew','complete']),reason}).strict();
export const ownerListingRecord=z.object({id:z.uuid(),slug:z.string(),title:z.string(),transaction:z.enum(['sale','rent']),currency:z.string(),price:z.string().nullable(),segment:z.enum(['residential','commercial']),priceBasis:z.enum(['total','per_area']).nullable(),areaBasis:z.enum(['gross','usable']).nullable(),commercialFactsIncomplete:z.boolean(),rentPeriod:z.enum(['day','month','year']).nullable(),status:z.string(),version,ownerGrantVersion:version.nullable(),pendingRevision:z.object({id:z.uuid(),price:z.string(),version}).nullable()});
