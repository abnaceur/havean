import {z} from 'zod';
import {leaseRent} from './lease-drafts';
const version=z.number().int().positive(),nonnegative=z.number().int().nonnegative();
export const depositLedgerQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const depositMovement=z.object({version:z.literal(0),leaseId:z.uuid(),leaseVersion:version,unitVersion:version,grantVersion:version,liabilityVersion:nonnegative,kind:z.enum(['received','released','adjusted']),direction:z.enum(['increase','decrease']),amount:leaseRent,currency:z.string().regex(/^[A-Z]{3}(?![\s\S])/),reason:z.string().trim().min(5).max(500),confirm:z.literal(true)}).strict().refine(v=>v.kind==='adjusted'||v.direction===(v.kind==='received'?'increase':'decrease'),'Movement direction does not match the evidence type');
export const depositRecord=z.object({id:z.uuid(),leaseId:z.uuid(),version,kind:z.enum(['received','released','adjusted']),direction:z.enum(['increase','decrease']).nullable(),amount:z.string(),currency:z.string(),reason:z.string(),actorId:z.uuid(),at:z.string(),liabilityVersion:version.nullable(),heldBefore:z.string().nullable(),heldAfter:z.string().nullable(),native:z.boolean()});
export const depositLedgerRecord=z.object({leaseId:z.uuid(),leaseVersion:version,unitVersion:version,grantVersion:version,currency:z.string(),liabilityVersion:nonnegative,held:z.string(),page:version,limit:z.literal(20),total:nonnegative,items:z.array(depositRecord),note:z.string()});
export type DepositLedgerRecord=z.infer<typeof depositLedgerRecord>;
