import {z} from 'zod';
import {digitizationFactCandidate} from './digitization';
export const digitizationFactDecision=z.strictObject({
 version:z.number().int().positive(),inputRevision:z.number().int().positive(),candidateVersion:z.number().int().positive(),
 decision:z.enum(['accepted','corrected','rejected','unknown','conflict']),value:digitizationFactCandidate.shape.normalizedValue,
 note:z.string().trim().min(1).max(500)
});
export const digitizationFactHistory=z.strictObject({id:z.uuid(),candidateId:z.uuid(),candidateVersion:z.number().int().positive(),decision:digitizationFactDecision.shape.decision,value:digitizationFactCandidate.shape.normalizedValue,note:z.string().nullable(),actorId:z.uuid(),createdAt:z.iso.datetime()});
export const digitizationFactReview=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),
 candidates:z.array(digitizationFactCandidate).max(1000),history:z.array(digitizationFactHistory).max(5000),
 pages:z.array(z.strictObject({assetId:z.uuid(),page:z.number().int().positive(),artifactId:z.uuid(),width:z.number().int().positive(),height:z.number().int().positive()})).max(5000),
 conflictingFields:z.array(digitizationFactCandidate.shape.field),reviewRequired:z.literal(true)
});
export type DigitizationFactReview= z.infer<typeof digitizationFactReview>;
export type DigitizationFactDecision= z.infer<typeof digitizationFactDecision>;
