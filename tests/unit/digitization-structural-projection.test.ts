import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {prepareStructuralPublicDerivative} from '../../apps/api/src/inventory/digitization/structural-projection';
import {renderStructuralGlb} from '../../apps/api/src/inventory/digitization/structural-glb';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/digitization-geometry';
const {validateBytes}=createRequire(import.meta.url)('gltf-validator'),source={kind:'manual' as const,actorId:'10000000-0000-4000-8000-000000000003',note:'Private source note and owner identity'};
const geometry:DigitizationGeometryRevision={schemaVersion:2,id:'10000000-0000-4000-8000-000000000001',organizationId:'10000000-0000-4000-8000-000000000002',targetId:'10000000-0000-4000-8000-000000000004',revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'m',scaleStatus:'estimated',sourceAssets:[],sources:[source],scaleAnchors:[{id:'private-anchor',points:[{x:0,y:0},{x:5,y:0}],distanceMetres:'5',source,reviewerId:source.actorId,status:'confirmed'}],floors:[{id:'private-floor',name:'Private address',elevation:'0',height:{amount:'3',basis:'supplied_unverified',source},source}],rooms:[{id:'private-room',floorId:'private-floor',name:'Private owner room name',type:'living',polygon:[{x:0,y:0},{x:5,y:0},{x:5,y:4},{x:0,y:4}],holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[{id:'private-wall',floorId:'private-floor',start:{x:0,y:0},end:{x:5,y:0},thickness:'0.2',height:null,source,confirmed:true}],openings:[],stairs:[],review:{status:'pending',actorId:null}};
function parts(body:Buffer){const length=body.readUInt32LE(12);return {document:JSON.parse(body.subarray(20,20+length).toString()),binary:body.subarray(28+length)};}
it('removes private identity/labels/lineage while preserving a valid exact structural mesh',async()=>{
 const privateArtifact=renderStructuralGlb(geometry),candidate=prepareStructuralPublicDerivative(geometry),projected=parts(candidate.body),raw=JSON.stringify(projected.document);
 expect(JSON.stringify(parts(privateArtifact.body).document)).toContain('Private owner room name');
 for(const value of [geometry.id,geometry.organizationId,geometry.targetId,source.actorId,'private-room','private-wall','private-floor','Private owner room name','Private address',source.note])expect(raw).not.toContain(value);
 expect(projected.binary.equals(parts(privateArtifact.body).binary)).toBe(true);expect(projected.document.nodes.every((node:{extras?:unknown})=>node.extras===undefined)).toBe(true);expect(raw).not.toContain('uri');
 const validation=await validateBytes(new Uint8Array(candidate.body));expect(validation.issues.numErrors,JSON.stringify(validation.issues.messages)).toBe(0);expect(validation.issues.numWarnings,JSON.stringify(validation.issues.messages)).toBe(0);
 expect(candidate).toMatchObject({scaleStatus:'estimated',metricMeasurementsAvailable:false,privacyReview:'pending',publicationReview:'pending',publiclyServed:false});expect(prepareStructuralPublicDerivative(geometry).body.equals(candidate.body)).toBe(true);
});
it('cannot promote a claimed measured state or manufacture missing height/scale',()=>{
 expect(prepareStructuralPublicDerivative({...geometry,scaleStatus:'measured'}).scaleStatus).toBe('estimated');
 expect(()=>prepareStructuralPublicDerivative({...geometry,unit:'px',scaleStatus:'unscaled',scaleAnchors:[]})).toThrow('STRUCTURAL_SCALE_REQUIRED');
 expect(()=>prepareStructuralPublicDerivative({...geometry,floors:[{...geometry.floors[0],height:null}]})).toThrow('STRUCTURAL_HEIGHT_REQUIRED');
});
