// One local functional journey using a licensed reference-derived clip.
// No physical-property benchmark, independent privacy approval or publication.
import './env';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import type {FastifyRequest} from 'fastify';
import type {Identity} from '../../apps/api/src/platform/core';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {cameraAvailable} from '../../apps/api/src/inventory/digitization/camera-input';
import {DigitizationFrameController} from '../../apps/api/src/inventory/digitization/frame-controller';
import {latestCameraReview} from '../../apps/api/src/inventory/digitization/camera-results';
import {readPrivateQualitySummary} from '../../apps/api/src/inventory/digitization/quality';
import {requestRunCancellation,completeRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
import {configuredCpuRunner} from '../../apps/api/src/inventory/digitization/execution-start';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{PutObjectCommand}=requireApi('@aws-sdk/client-s3');
assert.equal(process.env.HAVEN_ENV_FILE,'.env');assert.equal(process.env.HAVEN_CONTAINER_TESTS,'true');assert.equal(cameraAvailable(),true);
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const storage=captureStorage(),api=new DigitizationFrameController({actor:async()=>actor} as unknown as Identity);
const req=(url:string)=>({method:'POST',url,headers:{'idempotency-key':randomUUID()}} as FastifyRequest);
async function finished(engine:string,run:string,seconds:number){
 const deadline=Date.now()+seconds*1000;let state:string;
 do{state=await transaction(actor,async c=>(await c.query('SELECT state FROM processing_runs WHERE id=$1 AND digitization_id=$2',[run,engine])).rows[0].state);if(!['queued','running'].includes(state))return state;await new Promise(resolve=>setTimeout(resolve,500));}while(Date.now()<deadline);
 throw Error('Functional camera workflow did not finish; run '+run+' state '+state);
}
try{
 const bytes=readFileSync('infra/generated/reconstruction/queued-camera-input/reference.mp4'),key=randomUUID(),workspace=await transaction(actor,c=>createIntake(c,actor));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'video/mp4',$3,'Licensed TUM reference-derived one-fps CPU workflow fixture; see fixture provenance; not customer footage','private','video','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
 await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
 const source=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'video');await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[source]));
 const framesRun=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{version:2,inputRevision:1,assetId:asset.id,output:'frames',locale:'en'}));
 assert.equal(await finished(workspace.id,framesRun.id,70),'awaiting_review');
 const frames=await transaction(actor,async c=>(await c.query("SELECT id,version FROM artifacts WHERE run_id=$1 AND quality_report->>'kind'='video_frame' ORDER BY (quality_report->>'frameIndex')::int",[framesRun.id])).rows);
 const dataset=(await api.create(req('/api/v1/ops/digitizations/'+workspace.id+'/frame-datasets'),workspace.id,{workspaceVersion:2,inputRevision:1,frames:frames.map(frame=>({artifactId:frame.id,artifactVersion:frame.version,roomId:null,transition:false}))})).data;
 assert.ok(dataset.report.selectedFrameCount>=10,'Actual decoded reference clip needs ten sharp distinct views');
 const recipe=(await api.privacy(req('/api/v1/ops/digitizations/'+workspace.id+'/frame-privacy-recipes'),workspace.id,{workspaceVersion:2,inputRevision:1,recipe:{schemaVersion:1,datasetId:dataset.id,datasetVersion:1,excludedFrameIds:[],masks:[{artifactId:dataset.report.selectedArtifactIds[0],regions:[{x:0,y:0,width:8,height:8}]}],inspectionConfirmed:true}})).data;
 const input={recipeId:recipe.id,workspaceVersion:2,inputRevision:1},request=req('/api/v1/ops/digitizations/'+workspace.id+'/camera-processing');
 const run=(await api.camera(request,workspace.id,input)).data;
 assert.deepEqual((await api.camera(request,workspace.id,input)).data,run);
 console.log(JSON.stringify({label:'O',workspaceId:workspace.id,runId:run.id,decodedFrames:frames.length,selectedFrames:dataset.report.selectedFrameCount,state:'camera_queued'}));
 assert.equal(await finished(workspace.id,run.id,300),'awaiting_review');
 const review=await transaction(actor,c=>latestCameraReview(c,actor,workspace.id));assert.ok(review);assert.equal(review.state,'awaiting_review');assert.equal(review.trainingArchiveAvailable,true);assert.ok(review.registeredCameraCount>=10);
 const quality=await transaction(actor,c=>readPrivateQualitySummary(c,actor,workspace.id));assert.equal(quality.reconstruction?.artifactId,review.artifactId);assert.equal(quality.reconstruction?.roomCoverage,null);
 assert.deepEqual((await api.camera(request,workspace.id,input)).data,run);
 const other={...actor,id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
 await assert.rejects(transaction(other,c=>latestCameraReview(c,other,workspace.id)));
 const stop=(await api.camera(req('/api/v1/ops/digitizations/'+workspace.id+'/camera-processing'),workspace.id,input)).data;
 await transaction(actor,async c=>{const row=(await c.query('SELECT version FROM processing_runs WHERE id=$1 FOR UPDATE',[stop.id])).rows[0];return requestRunCancellation(c,actor,workspace.id,stop.id,row.version);});
 const cancelled=await completeRunCancellation(actor,workspace.id,stop.id,await configuredCpuRunner());assert.equal(cancelled.state,'cancelled');
 await assert.rejects(api.camera(req('/api/v1/ops/digitizations/'+workspace.id+'/camera-processing'),workspace.id,{...input,workspaceVersion:3}),{status:409});
 console.log(JSON.stringify({label:'O/P',scope:'licensed reference-derived video through actual outbox/queue/worker/API/SQL/storage, frame selection, masks and confined CPU camera solve',workspaceId:workspace.id,runId:run.id,review,exactRequestReplay:true,foreignScopeRejected:true,staleVersionRejected:true,cancellationConfirmed:true,published:false,physicalPropertyBenchmark:false,productionAdmission:false}));
}finally{storage.destroy();await pool.end();}
