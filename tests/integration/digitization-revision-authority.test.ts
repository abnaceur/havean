import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {FastifyRequest} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {createListingDigitization,grantOwnerEvidence} from '../../apps/api/src/inventory/digitization/intakes';
import {DigitizationInputController} from '../../apps/api/src/inventory/digitization/input-controller';
import type {Identity} from '../../apps/api/src/platform/core';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
import {scanFile} from '../../apps/api/src/inventory/scanner';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp'),{CreateBucketCommand,PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
const request=(url:string,method='POST')=>({method,url,headers:{'idempotency-key':crypto.randomUUID()}} as FastifyRequest);
afterAll(()=>pool.end());

it('HE-B05 owner grants bootstrap an exact reserved revision; no grant carryover or historical exposure; revoked source can be removed immutably',async()=>{
 const bytes=await sharp({create:{width:32,height:24,channels:3,background:'#185b48'}}).png().toBuffer(),key=crypto.randomUUID();
 await scanFile(bytes);
 const fixture=await transaction(workerActor,async c=>{
  const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
  const listing=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,$2,agent_id,$3,'Exact revision fixture','Synthetic private document workflow','sale','residential','CNY','2500000.00','draft' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id,version",[unit,owner.id,'revision-'+crypto.randomUUID()])).rows[0];
  await c.query("INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id) VALUES($1,$2,'recorded_listing',$3)",[unit,owner.id,listing.id]);
  const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',$3,'Synthetic scanned owner evidence','private','document','approved',now()) RETURNING id,version",[owner.id,key,bytes.length])).rows[0];
  return {listing,asset};
 });
 const storage=captureStorage(),controller=new DigitizationInputController({actor:async()=>agent} as unknown as Identity);
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(e.name))throw e;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  const workspace=await transaction(agent,c=>createListingDigitization(c,agent,fixture.listing.id,fixture.listing.version));
  const grantBody={digitizationVersion:1,assetId:fixture.asset.id,assetVersion:fixture.asset.version,inputRevision:1,granteeId:agent.id,purposes:['preview','document_processing'],expiresAt:new Date(Date.now()+86400000).toISOString()};
  await expect(transaction(owner,c=>grantOwnerEvidence(c,owner,workspace.id,grantBody))).rejects.toMatchObject({status:422});
  const reserve=request(`/api/v1/ops/listings/${fixture.listing.id}/digitization/input-reservations`);
  expect((await controller.reserveListing(reserve,fixture.listing.id,{version:1})).data).toEqual({digitizationId:workspace.id,inputRevision:1,version:1});
  expect((await controller.reserveListing(reserve,fixture.listing.id,{version:1})).data.inputRevision).toBe(1);
  expect(await transaction(agent,async c=>(await c.query('SELECT count(*)::int n FROM property_input_revisions WHERE digitization_id=$1',[workspace.id])).rows[0].n)).toBe(0);
  const grant=await transaction(owner,c=>grantOwnerEvidence(c,owner,workspace.id,grantBody));
  const bindBody={version:1,inputRevision:1,assetId:fixture.asset.id,assetVersion:fixture.asset.version,purpose:'document'};
  const bind=request(`/api/v1/ops/listings/${fixture.listing.id}/digitization/asset-bindings`);
  const first=(await controller.bindListing(bind,fixture.listing.id,bindBody)).data;
  expect(first).toMatchObject({inputRevision:1,version:2});
  expect((await controller.bindListing(bind,fixture.listing.id,bindBody)).data).toEqual(first);
  await transaction(agent,async c=>{
   expect((await c.query("SELECT digitization_revision_access($1,1,'preview') allowed",[workspace.id])).rows[0].allowed).toBe(true);
   expect((await c.query("SELECT digitization_asset_access($1,$2,$3,2,'document_processing') allowed",[workspace.id,fixture.asset.id,fixture.asset.version])).rows[0].allowed).toBe(false);
  });
  await controller.reserveListing(request(reserve.url),fixture.listing.id,{version:2});
  await expect(controller.bindListing(request(bind.url),fixture.listing.id,{...bindBody,version:2,inputRevision:2})).rejects.toMatchObject({status:404});
  await transaction(owner,c=>grantOwnerEvidence(c,owner,workspace.id,{...grantBody,digitizationVersion:2,inputRevision:2}));
  const second=(await controller.bindListing(request(bind.url),fixture.listing.id,{...bindBody,version:2,inputRevision:2})).data;
  expect(second).toMatchObject({version:3,inputRevision:2});
  await transaction(owner,c=>c.query("UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE id=$1",[grant.id]));
  await transaction(agent,async c=>{
   expect((await c.query('SELECT revision FROM property_input_revisions WHERE digitization_id=$1 ORDER BY revision',[workspace.id])).rows).toEqual([{revision:2}]);
   expect((await c.query('SELECT input_revision FROM digitization_asset_bindings WHERE digitization_id=$1 ORDER BY input_revision',[workspace.id])).rows).toEqual([{input_revision:2}]);
  });
  await transaction(owner,c=>c.query("UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE digitization_id=$1 AND input_revision=2 AND state='active'",[workspace.id]));
  const remove=request(`/api/v1/ops/listings/${fixture.listing.id}/digitization/asset-bindings/${second.bindingIds[0]}`,'DELETE');
  expect((await controller.removeListing(remove,fixture.listing.id,second.bindingIds[0],{version:3,inputRevision:3})).data).toMatchObject({version:4,inputRevision:3,bindingIds:[]});
  await transaction(owner,async c=>{
   const snapshots=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 ORDER BY revision',[workspace.id])).rows;
   expect(snapshots.map(row=>row.source_set.length)).toEqual([1,1,0]);
   expect(snapshots[0].source_set).toEqual(snapshots[1].source_set);
  });
  await transaction(foreign,async c=>{
   expect((await c.query('SELECT revision FROM digitization_input_slots WHERE digitization_id=$1',[workspace.id])).rowCount).toBe(0);
   expect((await c.query('SELECT digitization_current_input_manifest($1) sources',[workspace.id])).rows[0].sources).toBeNull();
  });
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();}
},30000);
