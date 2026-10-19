import {z} from 'zod';
const base=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),reviewerId:z.uuid(),previewDelegationConfirmed:z.literal(true)});
export const digitizationModelReviewCreate=z.discriminatedUnion('modelType',[
 base.extend({modelType:z.literal('structural'),geometryRevisionId:z.uuid()}),
 base.extend({modelType:z.literal('splat'),sceneArtifactId:z.uuid()}),
]);
export const digitizationModelReviewDecision=z.strictObject({requestVersion:z.literal(1),workspaceVersion:z.number().int().positive(),decision:z.enum(['approved','rejected']),privacyConfirmed:z.boolean(),limitationsConfirmed:z.boolean(),reason:z.string().trim().min(5).max(1000)}).superRefine((value,context)=>{if(value.decision==='approved'&&(!value.privacyConfirmed||!value.limitationsConfirmed))context.addIssue({code:'custom',message:'Approval requires explicit privacy and visualization-limitations confirmation.'});});
export const digitizationModelReviewApproval=z.strictObject({id:z.uuid(),version:z.literal(1),decision:z.enum(['approved','rejected']),reason:z.string(),reviewerId:z.uuid(),requestId:z.uuid(),modelType:z.enum(['structural','splat']),candidateChecksum:z.string().regex(/^[a-f0-9]{64}$/),metricMeasurementsAvailable:z.literal(false),publiclyServed:z.literal(false)});
export const digitizationModelReviewRequest=z.strictObject({id:z.uuid(),version:z.literal(1),workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),modelType:z.enum(['structural','splat']),reviewerId:z.uuid(),createdBy:z.uuid(),createdAt:z.iso.datetime(),candidateChecksum:z.string().regex(/^[a-f0-9]{64}$/),sourceCount:z.number().int().min(1).max(100),scaleStatus:z.enum(['estimated','unscaled']),metricMeasurementsAvailable:z.literal(false),publiclyServed:z.literal(false),current:z.boolean(),approval:digitizationModelReviewApproval.nullable()});
export const digitizationModelReviewQueue=z.array(digitizationModelReviewRequest).max(100);
