import {z} from 'zod';
import {draftFacts,draftUnit} from './inventory-drafts';
export const digitizationDraftCreate=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),decisionIds:z.array(z.uuid()).min(1).max(20),manualUnit:draftUnit.partial(),listing:draftFacts,authorityConfirmed:z.literal(true)});
export const digitizationDraftReceipt=z.strictObject({id:z.uuid(),listingId:z.uuid(),unitId:z.uuid(),workspaceVersion:z.number().int().positive(),listingVersion:z.literal(1),status:z.literal('draft'),sourceEvidenceTransferred:z.literal(false),reviewRequired:z.literal(true)});
export type DigitizationDraftCreate=z.infer<typeof digitizationDraftCreate>;
