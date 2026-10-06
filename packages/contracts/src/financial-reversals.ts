import {z} from 'zod';
const version=z.number().int().positive();
export const financialRecordType=z.enum(['charge','payment']);
export const financialReversal=z.object({version,leaseVersion:version,unitVersion:version,grantVersion:version,reason:z.string().trim().min(5).max(500),confirm:z.literal(true)}).strict();
export const financialReversalRecord=z.object({id:z.uuid(),recordType:financialRecordType,version,leaseId:z.uuid(),leaseVersion:version,unitVersion:version,grantVersion:version,currency:z.string(),amount:z.string(),reference:z.string(),eligible:z.boolean(),reversesId:z.uuid().nullable(),reversal:z.object({id:z.uuid(),reason:z.string().nullable(),actorId:z.uuid().nullable(),at:z.string(),native:z.boolean(),undoneAllocationIds:z.array(z.uuid())}).nullable()});
export type FinancialReversalRecord=z.infer<typeof financialReversalRecord>;
