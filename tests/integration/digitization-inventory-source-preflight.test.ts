import '../support/env';
import {createRequire} from 'node:module';
import {afterAll,expect,it} from 'vitest';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import type {DigitizationFactCandidate} from '@haven/contracts';
import {Identity} from '../../apps/api/src/platform/core';
import {createListingDigitization} from '../../apps/api/src/inventory/digitization/intakes';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {DigitizationInventoryController} from '../../apps/api/src/inventory/digitization/inventory-controller';
import {InventoryController} from '../../apps/api/src/inventory/controller';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {scanFile} from '../../apps/api/src/inventory/scanner';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']},reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']};
const identity=(a:Actor)=>({actor:async()=>a} as unknown as Identity),request=(route:string)=>({method:'POST',url:'/api/v1/'+route,headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest);
afterAll(()=>pool.end());
it('real PNG/S3/Clam source bytes are rechecked before proposal and independent review; receipts replay without changing facts twice',async()=>{
 const storage=captureStorage(),key='inventory-proof-'+crypto.randomUUID();let listing:string|undefined,engine:string|undefined,asset:string|undefined;
 const original=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256"><rect width="512" height="256" fill="white"/><text x="30" y="100" font-size="28">Synthetic unit area 96.25 m2</text></svg>')).png().toBuffer(),tampered=await sharp({create:{width:512,height:256,channels:3,background:'#ff8888'}}).png().toBuffer();
 try{
  await scanFile(original);await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:original}));
  listing=await transaction(admin,async c=>{const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;return (await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,owner_id,agent_id,$2,'Synthetic inventory source proof','Self-authored source and synthetic review only','sale','residential','CNY','2500000.25','published' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id",[unit,key])).rows[0].id;});
  const workspace=await transaction(agent,c=>createListingDigitization(c,agent,listing!,1));engine=workspace.id;
  asset=await transaction(agent,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Self-authored PNG for inventory authority test','private','document','approved',now()) RETURNING id",[agent.id,key,original.length])).rows[0].id);
  const source=await verifySmallDigitizationSource(agent,engine!,asset!,1,1,'document');
  await transaction(agent,c=>appendInputRevision(c,agent,engine!,1,[source]));
  const decision=await transaction(agent,async c=>{const id=crypto.randomUUID(),candidate:DigitizationFactCandidate={schemaVersion:1,id,organizationId:agent.orgId!,target:{type:'listing',id:listing!,unitId:workspace.unitId!},version:1,field:'unitArea',rawText:'Synthetic unit area 96.25 m2',normalizedValue:{amount:'96.25',unit:'m2',basis:'document_unit_area'},origin:'document',extractionScore:null,scoreMethod:'synthetic-manual-policy-test',evidence:[{assetId:asset!,page:1,bbox:[0.05,0.2,0.95,0.5],coordinateSpace:'upright-page-normalized-top-left',quotedText:'Synthetic unit area 96.25 m2'}],review:{status:'pending',actorId:null,reviewedAt:null},extractorVersion:'synthetic-manual-policy-test',inputRevision:1};await c.query('INSERT INTO fact_candidates(id,digitization_id,organization_id,created_by,input_revision,field,candidate,extractor_version) VALUES($1,$2,$3,$4,1,$5,$6,$7)',[id,engine,agent.orgId,agent.id,candidate.field,JSON.stringify(candidate),candidate.extractorVersion]);return (await c.query("INSERT INTO fact_decisions(digitization_id,organization_id,created_by,candidate_id,candidate_version,decision) VALUES($1,$2,$3,$4,1,'accepted') RETURNING id",[engine,agent.orgId,agent.id,id])).rows[0].id;});
  const controller=new DigitizationInventoryController(identity(agent)),body={workspaceVersion:2,inputRevision:1,listingVersion:1,decisionIds:[decision],reason:'Self-authored confirmed area fixture'},req=request('ops/digitizations/'+engine+'/inventory-applications');
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:tampered}));
  await expect(controller.proposeUnit(req,engine!,body)).rejects.toMatchObject({status:422});
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:original}));
  const proposed=await controller.proposeUnit(req,engine!,body);expect(await controller.proposeUnit(req,engine!,body)).toEqual(proposed);
  expect(JSON.stringify(proposed)).not.toContain(asset!);expect(JSON.stringify(proposed)).not.toContain(decision);
  const moderation=new InventoryController(identity(reviewer)),approval={version:1,reason:'Independent synthetic fact verification',verified:true},approvalRequest=request('ops/revisions/'+proposed.data.revisionId+'/approve');
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:tampered}));
  await expect(moderation.approveRevision(approvalRequest,proposed.data.revisionId,approval)).rejects.toMatchObject({status:422});
  expect(await transaction(agent,async c=>(await c.query('SELECT u.area::text FROM units u JOIN listings l ON l.unit_id=u.id WHERE l.id=$1',[listing])).rows[0].area)).toBe('88.50');
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:original}));
  const accepted=await moderation.approveRevision(approvalRequest,proposed.data.revisionId,approval);expect(await moderation.approveRevision(approvalRequest,proposed.data.revisionId,approval)).toEqual(accepted);
  expect(await transaction(agent,async c=>(await c.query('SELECT u.area::text,l.version FROM units u JOIN listings l ON l.unit_id=u.id WHERE l.id=$1',[listing])).rows[0])).toEqual({area:'96.25',version:2});
 }finally{
  if(listing)await transaction(admin,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1 AND status='published'",[listing]));
  if(asset)await transaction(agent,c=>c.query("UPDATE media_assets SET status='rejected',version=version+1 WHERE id=$1",[asset]));
  await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();
 }
},60000);
