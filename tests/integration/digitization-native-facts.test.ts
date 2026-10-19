import '../support/env';
import {afterAll,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {readPrivateQualitySummary} from '../../apps/api/src/inventory/digitization/quality';
import {readProcessingMetrics} from '../../apps/api/src/inventory/digitization/processing-metrics';
import {readSceneRegistrations,saveSceneRegistration} from '../../apps/api/src/inventory/digitization/scene-registration';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {collectNativeDocumentFacts} from '../../apps/api/src/inventory/digitization/native-fact-results';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {requestRunCancellation,completeRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN,requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
function pdf(locale:string,modern=false){
 const text=locale==='ar'?'':`BT /F1 12 Tf 20 160 Td (Unit number: 00123) Tj 0 -20 Td (Unit area: ${locale==='fr'?'184,20':'123.45'} m2) Tj ${modern?'0 -20 Td (City: Dubai; Plot number: 00123; 2 bedrooms) Tj':''} ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
 let output='%PDF-1.4\n';const offsets:number[]=[];
 for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(output);output+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(output);
}
it.skipIf(!origin).each(['en','fr','ar','en-v3','fr-v3'])('real native %s PDF privately commits pending candidates atomically; replay, tamper and stale scopes are guarded',async profileLocale=>{
 const modern=profileLocale.endsWith('-v3'),locale=profileLocale.split('-')[0];
 const storage=captureStorage(),key=crypto.randomUUID(),bytes=pdf(locale,modern),client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 const workspace=await transaction(actor,c=>createIntake(c,actor));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',$3,'Self-authored native fact fixture','private','document','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
 let runId:string|undefined;const storedKeys:string[]=[];
 try{
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'document');
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[verified]));
  runId=crypto.randomUUID();let stageId=crypto.randomUUID();const profile='generic-native-facts-'+locale+(modern?'-v3':'-v1');
  const fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,profile,(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  const run=runId;
  if(modern){
   const input={version:2,inputRevision:1,assetId:asset.id,output:'facts' as const,locale:locale as 'en'|'fr'|'ar'};
   await expect(transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{...input,version:1}))).rejects.toMatchObject({status:409});
   await expect(transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{...input,assetId:crypto.randomUUID()}))).rejects.toMatchObject({status:422});
   const dispatched=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,input));
   runId=dispatched.id;stageId=dispatched.stageIds[0];
   await expect(transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,input))).rejects.toMatchObject({status:409});
  }else{
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,2,{schemaVersion:1,id:run,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:workspace.id},inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'fact_extract',state:'pending',dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['facts']));
  await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,run,1));
  }
  const actualRun=runId!;
  const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stageId,2));
  const request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id));
  await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
  let receipt=await client.read(request);const deadline=Date.now()+15000;
  while(['pending','running'].includes(receipt.state)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));receipt=await client.read(request);}
  expect(receipt.state).toBe('succeeded');
  const collect=()=>collectNativeDocumentFacts(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
  vi.spyOn(client,'read').mockResolvedValueOnce({...receipt,result:{...(receipt.result as object),sourceSha256:'f'.repeat(64)}});
  await expect(collect()).rejects.toMatchObject({status:422});
  await expect(collectNativeDocumentFacts(actor,workspace.id,stageId,lease.execution_id,'999',asset.id,client)).rejects.toMatchObject({status:409});
  await expect(collectNativeDocumentFacts({...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:403});
  const [transported,first]=await Promise.all([collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client),collect()]);
  expect(await collect()).toEqual(first);
  expect(transported).toEqual({executionId:first.executionId,state:first.state,artifactIds:first.artifactIds});
  expect(first.candidateIds).toHaveLength(locale==='ar'?0:modern?5:2);expect(first.requiresOcrPages).toEqual(locale==='ar'?[1]:[]);
  const workspaceVersion=await transaction(actor,async c=>{
   const summary=await readPrivateQualitySummary(c,actor,workspace.id);expect(summary).toMatchObject({factCount:locale==='ar'?0:modern?5:2,pendingFactCount:locale==='ar'?0:modern?5:2,unresolvedOcrPages:locale==='ar'?1:0,geometryRevisionId:null,reconstruction:null,publiclyServed:false,reviewRequired:true});expect(summary.areas).toHaveLength(locale==='ar'?0:1);expect(JSON.stringify(summary)).not.toMatch(/nativeLines|quotedText|quarantine|object_key/);expect(await readSceneRegistrations(c,actor,workspace.id)).toEqual([]);
   const metrics=await readProcessingMetrics(c,actor,workspace.id);expect(metrics).toMatchObject({observedOutcomes:1,durationSamples:1,runStates:[{state:'awaiting_review',count:1}],failures:[],durationBasis:'lease_to_result_collection',physicalDeviceBenchmark:false,publiclyServed:false});expect(Number(metrics.p50Seconds)).toBeGreaterThan(0);expect(JSON.stringify(metrics)).not.toMatch(/ownerName|quotedText|object_key|quarantine/);
   const candidates=(await c.query('SELECT id,candidate FROM fact_candidates WHERE digitization_id=$1 ORDER BY field',[workspace.id])).rows;
   expect(candidates).toHaveLength(locale==='ar'?0:modern?5:2);expect(candidates.every(row=>row.candidate.review.status==='pending'&&row.candidate.extractionScore===null)).toBe(true);
   if(modern){expect(candidates.find(row=>row.candidate.field==='city').candidate.normalizedValue).toBe('Dubai');expect(candidates.find(row=>row.candidate.field==='plotId').candidate.normalizedValue).toBe('00123');expect(candidates.find(row=>row.candidate.field==='bedrooms').candidate.normalizedValue).toBe(2);expect(candidates.every(row=>row.candidate.extractorVersion==='generic-anchored-v3')).toBe(true);}
   if(locale!=='ar'){expect(candidates.find(row=>row.candidate.field==='unitId').candidate.normalizedValue).toBe('00123');expect(candidates.find(row=>row.candidate.field==='unitArea').candidate.normalizedValue.amount).toBe(locale==='fr'?'184.20':'123.45');}
   const artifacts=(await c.query('SELECT object_key,status,privacy_status,quality_report FROM artifacts WHERE stage_id=$1',[stageId])).rows;expect(artifacts).toHaveLength(2);storedKeys.push(...artifacts.map(row=>row.object_key));expect(artifacts.every(row=>row.status==='private'&&row.privacy_status==='pending')).toBe(true);expect(artifacts.find(row=>row.quality_report.kind==='native_fact_candidates')).toMatchObject({quality_report:{reviewRequired:true}});const pages=(await c.query('SELECT page,ocr_tokens,preview_artifact_id FROM document_pages WHERE digitization_id=$1',[workspace.id])).rows;expect(pages).toHaveLength(1);expect(pages[0]).toMatchObject({page:1,ocr_tokens:[]});expect(pages[0].preview_artifact_id).toBeTruthy();
   expect((await c.query('SELECT state FROM processing_runs WHERE id=$1',[actualRun])).rows[0].state).toBe('awaiting_review');
   expect((await c.query('SELECT count(*)::int n FROM fact_decisions WHERE digitization_id=$1',[workspace.id])).rows[0].n).toBe(0);
   return summary.workspaceVersion;
  });
  const registration={version:workspaceVersion,inputRevision:1,sceneArtifactId:first.artifactIds[0],geometryRevisionId:crypto.randomUUID(),floorId:'floor-1',anchors:[{scene:[0,0,0] as [number,number,number],plan:[0,0,0] as [number,number,number]},{scene:[1,0,0] as [number,number,number],plan:[2,0,0] as [number,number,number]},{scene:[0,1,0] as [number,number,number],plan:[0,2,0] as [number,number,number]}],note:'Authored unanchored document is not a trained scene'};
  await expect(transaction(actor,c=>saveSceneRegistration(c,actor,workspace.id,registration))).rejects.toMatchObject({status:404});
  await expect(transaction(actor,c=>saveSceneRegistration(c,actor,workspace.id,{...registration,version:workspaceVersion+1}))).rejects.toMatchObject({status:409});
  const foreign={...actor,orgId:'10000000-0000-4000-8000-000000000005'};
  await expect(transaction(foreign,c=>readSceneRegistrations(c,foreign,workspace.id))).rejects.toMatchObject({status:403});
  if(locale!=='ar'){
   await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:Buffer.from(bytes.toString().replace('00123','99999'))}));
   await expect(collect()).rejects.toMatchObject({status:409});
   await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:409});
   await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  }
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,2,[]));await expect(collect()).rejects.toMatchObject({status:409});
 }finally{
  vi.restoreAllMocks();
  if(runId){const run=await transaction(actor,async c=>(await c.query('SELECT version,state FROM processing_runs WHERE id=$1',[runId])).rows[0]);if(run&&run.state!=='cancelled'){await transaction(actor,c=>requestRunCancellation(c,actor,workspace.id,runId!,run.version));await completeRunCancellation(actor,workspace.id,runId,client);}}
  for(const objectKey of ['quarantine/'+key,...storedKeys])await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey}));storage.destroy();
 }
},45000);
