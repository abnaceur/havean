import {floorLayout} from './property-media';

export type CanonicalPoint = {x:number;y:number;z:number};
export type LegacyValueEvidence = 'legacy_supplied_unverified'|'legacy_default_illustrative';
export type LegacyGeometrySnapshot = {
 schemaVersion:'legacy-adapter-1';
 source:{kind:'legacy_floor_layout';assetId:string};
 coordinateSystem:'right-handed-z-up';
 unit:'m';
 scaleStatus:'legacy_supplied_unverified';
 metricMeasurementsAvailable:false;
 scaleAnchors:[];
 floor:{id:string;name:string;level:number;elevation:number;northDegrees:number;dimensions:{width:number;depth:number;evidence:'legacy_supplied_unverified'}};
 rooms:{id:string;name:string;floorId:string;polygon:CanonicalPoint[];height:{value:number;evidence:LegacyValueEvidence};panoramaLink:{sceneId:string;planPosition:CanonicalPoint;headingDegrees:number;evidence:'legacy_supplied_unverified'}}[];
};

// Rotation, not a reflection: old WebGL is Y-up with image depth on +Z.
// Canonical X/Y are horizontal and Z is up. The inverse restores old playback.
export function legacyYUpToCanonical([x,y,z]:readonly[number,number,number]):CanonicalPoint {
 return {x,y:-z,z:y};
}
export function canonicalToThreeYUp(point:CanonicalPoint):[number,number,number] {
 return [point.x,point.z,-point.y];
}

// This adapter is intentionally one-way and never mutates or approves a legacy
// record. It preserves IDs and supplied shape; it invents no wall/opening/pose.
export function legacyFloorToGeometry(assetId:string,input:unknown):LegacyGeometrySnapshot {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId))throw Error('A source floor-plan asset ID is required');
 const layout=floorLayout.parse(input),source=input as {rooms:{heightMetres?:number}[]};
 const position=(point:{x:number;y:number})=>legacyYUpToCanonical([(point.x-0.5)*layout.widthMetres,layout.elevationMetres,(point.y-0.5)*layout.depthMetres]);
 return {
  schemaVersion:'legacy-adapter-1',source:{kind:'legacy_floor_layout',assetId},coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'legacy_supplied_unverified',metricMeasurementsAvailable:false,scaleAnchors:[],
  floor:{id:assetId,name:layout.name,level:layout.level,elevation:layout.elevationMetres,northDegrees:layout.northDegrees,dimensions:{width:layout.widthMetres,depth:layout.depthMetres,evidence:'legacy_supplied_unverified'}},
  rooms:layout.rooms.map((room,index)=>({id:room.id,name:room.label,floorId:assetId,polygon:room.polygon.map(position),height:{value:room.heightMetres,evidence:source.rooms[index].heightMetres===undefined?'legacy_default_illustrative':'legacy_supplied_unverified'},panoramaLink:{sceneId:room.sceneId,planPosition:position(room.camera),headingDegrees:room.camera.headingDegrees,evidence:'legacy_supplied_unverified'}})),
 };
}
