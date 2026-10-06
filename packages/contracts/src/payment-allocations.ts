import {z} from 'zod';
import {leaseRent} from './lease-drafts';
const version=z.number().int().positive();
export const allocationLedgerQuery=z.object({paymentPage:z.coerce.number().int().min(1).max(10000).default(1),chargePage:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const paymentAllocation=z.object({version:z.literal(0),leaseId:z.uuid(),leaseVersion:version,unitVersion:version,grantVersion:version,paymentId:z.uuid(),paymentVersion:version,chargeId:z.uuid(),chargeVersion:version,amount:leaseRent,currency:z.string().regex(/^[A-Z]{3}(?![\s\S])/),confirm:z.literal(true)}).strict();
export const allocationRecord=z.object({id:z.uuid(),leaseId:z.uuid(),version,paymentId:z.uuid(),chargeId:z.uuid(),amount:z.string(),currency:z.string(),reversedAt:z.string().nullable()});
export const allocationLedgerRecord=z.object({leaseId:z.uuid(),leaseVersion:version,unitVersion:version,grantVersion:version,currency:z.string(),totals:z.object({charges:z.string(),recordedPayments:z.string(),allocated:z.string(),outstanding:z.string(),credit:z.string()}),paymentPage:version,chargePage:version,limit:z.literal(20),paymentTotal:z.number().int(),chargeTotal:z.number().int(),payments:z.array(z.object({id:z.uuid(),version,reference:z.string(),amount:z.string(),available:z.string()})),charges:z.array(z.object({id:z.uuid(),version,period:z.string(),kind:z.string(),amount:z.string(),outstanding:z.string()}))});
export type AllocationLedgerRecord=z.infer<typeof allocationLedgerRecord>;
