import {z} from 'zod';
const amount=/^\d+(?:\.\d{1,2})?(?![\s\S])/;
export const leaseRent=z.string().regex(amount,'Use a decimal rent amount').refine(v=>{if(!amount.test(v))return false;const [a,b='']=v.split('.'),c=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));return c>0n&&c<=100000000000000n;},'Rent must be positive and at most 1000000000000.00');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}(?![\s\S])/).refine(v=>{const d=new Date(v+'T00:00:00.000Z');return v.slice(0,4)!=='0000'&&!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;},'Choose a valid calendar date');
const document=z.object({assetId:z.uuid(),version:z.number().int().positive(),label:z.string().trim().min(2).max(100)}).strict();
const terms={unitVersion:z.number().int().positive(),grantVersion:z.number().int().positive(),tenantVersion:z.number().int().positive(),startDate:date,endDate:date,rent:leaseRent,currency:z.string().regex(/^[A-Z]{3}(?![\s\S])/),rentPeriod:z.literal('month'),dueDay:z.number().int().min(1).max(28),documents:z.array(document).max(10).refine(v=>new Set(v.map(x=>x.assetId)).size===v.length,'Duplicate document')};
export const leaseDraftCreate=z.object({version:z.literal(0),unitId:z.uuid(),tenantId:z.uuid(),...terms}).strict().refine(v=>v.endDate>=v.startDate,'End date cannot precede start date');
export const leaseDraftUpdate=z.object({version:z.number().int().positive(),...terms}).strict().refine(v=>v.endDate>=v.startDate,'End date cannot precede start date');
export const leaseDraftRecord=z.object({id:z.uuid(),unitId:z.uuid(),tenantId:z.uuid(),version:z.number().int().positive(),status:z.string(),community:z.string(),tenant:z.string(),unitVersion:z.number().int().positive(),grantVersion:z.number().int().positive(),tenantVersion:z.number().int().positive(),startDate:z.string(),endDate:z.string(),rent:z.string(),currency:z.string(),rentPeriod:z.literal('month'),dueDay:z.number().int(),documents:z.array(document.extend({url:z.string()})),activity:z.array(z.object({version:z.number().int(),action:z.string(),at:z.string()}))});
export const leaseDraftSource=z.object({unitId:z.uuid(),unitVersion:z.number().int().positive(),grantVersion:z.number().int().positive(),currency:z.string(),community:z.string(),tenants:z.array(z.object({id:z.uuid(),name:z.string(),version:z.number().int().positive()}))});

export type LeaseDraftRecord=z.infer<typeof leaseDraftRecord>;
export type LeaseDraftSource=z.infer<typeof leaseDraftSource>;
