import {z} from 'zod';
export const gsplatLegacyTrainingProfile='gsplat-1.5.3-cu126-fixed-density-investigation-v1';
export const gsplatTrainingProfile='gsplat-1.5.3-cu126-adaptive-investigation-v2';
export const isGsplatTrainingProfile=(id:string)=>id===gsplatTrainingProfile||id===gsplatLegacyTrainingProfile;
export const gsplatExportProfile='private-gsplat-scene-export-v1';
export const digitizationTrainingCreate=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),cameraReportId:z.uuid()});
const sha=z.string().regex(/^[a-f0-9]{64}$/),size=z.string().regex(/^[1-9]\d{0,8}$/).refine(v=>BigInt(v)<=32n*1024n*1024n);
const base={sha256:sha,byteSize:size};
export const digitizationTrainingOutput=z.discriminatedUnion('kind',[
 z.strictObject({...base,kind:z.literal('splat_scene'),mime:z.literal('application/x-ply'),splatCount:z.number().int().min(16).max(75000)}),
 z.strictObject({...base,kind:z.literal('splat_training_tier'),mime:z.literal('application/octet-stream'),tier:z.enum(['mobile','desktop']),splatCount:z.number().int().min(16).max(75000),encoding:z.literal('splat32-wxyz-v1')}),
 z.strictObject({...base,kind:z.literal('held_out_render'),mime:z.literal('image/png'),index:z.number().int().min(0).max(599),width:z.number().int().positive().max(1024),height:z.number().int().positive().max(1024)})
]);
export const digitizationTrainingResult=z.strictObject({processingProfile:z.enum([gsplatTrainingProfile,gsplatLegacyTrainingProfile]),inputArchiveSha256:sha,datasetFingerprint:sha,state:z.literal('awaiting_review'),iterations:z.union([z.literal(500),z.literal(3000),z.literal(6000)]),fallbacks:z.number().int().min(0).max(1),elapsedSeconds:z.number().finite().nonnegative().max(1200),splatCount:z.number().int().min(16).max(75000),heldOutMetrics:z.array(z.strictObject({frame:z.string().min(1).max(200),meanSquaredError:z.number().finite().nonnegative(),psnrDb:z.number().finite().nullable(),width:z.number().int().positive().max(1024),height:z.number().int().positive().max(1024)})).min(1).max(120),outputs:z.array(digitizationTrainingOutput).min(4).max(123),scale:z.null(),roomCoverage:z.null(),humanRenderReviewRequired:z.literal(true),publiclyServed:z.literal(false)}).superRefine((r,ctx)=>{
 const tiers=r.outputs.filter(o=>o.kind==='splat_training_tier'),scenes=r.outputs.filter(o=>o.kind==='splat_scene'),renders=r.outputs.filter(o=>o.kind==='held_out_render');
 if(tiers.length!==2||new Set(tiers.map(t=>t.tier)).size!==2||scenes.length!==1||scenes[0]?.splatCount!==r.splatCount||tiers.some(t=>t.splatCount>r.splatCount||BigInt(t.byteSize)!==BigInt(t.splatCount)*32n)||renders.length!==r.heldOutMetrics.length||new Set(renders.map(o=>o.index)).size!==renders.length||renders.some((o,i)=>o.width!==r.heldOutMetrics[i]?.width||o.height!==r.heldOutMetrics[i]?.height))ctx.addIssue({code:'custom',message:'Training outputs must match the measured scene and held-out views'});
});
