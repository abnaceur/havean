import {z} from 'zod';
export const digitizationSceneEvidence=z.strictObject({
 iterations:z.number().int().positive(),elapsedSeconds:z.number().finite().nonnegative(),splatCount:z.number().int().positive(),fallbacks:z.number().int().nonnegative(),
 renders:z.array(z.strictObject({id:z.uuid(),width:z.number().int().positive().max(1024),height:z.number().int().positive().max(1024),psnrDb:z.number().finite().nullable()})).max(120),
 roomCoverage:z.null(),scaleStatus:z.literal('unscaled'),reviewRequired:z.literal(true)
}).nullable();
