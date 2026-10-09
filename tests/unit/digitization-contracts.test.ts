import {describe,expect,it} from 'vitest';
import {digitizationExecutionRequest,digitizationFactCandidate,digitizationProgress,digitizationRun,digitizationSceneManifest} from '../../packages/contracts/src/digitization';
import {digitizationGeometryRevision} from '../../packages/contracts/src/digitization-geometry';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source={kind:'manual',actorId:id(1),note:'Agent supplied trace'};
const fact={schemaVersion:1,id:id(1),organizationId:id(2),target:{type:'intake',id:id(3)},version:1,field:'unitArea',rawText:'184,20 m²',normalizedValue:{amount:'184.20',unit:'m2',basis:'document_unit_area'},origin:'document',extractionScore:.91,scoreMethod:'uncalibrated-parser-v1',evidence:[{assetId:id(4),page:1,bbox:[.12,.34,.48,.39],coordinateSpace:'upright-page-normalized-top-left',quotedText:'184,20 m²'}],review:{status:'pending',actorId:null,reviewedAt:null},extractorVersion:'generic-v1',inputRevision:1};
const geometry={schemaVersion:2,id:id(1),organizationId:id(2),targetId:id(3),revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[],sources:[source],scaleAnchors:[],floors:[{id:'ground',name:'Ground floor',elevation:'0',height:null,source}],rooms:[{id:'living',floorId:'ground',name:'Living room',type:'living',polygon:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],holes:[],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[{id:'wall-1',floorId:'ground',start:{x:0,y:0},end:{x:100,y:0},thickness:'5',height:null,source,confirmed:false}],openings:[],stairs:[],review:{status:'pending',actorId:null}};
const stage={id:id(5),type:'document_ocr',state:'pending',dependencies:[],profileId:'ocr-profile-v1',inputFingerprint:'a'.repeat(64),inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null};
const run={schemaVersion:1,id:id(1),organizationId:id(2),creatorId:id(4),target:{type:'intake',id:id(3)},inputRevision:1,state:'queued',version:1,stages:[stage],deadline:'2026-10-06T20:00:00Z',budget:{maxSeconds:300,maxScratchBytes:'1000000'}};
const scene={schemaVersion:1,listingId:id(1),approvedRevision:1,viewerType:'structural',formatVersion:'glb-v1',viewerVersion:'structural-v1',scaleStatus:'unscaled',units:'unitless',bounds:{min:[0,0,0],max:[1,1,1]},tiers:[{id:'mobile',artifactId:id(2),format:'glb',checksum:'a'.repeat(64),byteSize:'1000',url:`/api/v1/listings/${id(1)}/digitization-artifacts/${id(2)}/content`}],coveredRoomIds:['living'],limitations:['Unscaled illustrative trace'],splatEncoding:null};
describe('HE-A03 versioned evidence, geometry, job and manifest contracts',()=>{
 it('keeps decimal quantities and leading-zero identifiers exact; missing facts stay unknown',()=>{
  expect(digitizationFactCandidate.parse(fact).normalizedValue).toEqual(fact.normalizedValue);
  expect(digitizationFactCandidate.parse({...fact,field:'unitId',normalizedValue:'00123'}).normalizedValue).toBe('00123');
  expect(digitizationFactCandidate.parse({...fact,field:'bedrooms',normalizedValue:null}).normalizedValue).toBeNull();
  expect(digitizationFactCandidate.safeParse({...fact,normalizedValue:{...fact.normalizedValue,amount:184.2}}).success).toBe(false);
  expect(digitizationFactCandidate.safeParse({...fact,field:'unitId',normalizedValue:123}).success).toBe(false);
 });
 it('rejects missing evidence, incorrect boxes, unsupported units and untracked review decisions',()=>{
  for(const bad of [{...fact,normalizedValue:{...fact.normalizedValue,amount:'-1'}},{...fact,field:'country',normalizedValue:3},{...fact,field:'documentDate',normalizedValue:'2026-10-06'},{...fact,evidence:[]},{...fact,evidence:[{...fact.evidence[0],bbox:[.5,.2,.1,.4]}]},{...fact,evidence:[{...fact.evidence[0],bbox:[-.1,0,1,1]}]},{...fact,normalizedValue:{...fact.normalizedValue,unit:'acre'}},{...fact,review:{...fact.review,status:'accepted'}}])expect(digitizationFactCandidate.safeParse(bad).success).toBe(false);
 });
 it('accepts unscaled no-panorama geometry without adding default heights or measurements',()=>{
  const result=digitizationGeometryRevision.parse(geometry);expect(result.floors[0].height).toBeNull();expect(result.rooms[0].panoramaSceneId).toBeNull();expect(result.scaleAnchors).toEqual([]);
  expect(digitizationGeometryRevision.safeParse({...geometry,unit:'feet'}).success).toBe(false);
  expect(digitizationGeometryRevision.safeParse({...geometry,unit:'m',scaleStatus:'measured'}).success).toBe(false);
 });
 it('rejects impossible coordinates, missing floors, duplicate IDs and out-of-wall openings',()=>{
  const opening={id:'door-1',wallId:'wall-1',offset:'90',width:'20',type:'door',sill:null,height:null,source,confirmed:false};
  for(const bad of [{...geometry,rooms:[{...geometry.rooms[0],polygon:[{x:Infinity,y:0},{x:1,y:0},{x:1,y:1}]}]},{...geometry,rooms:[{...geometry.rooms[0],floorId:'missing'}]},{...geometry,rooms:[{...geometry.rooms[0],id:'ground'}]},{...geometry,openings:[opening]}])expect(digitizationGeometryRevision.safeParse(bad).success).toBe(false);
 });
 it('blocks contradictory confirmed dimensions without stretching coordinates; pending observations remain reviewable',()=>{
  const anchor={id:'horizontal',points:[{x:0,y:0},{x:10,y:0}],distanceMetres:'10',source,reviewerId:id(1),status:'confirmed'};
  const metric={...geometry,unit:'m',scaleStatus:'estimated',scaleAnchors:[anchor]};
  expect(digitizationGeometryRevision.safeParse(metric).success).toBe(true);
  const vertical={...anchor,id:'vertical',points:[{x:0,y:0},{x:0,y:10}],distanceMetres:'12'};
  expect(digitizationGeometryRevision.safeParse({...metric,scaleAnchors:[anchor,vertical]}).success).toBe(false);
  expect(digitizationGeometryRevision.safeParse({...metric,scaleAnchors:[anchor,{...vertical,status:'pending'}]}).success).toBe(true);
  expect(digitizationGeometryRevision.safeParse({...metric,scaleAnchors:[{...anchor,distanceMetres:'8'}]}).success).toBe(false);
 });
 it('rejects unknown execution stages, cycles, stale input revision and missing fencing',()=>{
  expect(digitizationRun.safeParse(run).success).toBe(true);
  for(const entry of [{...stage,type:'shell'},{...stage,dependencies:[stage.id]},{...stage,inputRevision:2},{...stage,state:'running'}])expect(digitizationRun.safeParse({...run,stages:[entry]}).success).toBe(false);
  expect(digitizationRun.safeParse({...run,stages:[{...stage,dependencies:[id(99)]}]}).success).toBe(false);
  expect(digitizationRun.safeParse({...run,stages:[stage,{...stage,id:id(6),dependencies:[stage.id,stage.id]}]}).success).toBe(false);
 });
 it('permits counts only with a real valid denominator, without a percent field',()=>{
  expect(digitizationProgress.safeParse({kind:'indeterminate',messageKey:'ocr.reading'}).success).toBe(true);
  expect(digitizationProgress.safeParse({kind:'count',completed:2,total:3,unit:'pages'}).success).toBe(true);
  for(const value of [{kind:'count',completed:2,total:0,unit:'pages'},{kind:'count',completed:4,total:3,unit:'pages'},{kind:'indeterminate',messageKey:'ocr.reading',percent:50}])expect(digitizationProgress.safeParse(value).success).toBe(false);
 });
 it('rejects metric unscaled scenes, incompatible public URL scope and private object metadata',()=>{
  expect(digitizationSceneManifest.safeParse(scene).success).toBe(true);
  for(const bad of [{...scene,units:'m'},{...scene,ownerName:'private'},{...scene,tiers:[{...scene.tiers[0],url:'https://s3.example.test/private-key'}]},{...scene,tiers:[{...scene.tiers[0],artifactId:id(3)}]}])expect(digitizationSceneManifest.safeParse(bad).success).toBe(false);
 });
 it('requires splat encoding instead of assuming arbitrary PLY compatibility',()=>{expect(digitizationSceneManifest.safeParse({...scene,viewerType:'splat',tiers:[{...scene.tiers[0],format:'ply'}]}).success).toBe(false);});
});

it('dates preserve explicit precision/calendar and reject impossible Gregorian dates without calendar conversion',()=>{
 const candidate={...fact,field:'documentDate'};
 expect(digitizationFactCandidate.parse({...candidate,normalizedValue:{value:'1447-04',calendar:'hijri',precision:'month'}}).normalizedValue).toEqual({value:'1447-04',calendar:'hijri',precision:'month'});
 for(const value of [{value:'2026-02-29',calendar:'gregorian',precision:'day'},{value:'2026',calendar:'unknown',precision:'day'},{value:'1447-04-31',calendar:'hijri',precision:'day'},{value:'2026-00',calendar:'gregorian',precision:'month'}])expect(digitizationFactCandidate.safeParse({...candidate,normalizedValue:value}).success).toBe(false);
});

describe('internal runner transport',()=>{
 it('rejects commands, paths, duplicate source IDs and missing lease scope',()=>{
  const request={schemaVersion:1,executionId:id(1),organizationId:id(2),runId:id(3),stageId:id(4),stageType:'document_rasterize',profileId:'pdfium-150dpi-v1',inputRevision:1,inputFingerprint:'a'.repeat(64),fencingToken:'1',artifacts:[{id:id(5),checksum:'b'.repeat(64),byteSize:'123',detectedMime:'application/pdf'}],deadline:'2026-10-06T20:00:00Z',budget:{maxSeconds:15,maxScratchBytes:'67108864'}};
  expect(digitizationExecutionRequest.safeParse(request).success).toBe(true);
  for(const changes of [{command:'whoami'},{fencingToken:'0'},{artifacts:[request.artifacts[0],request.artifacts[0]]},{artifacts:[{...request.artifacts[0],id:'../secret'}]},{stageType:'shell'}])expect(digitizationExecutionRequest.safeParse({...request,...changes}).success).toBe(false);
 });
});
