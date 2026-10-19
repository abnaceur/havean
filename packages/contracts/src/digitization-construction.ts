import {z} from 'zod';
import {geometryPoint,geometryDecimal,geometryScaleStatus} from './digitization-geometry';
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),positive=geometryDecimal.refine(v=>Number(v)>0&&Number(v)<=100);
export const digitizationConstructionReport=z.strictObject({
 geometryRevisionId:z.uuid().nullable(),previewReady:z.boolean(),scaleStatus:geometryScaleStatus.nullable(),
 counts:z.strictObject({floors:z.number().int().nonnegative(),rooms:z.number().int().nonnegative(),walls:z.number().int().nonnegative(),openings:z.number().int().nonnegative(),furnishings:z.number().int().nonnegative()}),
 issues:z.array(z.strictObject({code:z.string(),severity:z.enum(['blocking','review']),entityId:z.string().nullable(),message:z.string()})).max(5000),
 publicationReady:z.literal(false)
});
export const digitizationConstructionEdit=z.strictObject({
 version:z.number().int().positive(),geometryRevisionId:z.uuid(),note:z.string().trim().min(5).max(500),suppliedLayoutConfirmed:z.literal(true),
 operation:z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('wall'),wallId:id,start:geometryPoint,end:geometryPoint,thickness:positive}),
  z.strictObject({kind:z.literal('room'),roomId:id,name:z.string().trim().min(1).max(80),polygon:z.array(geometryPoint).min(3).max(128)}),
  z.strictObject({kind:z.literal('opening'),openingId:id,offset:geometryDecimal,width:positive,sill:geometryDecimal.nullable(),height:positive.nullable()})
 ])
});
