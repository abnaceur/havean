import {z} from 'zod';
/** Source processing/preview permission never implies independent review or
 * public derivative consent. Each added permission requires its own opt-in. */
export const digitizationModelSourceConsent=z.strictObject({
 modelReviewConsentConfirmed:z.literal(true).optional(),
 modelPublicationConsentConfirmed:z.literal(true).optional(),
});
export function modelSourceConsentValid(input:{purposes:string[];modelReviewConsentConfirmed?:true;modelPublicationConsentConfirmed?:true}){
 const review=input.purposes.includes('model_review'),publication=input.purposes.includes('model_publication');
 return (!review||input.modelReviewConsentConfirmed===true&&input.purposes.includes('preview')&&input.purposes.includes('document_processing'))&&(!publication||review&&input.modelPublicationConsentConfirmed===true);
}
export const digitizationModelSourcePermissionScope=z.strictObject({
 digitizationId:z.uuid(),workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),inputState:z.enum(['reserved','current']),
 sources:z.array(z.strictObject({assetId:z.uuid(),assetVersion:z.number().int().positive(),mime:z.string(),purpose:z.string()})).max(100),
 recipients:z.array(z.strictObject({id:z.uuid(),name:z.string()})).max(100),
 grants:z.array(z.strictObject({id:z.uuid(),assetId:z.uuid(),granteeId:z.uuid(),version:z.number().int().positive(),purposes:z.array(z.enum(['preview','document_processing','model_review','model_publication'])),state:z.enum(['active','revoked']),expiresAt:z.iso.datetime()})).max(1000),
});
export const digitizationModelSourceRevoke=z.strictObject({workspaceVersion:z.number().int().positive(),grantVersion:z.number().int().positive(),reason:z.string().trim().min(10).max(1000)});

export const digitizationDelegatedSources=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),listingId:z.uuid(),sources:z.array(z.strictObject({assetId:z.uuid(),assetVersion:z.number().int().positive(),mime:z.string(),bytes:z.string().regex(/^[1-9][0-9]*$/)})).max(100)});
