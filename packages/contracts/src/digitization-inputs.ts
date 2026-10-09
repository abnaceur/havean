import {z} from 'zod';
import {digitizationGeometryRevision,geometryDecimal} from './digitization-geometry';
export const digitizationInputEdit=z.strictObject({version:z.number().int().positive(),inputRevision:z.number().int().positive()});
export const digitizationInputReserve=z.strictObject({version:z.number().int().positive()});
export const digitizationInputReservation=z.strictObject({digitizationId:z.uuid(),inputRevision:z.number().int().positive(),version:z.number().int().positive()});
export const digitizationPlanPageQuery=z.strictObject({clockwiseDegrees:z.coerce.number().finite().min(-180).max(180).default(0)});
export const digitizationPlanPageSelection=z.strictObject({digitizationId:z.uuid(),workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),artifactId:z.uuid(),source:z.strictObject({kind:z.literal('asset'),assetId:z.uuid(),page:z.number().int().min(1).max(50),originalToModel:z.array(z.number().finite()).length(9)}),width:z.number().finite().positive(),height:z.number().finite().positive(),uprightWidth:z.number().int().positive(),uprightHeight:z.number().int().positive(),modelToOriginal:z.array(z.number().finite()).length(9),uprightToModel:z.array(z.number().finite()).length(9),unit:z.literal('px'),scaleStatus:z.literal('unscaled')});
export const digitizationGeometrySave=z.strictObject({version:z.number().int().positive(),artifactId:z.uuid(),clockwiseDegrees:z.number().finite().min(-180).max(180),geometry:digitizationGeometryRevision});
export const digitizationGeometryView=z.strictObject({width:z.number().finite().positive(),height:z.number().finite().positive(),scaleRatio:z.number().finite().positive(),uprightToModel:z.array(z.number().finite()).length(9)});
export const digitizationGeometryDraft=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),artifactId:z.uuid(),clockwiseDegrees:z.number().finite().min(-180).max(180),geometry:digitizationGeometryRevision,view:digitizationGeometryView});
export const digitizationGeometryCalibration=z.strictObject({version:z.number().int().positive(),geometryRevisionId:z.uuid(),wallId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),distanceMetres:geometryDecimal.refine(v=>Number(v)>0,'Provide a positive reference distance'),note:z.string().min(5).max(500),observationConfirmed:z.literal(true)});
export const digitizationPlanPageList=z.array(z.strictObject({artifactId:z.uuid(),page:z.number().int().min(1).max(50),width:z.number().int().positive(),height:z.number().int().positive(),sourceNumber:z.number().int().positive()})).max(100);
export const digitizationAssetBind=digitizationInputEdit.extend({assetId:z.uuid(),assetVersion:z.number().int().positive(),purpose:z.enum(['document','plan','photo','panorama'])});
export const digitizationInputReceipt=z.strictObject({digitizationId:z.uuid(),inputRevision:z.number().int().positive(),version:z.number().int().positive(),bindingIds:z.array(z.uuid()),processingEligible:z.literal(false)});
const planObjectId=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const digitizationPlanEditOperation=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('split_room'),roomId:planObjectId,firstVertex:z.number().int().min(0).max(127),lastVertex:z.number().int().min(0).max(127)}),
 z.strictObject({kind:z.literal('merge_rooms'),firstRoomId:planObjectId,lastRoomId:planObjectId,name:z.string().min(1).max(80)}),
 z.strictObject({kind:z.literal('add_floor'),name:z.string().min(1).max(80)}),
 z.strictObject({kind:z.literal('connect_floors'),fromFloorId:planObjectId,toFloorId:planObjectId})
]);
export const digitizationGeometryEdit=digitizationGeometrySave.extend({operation:digitizationPlanEditOperation});
export const digitizationTraceCheckpoint=digitizationGeometrySave.extend({checkpointId:z.uuid()});
export const digitizationTraceCheckpointRecord=z.strictObject({id:z.uuid(),workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),artifactId:z.uuid(),clockwiseDegrees:z.number().finite().min(-180).max(180),geometry:digitizationGeometryRevision});
export const digitizationTraceConflict=z.strictObject({checkpoint:digitizationTraceCheckpointRecord.nullable(),current:digitizationGeometryDraft.nullable()});
