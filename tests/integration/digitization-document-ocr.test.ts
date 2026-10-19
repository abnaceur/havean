import {readPrivateQualitySummary} from '../../apps/api/src/inventory/digitization/quality';
import {verifyUnitApplicationSources} from '../../apps/api/src/inventory/digitization/inventory-source-preflight';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {startPrivateSourceProcessing} from '../../apps/api/src/inventory/digitization/processing';
import {readPlanPageSelection} from '../../apps/api/src/inventory/digitization/plan-selection';
import {readPlanProposals} from '../../apps/api/src/inventory/digitization/plan-proposals';
import {decideFact,readFactReview} from '../../apps/api/src/inventory/digitization/fact-review';
import '../support/env';
import {afterAll,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {readArtifactPreview} from '../../apps/api/src/inventory/digitization/artifact-preview';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {cpuSourceFingerprint,prepareCpuExecution} from '../../apps/api/src/inventory/digitization/execution-scope';
import {createRunGraph,dispatchRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
import {leaseStage} from '../../apps/api/src/inventory/digitization/leases';
import {startCpuExecution} from '../../apps/api/src/inventory/digitization/execution-start';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {collectNativeDocumentFacts,collectInvestigationDocumentOcr} from '../../apps/api/src/inventory/digitization/native-fact-results';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';
import {requestRunCancellation,completeRunCancellation} from '../../apps/api/src/inventory/digitization/cancellation';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN,requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3'),sharp=requireApi('sharp');
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function pdf(locale:string){
 const image=readFileSync('infra/generated/ocr-confined/'+locale+'.png');
 const hashes:Record<string,string>={en:'5a4e541a0b06a2ba33c88b19ad832c3dc2192f0d50916e58451f128d68ece481',fr:'0faa2a9fcc0a1f66bf0333042b3e838bf49371c23c521c353f1f872770ac456e',ar:'92ae9f8e742b6421adea72b0026bdd0881ae56fcdc6ff3db2d5a9721c40dc297'};
 expect(createHash('sha256').update(image).digest('hex')).toBe(hashes[locale]);
 const {data,info}=await sharp(image).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
 const n=locale==='en'?2:1,width=info.width*72/150,height=info.height*72/150,imageId=n+3,contentId=imageId+1;
 const content=Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /I1 Do Q`),pixels=deflateSync(data);
 const objects:Buffer[]=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from(`<< /Type /Pages /Kids [${Array.from({length:n},(_,i)=>`${i+3} 0 R`).join(' ')}] /Count ${n} >>`)];
 for(let i=0;i<n;i++)objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /I1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
 objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`),pixels,Buffer.from('\nendstream')]));
 objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`),content,Buffer.from('\nendstream')]));
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets:number[]=[];let size=chunks[0].length;
 for(const [i,object] of objects.entries()){offsets.push(size);const body=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),object,Buffer.from('\nendobj\n')]);chunks.push(body);size+=body.length;}
 chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
 return Buffer.concat(chunks);
}
it.skipIf(!origin).each(['en','fr','ar',...(process.env.DIGITIZATION_FACT_REVIEW_BROWSER_FIXTURE==='true'?['en-browser-desktop','en-browser-mobile']:[])])('real confined %s raster-PDF OCR persists source pages, raw tokens, crops and pending candidates privately',async label=>{
 const locale=label.split('-')[0],browserProject=label.includes('-browser-')?label.split('-').at(-1):undefined;let retained=false;
 const storage=captureStorage(),key=crypto.randomUUID(),bytes=await pdf(locale),client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 const workspace=await transaction(actor,c=>createIntake(c,actor));
 const asset=await transaction(actor,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',$3,'Self-authored raster OCR fixture','private','document','approved',now()) RETURNING id,version",[actor.id,key,bytes.length])).rows[0]);
 let workspaceVersion=2;let runId:string|undefined,planRunId:string|undefined,nativeRunId:string|undefined;const storedKeys:string[]=[];
 try{
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const verified=await verifySmallDigitizationSource(actor,workspace.id,asset.id,asset.version,1,'document');
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,1,[verified]));
  if(locale==='en'&&!browserProject){
   if(process.env.DIGITIZATION_OCR_RELEASE_TEST==='true')vi.stubEnv('PROCESSING_ENABLE_OCR','false');
   const native=await transaction(actor,c=>startPrivateSourceProcessing(c,actor,workspace.id,{version:2,inputRevision:1,assetId:asset.id,output:'facts',locale:'en'}));nativeRunId=native.id;
   if(process.env.DIGITIZATION_OCR_RELEASE_TEST==='true')vi.stubEnv('PROCESSING_ENABLE_OCR','true');
   const nativeStage=await transaction(actor,async c=>(await c.query('SELECT id FROM processing_stages WHERE run_id=$1',[nativeRunId])).rows[0].id);
   const nativeLease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,nativeStage,2));
   const nativeRequest=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,nativeStage,nativeLease.execution_id,String(nativeLease.fencing_token),asset.id));
   await startCpuExecution(actor,workspace.id,nativeStage,nativeLease.execution_id,String(nativeLease.fencing_token),asset.id,client);
   let nativeReceipt=await client.read(nativeRequest);const nativeDeadline=Date.now()+15000;
   while(['pending','running'].includes(nativeReceipt.state)&&Date.now()<nativeDeadline){await new Promise(resolve=>setTimeout(resolve,100));nativeReceipt=await client.read(nativeRequest);}
   expect(nativeReceipt.state).toBe('succeeded');
   const nativeResult=await collectNativeDocumentFacts(actor,workspace.id,nativeStage,nativeLease.execution_id,String(nativeLease.fencing_token),asset.id,client);
   expect(nativeResult.candidateIds).toEqual([]);expect(nativeResult.requiresOcrPages).toEqual([1,2]);
   expect((await transaction(actor,c=>readPrivateQualitySummary(c,actor,workspace.id))).unresolvedOcrPages).toBe(2);
   storedKeys.push(...await transaction(actor,async c=>(await c.query('SELECT object_key FROM artifacts WHERE stage_id=$1',[nativeStage])).rows.map(row=>row.object_key)));
  }
  const beforeOcr=await transaction(actor,c=>checkedWorkspace(c,workspace.id));
  runId=crypto.randomUUID();const stageId=crypto.randomUUID(),profile='private-ocr-document-'+locale+(process.env.DIGITIZATION_OCR_RELEASE_TEST==='true'?'-v1':'-investigation-v1');
  const fingerprint=await transaction(actor,async c=>cpuSourceFingerprint(workspace.id,actor.orgId!,1,profile,(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=1',[workspace.id])).rows[0].source_set[0]));
  const run=runId;
  await transaction(actor,c=>createRunGraph(c,actor,workspace.id,beforeOcr.version,{schemaVersion:1,id:run,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:workspace.id},inputRevision:1,state:'draft',version:1,stages:[{id:stageId,type:'document_ocr',state:'pending',dependencies:[],profileId:profile,inputFingerprint:fingerprint,inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['facts']));
  await transaction(actor,c=>dispatchRunGraph(c,actor,workspace.id,run,1));
  const lease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,stageId,2));
  const request=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id));
  await startCpuExecution(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
  let receipt=await client.read(request);const deadline=Date.now()+15000;
  while(['pending','running'].includes(receipt.state)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));receipt=await client.read(request);}
  expect(receipt.state).toBe('succeeded');
  const collect=()=>collectInvestigationDocumentOcr(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client);
  vi.spyOn(client,'read').mockResolvedValueOnce({...receipt,result:{...(receipt.result as object),sourceSha256:'f'.repeat(64)}});
  await expect(collect()).rejects.toMatchObject({status:422});
  await expect(collectInvestigationDocumentOcr(actor,workspace.id,stageId,lease.execution_id,'999',asset.id,client)).rejects.toMatchObject({status:409});
  await expect(collectInvestigationDocumentOcr({...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:403});
  const [transported,first]=await Promise.all([collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client),collect()]);
  expect(await collect()).toEqual(first);
  expect(transported).toEqual({executionId:first.executionId,state:first.state,artifactIds:first.artifactIds});
  expect(first.requiresOcrPages).toEqual([]);if(locale==='en')expect(first.candidateIds).toHaveLength(2);
  if(nativeRunId)await transaction(actor,async c=>{
   const summary=await readPrivateQualitySummary(c,actor,workspace.id);expect(summary.unresolvedOcrPages).toBe(0);expect(summary.pendingFactCount).toBe(2);expect(summary.reviewRequired).toBe(true);expect(summary.publiclyServed).toBe(false);
   const receipts=(await c.query('SELECT p.*,ar.quality_report FROM document_pages p JOIN artifacts ar ON ar.id=p.preview_artifact_id WHERE p.digitization_id=$1 ORDER BY p.page,ar.created_at',[workspace.id])).rows;
   expect(receipts).toHaveLength(4);expect(receipts.filter(row=>row.quality_report.kind==='document_native_page').every(row=>row.ocr_tokens.length===0)).toBe(true);expect(receipts.filter(row=>row.quality_report.kind==='document_ocr_page').every(row=>row.ocr_tokens.length>0)).toBe(true);
   const review=await readFactReview(c,actor,workspace.id);expect(review.pages).toHaveLength(2);expect(review.pages.every(page=>receipts.some(row=>row.preview_artifact_id===page.artifactId&&row.quality_report.kind==='document_ocr_page'))).toBe(true);
   await c.query('SAVEPOINT duplicate_page_receipt');
   await expect(c.query('INSERT INTO document_pages(digitization_id,organization_id,created_by,binding_id,input_revision,page,preview_artifact_id,orientation_transform,ocr_tokens) SELECT digitization_id,organization_id,created_by,binding_id,input_revision,page,preview_artifact_id,orientation_transform,ocr_tokens FROM document_pages WHERE id=$1',[receipts[0].id])).rejects.toMatchObject({code:'23505'});await c.query('ROLLBACK TO SAVEPOINT duplicate_page_receipt');
   const deniedUpdate=await c.query('UPDATE document_pages SET ocr_tokens=$2,version=version+1 WHERE id=$1',[receipts[0].id,JSON.stringify([{text:'Injected mutation'}])]);expect(deniedUpdate.rowCount).toBe(0);
   expect((await c.query('SELECT ocr_tokens FROM document_pages WHERE id=$1',[receipts[0].id])).rows[0].ocr_tokens).toEqual(receipts[0].ocr_tokens);
  });

  await transaction(actor,async c=>{
   const candidates=(await c.query('SELECT id,candidate FROM fact_candidates WHERE digitization_id=$1 ORDER BY field',[workspace.id])).rows;
   if(locale==='en')expect(candidates).toHaveLength(2);expect(candidates.every(row=>row.candidate.review.status==='pending'&&row.candidate.extractionScore===null)).toBe(true);
   if(locale==='en')expect(candidates.every(row=>row.candidate.normalizedValue.amount==='123.45')).toBe(true);expect(candidates.some(row=>row.candidate.field==='bedrooms')).toBe(false);
   const artifacts=(await c.query('SELECT id,object_key,status,privacy_status,quality_report FROM artifacts WHERE stage_id=$1',[stageId])).rows;expect(artifacts).toHaveLength(locale==='en'?3:2);storedKeys.push(...artifacts.map(row=>row.object_key));expect(artifacts.every(row=>row.status==='private'&&row.privacy_status==='pending'&&row.quality_report.reviewRequired===true)).toBe(true);const pages=(await c.query('SELECT p.page,p.ocr_tokens,p.preview_artifact_id FROM document_pages p JOIN artifacts ar ON ar.id=p.preview_artifact_id WHERE p.digitization_id=$1 AND ar.stage_id=$2 ORDER BY p.page',[workspace.id,stageId])).rows;expect(pages).toHaveLength(locale==='en'?2:1);expect(pages.every(row=>row.ocr_tokens.length>0)).toBe(true);expect(pages.map(row=>row.page)).toEqual(locale==='en'?[1,2]:[1]);
   expect((await c.query('SELECT state FROM processing_runs WHERE id=$1',[run])).rows[0].state).toBe('awaiting_review');
   expect((await c.query('SELECT count(*)::int n FROM fact_decisions WHERE digitization_id=$1',[workspace.id])).rows[0].n).toBe(0);
  });
  if(locale==='en'&&!browserProject){
   let review=await transaction(actor,c=>readFactReview(c,actor,workspace.id));
   expect(review.pages).toHaveLength(2);expect(review.candidates).toHaveLength(2);expect(review.history).toEqual([]);
   const firstCandidate=review.candidates[0],secondCandidate=review.candidates[1];
   const decision={version:review.workspaceVersion,inputRevision:review.inputRevision,candidateVersion:firstCandidate.version,decision:'accepted' as const,value:firstCandidate.normalizedValue,note:'Synthetic source quote checked by test actor.'};
   await expect(transaction(actor,c=>decideFact(c,actor,workspace.id,firstCandidate.id,{...decision,value:'wrong field type'}))).rejects.toMatchObject({status:422});
   await expect(transaction({...actor,orgId:'10000000-0000-4000-8000-000000000005'},c=>readFactReview(c,{...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id))).rejects.toMatchObject({status:403});
   const results=await Promise.allSettled([transaction(actor,c=>decideFact(c,actor,workspace.id,firstCandidate.id,decision)),transaction(actor,c=>decideFact(c,actor,workspace.id,firstCandidate.id,decision))]);
   expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
   review=await transaction(actor,c=>readFactReview(c,actor,workspace.id));expect(review.history).toHaveLength(1);expect(review.candidates[0].review.status).toBe('accepted');
   const quantity=firstCandidate.normalizedValue as {amount:string;unit:'m2';basis:'document_unit_area'};
   review=await transaction(actor,c=>decideFact(c,actor,workspace.id,firstCandidate.id,{...decision,version:review.workspaceVersion,decision:'corrected',value:{...quantity,amount:'124.00'},note:'Synthetic correction; not an actual property measurement.'}));
   expect(review.conflictingFields).toEqual(['unitArea']);expect(review.history).toHaveLength(2);expect(review.candidates[0].normalizedValue).toMatchObject({amount:'124.00'});
   review=await transaction(actor,c=>decideFact(c,actor,workspace.id,secondCandidate.id,{...decision,version:review.workspaceVersion,decision:'rejected',value:null,note:'Synthetic competing source excluded explicitly.'}));
   expect(review.conflictingFields).toEqual([]);expect(review.history).toHaveLength(3);
   expect(review.candidates[0].review.status).toBe('corrected');expect(review.candidates[1].review.status).toBe('rejected');
   await transaction(actor,async c=>{const original=(await c.query('SELECT candidate FROM fact_candidates WHERE id=$1',[firstCandidate.id])).rows[0].candidate;expect(original.review.status).toBe('pending');expect(original.normalizedValue).toMatchObject({amount:'123.45'});});
   workspaceVersion=review.workspaceVersion;
  }
  const pageRows=await transaction(actor,async c=>(await c.query('SELECT id,checksum FROM artifacts WHERE stage_id=$1 AND format=\'image/png\'',[stageId])).rows);
  for(const page of pageRows)expect(createHash('sha256').update(await readArtifactPreview(actor,workspace.id,page.id)).digest('hex')).toBe(page.checksum);
  const plan=await transaction(actor,async c=>{const w=await checkedWorkspace(c,workspace.id);return startPrivateSourceProcessing(c,actor,workspace.id,{version:w.version,inputRevision:1,assetId:asset.id,output:'plan',locale:locale as 'en'|'fr'|'ar'});});planRunId=plan.id;
  const planStage=plan.stageIds[0],planLease=await transaction(actor,c=>leaseStage(c,actor,workspace.id,planStage,2));
  const planRequest=await transaction(actor,c=>prepareCpuExecution(c,actor,workspace.id,planStage,planLease.execution_id,String(planLease.fencing_token),asset.id));
  await startCpuExecution(actor,workspace.id,planStage,planLease.execution_id,String(planLease.fencing_token),asset.id,client);
  await expect.poll(async()=>(await client.read(planRequest)).state,{timeout:15000}).toBe('succeeded');
  const rendered=await collectCpuRenders(actor,workspace.id,planStage,planLease.execution_id,String(planLease.fencing_token),asset.id,client);
  const page=await readPlanPageSelection(actor,workspace.id,rendered.artifactIds[0],90);
  const labelCounts=()=>transaction(actor,async c=>({geometry:(await c.query('SELECT count(*)::int n FROM geometry_revisions WHERE digitization_id=$1',[workspace.id])).rows[0].n,decisions:(await c.query('SELECT count(*)::int n FROM fact_decisions WHERE digitization_id=$1',[workspace.id])).rows[0].n}));const beforeLabels=await labelCounts();
  const labels=await readPlanProposals(actor,workspace.id,page.artifactId,90,page.workspaceVersion,page.inputRevision);
  expect(labels.labels.length).toBeGreaterThan(0);expect(labels.labels.every(label=>label.confirmed===false&&label.text.length<=80)).toBe(true);
  expect(labels.selection.source.assetId).toBe(asset.id);expect(labels.selection.source.page).toBe(page.source.page);
  const persisted=await transaction(actor,async c=>(await c.query('SELECT p.ocr_tokens FROM document_pages p JOIN artifacts ar ON ar.id=p.preview_artifact_id WHERE p.digitization_id=$1 AND p.page=$2 AND ar.stage_id=$3',[workspace.id,page.source.page,stageId])).rows[0].ocr_tokens);
  expect(labels.labels.every(label=>persisted.some((token:{text:string})=>token.text===label.text))).toBe(true);
  expect(await labelCounts()).toEqual(beforeLabels);expect(beforeLabels.geometry).toBe(0);
  await expect(readPlanProposals({...actor,orgId:'10000000-0000-4000-8000-000000000005'},workspace.id,page.artifactId,90,page.workspaceVersion,1)).rejects.toMatchObject({status:403});
  await expect(readPlanProposals(actor,workspace.id,page.artifactId,90,page.workspaceVersion-1,1)).rejects.toMatchObject({status:409});
  storedKeys.push(...await transaction(actor,async c=>(await c.query('SELECT object_key FROM artifacts WHERE stage_id=$1',[planStage])).rows.map(row=>row.object_key)));
  if(browserProject){const review=await transaction(actor,c=>readFactReview(c,actor,workspace.id));writeFileSync(`infra/generated/integration/fact-review-${browserProject}.json`,JSON.stringify({engineId:workspace.id,candidateId:review.candidates[0].id,secondCandidateId:review.candidates[1].id}));retained=true;return;}
  const changed=Buffer.from(bytes);changed[changed.length-2]^=1;
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:changed}));
  await expect(verifyUnitApplicationSources(actor,workspace.id,1)).rejects.toMatchObject({status:422});
  await expect(readPlanProposals(actor,workspace.id,page.artifactId,90,page.workspaceVersion,1)).rejects.toMatchObject({status:422});
  await expect(collect()).rejects.toMatchObject({status:409});
  await expect(collectCpuRenders(actor,workspace.id,stageId,lease.execution_id,String(lease.fencing_token),asset.id,client)).rejects.toMatchObject({status:409});
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  await transaction(actor,c=>appendInputRevision(c,actor,workspace.id,workspaceVersion,[]));await expect(collect()).rejects.toMatchObject({status:409});
 }finally{
  vi.restoreAllMocks();
  for(const ownedRun of retained?[]:[runId,planRunId,nativeRunId].filter((id):id is string=>Boolean(id))){const run=await transaction(actor,async c=>(await c.query('SELECT version,state FROM processing_runs WHERE id=$1',[ownedRun])).rows[0]);if(run&&run.state!=='cancelled'){await transaction(actor,c=>requestRunCancellation(c,actor,workspace.id,ownedRun,run.version));await completeRunCancellation(actor,workspace.id,ownedRun,client);}}
  for(const objectKey of retained?[]:['quarantine/'+key,...storedKeys])await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:objectKey}));storage.destroy();
 }
},90000);
