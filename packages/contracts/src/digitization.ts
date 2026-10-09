import {z} from 'zod';
import {geometryScaleStatus,digitizationGeometryRevision} from './digitization-geometry';
const version=z.number().int().positive();
const decimal=z.string().regex(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,8})?$/);
const checksum=z.string().regex(/^[a-f0-9]{64}$/);
const text=z.string().min(1).max(2000);
export const digitizationTarget=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('listing'),id:z.uuid(),unitId:z.uuid()}),
 z.strictObject({type:z.literal('intake'),id:z.uuid()}),
 z.strictObject({type:z.literal('owner_submission'),id:z.uuid()}),
 z.strictObject({type:z.literal('development_floor_type'),id:z.uuid(),developmentId:z.uuid()})
]);
export const digitizationEvidence=z.strictObject({assetId:z.uuid(),page:z.number().int().min(1).max(50),bbox:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)]),coordinateSpace:z.literal('upright-page-normalized-top-left'),quotedText:text}).refine(e=>e.bbox[0]<e.bbox[2]&&e.bbox[1]<e.bbox[3],'Evidence rectangle must have positive bounds');
const quantity=z.strictObject({amount:decimal.refine(value=>!value.startsWith('-'),'Quantities must be nonnegative'),unit:z.enum(['m2','ft2','ha','m']),basis:z.enum(['document_unit_area','document_land_area','document_built_up_area','document_terrace_area','geometry_room_net','unknown'])});
const date=z.strictObject({value:z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/),calendar:z.enum(['gregorian','hijri','unknown']),precision:z.enum(['year','month','day'])}).superRefine((value,ctx)=>{
 const parts=value.value.split('-').map(Number),[year,month,day]=parts;
 const invalid=()=>ctx.addIssue({code:'custom',path:['value'],message:'Date must match its calendar and precision'});
 if(parts.length!==({year:1,month:2,day:3}[value.precision])||year<1||parts.length>1&&(month<1||month>12)){invalid();return;}
 if(parts.length===3){
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const limit=value.calendar==='gregorian'?[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]:value.calendar==='hijri'?30:31;
  if(day<1||day>limit)invalid();
 }
});
export const digitizationFactCandidate=z.strictObject({
 schemaVersion:z.literal(1),id:z.uuid(),organizationId:z.uuid(),target:digitizationTarget,version,
 field:z.enum(['country','region','city','district','address','propertyType','tenure','plotId','buildingId','unitId','floorId','landArea','unitArea','builtUpArea','terraceArea','bedrooms','livingRooms','bathrooms','parkingSpaces','boundary','documentDate','ownerName','ownerId','registryId']),
 rawText:text,normalizedValue:z.union([quantity,date,text,z.number().int().nonnegative().max(10000),z.null()]),
 origin:z.enum(['document','plan']),extractionScore:z.number().min(0).max(1).nullable(),scoreMethod:z.string().min(1).max(100),evidence:z.array(digitizationEvidence).min(1).max(20),
 review:z.strictObject({status:z.enum(['pending','accepted','corrected','rejected','unknown','conflict']),actorId:z.uuid().nullable(),reviewedAt:z.iso.datetime().nullable()}),
 extractorVersion:z.string().min(1).max(100),inputRevision:version
}).superRefine((candidate,ctx)=>{
 const value=candidate.normalizedValue;
 const issue=(message:string)=>ctx.addIssue({code:'custom',path:['normalizedValue'],message});
 if(candidate.field==='documentDate'&&value!==null&&(typeof value!=='object'||!('calendar' in value)))issue('Document dates require calendar and precision');
 if(['country','region','city','district','address','propertyType','tenure','boundary','ownerName'].includes(candidate.field)&&value!==null&&typeof value!=='string')issue('Text facts require source text or unknown');
 if(['landArea','unitArea','builtUpArea','terraceArea'].includes(candidate.field)&&value!==null&&(typeof value!=='object'||!('amount' in value)||!['m2','ft2','ha'].includes(value.unit)))issue('Area requires a decimal quantity and area unit');
 if(['plotId','buildingId','unitId','floorId','ownerId','registryId'].includes(candidate.field)&&value!==null&&typeof value!=='string')issue('Identifiers remain strings');
 if(['bedrooms','livingRooms','bathrooms','parkingSpaces'].includes(candidate.field)&&value!==null&&typeof value!=='number')issue('Counts must be integers or unknown');
 if(candidate.review.status==='pending'&&(candidate.review.actorId!==null||candidate.review.reviewedAt!==null))ctx.addIssue({code:'custom',path:['review'],message:'Pending candidate has no review actor/time'});
 if(candidate.review.status!=='pending'&&(!candidate.review.actorId||!candidate.review.reviewedAt))ctx.addIssue({code:'custom',path:['review'],message:'Decision requires actor/time'});
});
export const digitizationRunState=z.enum(['draft','queued','running','awaiting_input','awaiting_review','ready','partially_ready','failed','cancel_requested','cancelled']);
export const digitizationStageState=z.enum(['pending','queued','leased','running','succeeded','failed_retryable','failed_terminal','awaiting_input','skipped','cancelled']);
export const digitizationStageType=z.enum(['document_classify','document_rasterize','document_ocr','fact_extract','plan_trace','geometry_render','media_probe','frame_select','panorama_optimize','camera_solve','splat_train','scene_export','assemble']);
export const digitizationProgress=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('indeterminate'),messageKey:z.string().regex(/^[a-z][a-z0-9_.]{1,100}$/)}),
 z.strictObject({kind:z.literal('count'),completed:z.number().int().nonnegative().max(1e9),total:z.number().int().positive().max(1e9),unit:z.enum(['pages','frames','iterations','bytes'])}).refine(p=>p.completed<=p.total,'Progress exceeds denominator')
]);
const stage=z.strictObject({id:z.uuid(),type:digitizationStageType,state:digitizationStageState,dependencies:z.array(z.uuid()).max(100),profileId:z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,100}$/),inputFingerprint:checksum,inputRevision:version,attempt:z.number().int().nonnegative().max(10),fencingToken:z.string().regex(/^\d+$/).nullable(),executionId:z.uuid().nullable(),progress:digitizationProgress.nullable()});
export const digitizationRun=z.strictObject({schemaVersion:z.literal(1),id:z.uuid(),organizationId:z.uuid(),creatorId:z.uuid(),target:digitizationTarget,inputRevision:version,state:digitizationRunState,version,stages:z.array(stage).min(1).max(512),deadline:z.iso.datetime(),budget:z.strictObject({maxSeconds:z.number().int().positive().max(86400),maxScratchBytes:z.string().regex(/^[1-9]\d{0,12}$/)})}).superRefine((run,ctx)=>{
 const byId=new Map(run.stages.map(s=>[s.id,s]));
 if(byId.size!==run.stages.length)ctx.addIssue({code:'custom',path:['stages'],message:'Duplicate stage ID'});
 const active=new Set<string>(),visited=new Set<string>();
 function visit(id:string){if(active.has(id)){ctx.addIssue({code:'custom',path:['stages'],message:'Stage dependency cycle'});return;}if(visited.has(id))return;active.add(id);for(const dep of byId.get(id)?.dependencies||[]){if(!byId.has(dep))ctx.addIssue({code:'custom',path:['stages'],message:'Unknown stage dependency'});else visit(dep);}active.delete(id);visited.add(id);}
 for(const entry of run.stages){visit(entry.id);if(new Set(entry.dependencies).size!==entry.dependencies.length)ctx.addIssue({code:'custom',path:['stages'],message:'Duplicate stage dependency'});if(entry.inputRevision!==run.inputRevision)ctx.addIssue({code:'custom',path:['stages'],message:'Stage revision differs from run'});if(['leased','running'].includes(entry.state)&&(!entry.fencingToken||!entry.executionId))ctx.addIssue({code:'custom',path:['stages'],message:'Active stage requires a fenced execution'});}
});
export const digitizationSceneManifest=z.strictObject({
 schemaVersion:z.literal(1),listingId:z.uuid(),approvedRevision:version,viewerType:z.enum(['gallery','panorama','structural','splat']),formatVersion:z.string().min(1).max(50),viewerVersion:z.string().min(1).max(50),
 scaleStatus:geometryScaleStatus,units:z.enum(['m','unitless']),bounds:z.strictObject({min:z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]),max:z.tuple([z.number().finite(),z.number().finite(),z.number().finite()])}),
 tiers:z.array(z.strictObject({id:z.string().regex(/^[a-z0-9_-]{1,30}$/),artifactId:z.uuid(),format:z.enum(['webp','glb','ply','splat']),checksum,byteSize:z.string().regex(/^[1-9]\d{0,12}$/),url:z.string().regex(/^\/api\/v1\/listings\/[0-9a-f-]+\/digitization-artifacts\/[0-9a-f-]+\/content$/)})).min(1).max(10),coveredRoomIds:z.array(z.string().min(1).max(80)).max(200),limitations:z.array(z.string().min(1).max(500)).max(50),
 splatEncoding:z.strictObject({positionProperties:z.tuple([text,text,text]),scaleProperties:z.tuple([text,text,text]),rotationProperties:z.tuple([text,text,text,text]),opacityProperty:text,sphericalHarmonicDegree:z.number().int().min(0).max(3),scaleEncoding:z.enum(['linear','log']),rotationEncoding:z.enum(['wxyz','xyzw']),opacityEncoding:z.enum(['linear','logit']),coordinateConversion:z.array(z.number().finite()).length(16)}).nullable()
}).superRefine((manifest,ctx)=>{
 for(let i=0;i<3;i++)if(manifest.bounds.min[i]>=manifest.bounds.max[i])ctx.addIssue({code:'custom',path:['bounds'],message:'Scene bounds must be nonempty'});
 if(manifest.scaleStatus==='unscaled'&&manifest.units!=='unitless')ctx.addIssue({code:'custom',path:['units'],message:'Unscaled scene cannot declare metres'});
 if(manifest.viewerType==='splat'&&!manifest.splatEncoding)ctx.addIssue({code:'custom',path:['splatEncoding'],message:'Splat attribute encoding is required'});
 for(const tier of manifest.tiers)if(tier.url!==`/api/v1/listings/${manifest.listingId}/digitization-artifacts/${tier.artifactId}/content`)ctx.addIssue({code:'custom',path:['tiers'],message:'Content URL must match manifest listing and artifact'});
});
// Internal runner input carries scoped immutable references; never object keys or commands.
export const digitizationExecutionRequest=z.strictObject({
 schemaVersion:z.literal(1),executionId:z.uuid(),organizationId:z.uuid(),runId:z.uuid(),stageId:z.uuid(),
 stageType:digitizationStageType,profileId:z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,100}$/),
 inputRevision:version,inputFingerprint:checksum,fencingToken:z.string().regex(/^[1-9]\d{0,18}$/),
 artifacts:z.array(z.strictObject({id:z.uuid(),checksum,byteSize:z.string().regex(/^[1-9]\d{0,12}$/),detectedMime:z.enum(['application/pdf','image/jpeg','image/png'])})).min(1).max(100),
 deadline:z.iso.datetime(),budget:z.strictObject({maxSeconds:z.number().int().positive().max(86400),maxScratchBytes:z.string().regex(/^[1-9]\d{0,12}$/)})
}).refine(request=>new Set(request.artifacts.map(asset=>asset.id)).size===request.artifacts.length,'Duplicate input artifact');
export type DigitizationExecutionRequest=z.infer<typeof digitizationExecutionRequest>;

export const digitizationSchemas={DigitizationExecutionRequest:digitizationExecutionRequest,DigitizationFactCandidate:digitizationFactCandidate,DigitizationGeometryRevision:digitizationGeometryRevision,DigitizationRun:digitizationRun,DigitizationSceneManifest:digitizationSceneManifest};
export type DigitizationFactCandidate=z.infer<typeof digitizationFactCandidate>;
export type DigitizationRun=z.infer<typeof digitizationRun>;
export type DigitizationSceneManifest=z.infer<typeof digitizationSceneManifest>;

export function digitizationTransportSchemas(){return Object.fromEntries(Object.entries(digitizationSchemas).map(([name,schema])=>[name,z.toJSONSchema(schema,{io:'input'})]));}
