import '../support/env';
import {afterAll,expect,it} from 'vitest';
import type pg from 'pg';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {createIntakeInventoryDraft} from '../../apps/api/src/inventory/digitization/intake-draft';
import type {DigitizationDraftCreate,DigitizationFactCandidate} from '@haven/contracts';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function fixture(work:(c:pg.PoolClient,f:{engine:string;candidate:string;decision:string;input:DigitizationDraftCreate;asset:string})=>Promise<void>){
 const rollback=new Error('rollback authored intake policy fixture');
 try{await transaction(actor,async c=>{
  const workspace=await createIntake(c,actor);
  const asset=(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'image/png',100,'Authored policy metadata only','private','document','approved',now()) RETURNING id",[actor.id,crypto.randomUUID()])).rows[0].id;
  await appendInputRevision(c,actor,workspace.id,1,[{assetId:asset,assetVersion:1,inputRevision:1,purpose:'document',detectedMime:'image/png',bytes:100,sha256:'a'.repeat(64),decoderState:'requires_isolated_image_decoder'}]);
  const id=crypto.randomUUID(),candidate:DigitizationFactCandidate={schemaVersion:1,id,organizationId:actor.orgId!,target:{type:'intake',id:workspace.id},version:1,field:'unitArea',rawText:'Authored unit area: 96.25 m2',normalizedValue:{amount:'96.25',unit:'m2',basis:'document_unit_area'},origin:'document',extractionScore:null,scoreMethod:'authored-policy',evidence:[{assetId:asset,page:1,bbox:[.1,.1,.8,.2],coordinateSpace:'upright-page-normalized-top-left',quotedText:'Authored unit area: 96.25 m2'}],review:{status:'pending',actorId:null,reviewedAt:null},extractorVersion:'authored-policy',inputRevision:1};
  await c.query('INSERT INTO fact_candidates(id,digitization_id,organization_id,created_by,input_revision,field,candidate,extractor_version) VALUES($1,$2,$3,$4,1,$5,$6,$7)',[id,workspace.id,actor.orgId,actor.id,candidate.field,JSON.stringify(candidate),candidate.extractorVersion]);
  const decision=(await c.query("INSERT INTO fact_decisions(digitization_id,organization_id,created_by,candidate_id,candidate_version,decision,value) VALUES($1,$2,$3,$4,1,'corrected',$5) RETURNING id",[workspace.id,actor.orgId,actor.id,id,JSON.stringify({amount:'97.75',unit:'m2',basis:'document_unit_area'})])).rows[0].id;
  const community=(await c.query("SELECT community_id FROM units WHERE id='10000000-0000-4000-8000-000000001000'")).rows[0].community_id;
  const input:DigitizationDraftCreate={workspaceVersion:2,inputRevision:1,decisionIds:[decision],manualUnit:{communityId:community,beds:2,livingRooms:1,baths:1,orientation:'South',floor:2,privateAddress:'Authored private address'},listing:{title:'Authored private draft',description:'Authored inventory policy fixture only',transaction:'sale',segment:'residential',currency:'CNY',price:'2500000.25',rentPeriod:null,furnishing:'Unfurnished',availableFrom:null,features:[]},authorityConfirmed:true};
  await work(c,{engine:workspace.id,candidate:id,decision,input,asset});throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
}
it('missing required unit facts block creation without inventing values',async()=>fixture(async(c,f)=>{
 const before=(await c.query('SELECT count(*)::int n FROM listings')).rows[0].n;
 const input={...f.input,manualUnit:{...f.input.manualUnit}};delete input.manualUnit.beds;
 await expect(createIntakeInventoryDraft(c,actor,f.engine,input)).rejects.toMatchObject({status:422});
 expect((await c.query('SELECT count(*)::int n FROM listings')).rows[0].n).toBe(before);
 expect((await c.query('SELECT count(*)::int n FROM digitization_intake_draft_links WHERE digitization_id=$1',[f.engine])).rows[0].n).toBe(0);
}));
it('confirmed intake facts create one private canonical draft with exact price and provenance while source target stays immutable',async()=>fixture(async(c,f)=>{
 const result=await createIntakeInventoryDraft(c,actor,f.engine,f.input);
 expect(result).toMatchObject({status:'draft',listingVersion:1,workspaceVersion:3,reviewRequired:true,sourceEvidenceTransferred:false});
 const unit=(await c.query('SELECT area::text,beds,living_rooms,baths FROM units WHERE id=$1',[result.unitId])).rows[0];expect(unit).toEqual({area:'97.75',beds:2,living_rooms:1,baths:1});
 expect((await c.query('SELECT price::text,status FROM listings WHERE id=$1',[result.listingId])).rows[0]).toEqual({price:'2500000.25',status:'draft'});
 const link=(await c.query('SELECT unit_provenance FROM digitization_intake_draft_links WHERE id=$1',[result.id])).rows[0];expect(link.unit_provenance).toMatchObject({area:'confirmed_document',beds:'user',communityId:'user',privateAddress:'user'});
 expect((await c.query('SELECT target_type,target_id FROM property_digitizations WHERE id=$1',[f.engine])).rows[0]).toEqual({target_type:'intake',target_id:f.engine});
 expect((await c.query("SELECT candidate->'target'->>'type' target FROM fact_candidates WHERE id=$1",[f.candidate])).rows[0].target).toBe('intake');
 await expect(createIntakeInventoryDraft(c,actor,f.engine,{...f.input,workspaceVersion:3})).rejects.toMatchObject({status:409});
}));
it('newer source or confirmation and unrelated actors cannot create an intake draft',async()=>fixture(async(c,f)=>{
 await expect(createIntakeInventoryDraft(c,actor,f.engine,{...f.input,workspaceVersion:1})).rejects.toMatchObject({status:409});
 await expect(createIntakeInventoryDraft(c,{...actor,orgId:'10000000-0000-4000-8000-000000000005'},f.engine,f.input)).rejects.toMatchObject({status:403});
 await c.query("INSERT INTO fact_decisions(digitization_id,organization_id,created_by,candidate_id,candidate_version,decision) VALUES($1,$2,$3,$4,1,'conflict')",[f.engine,actor.orgId,actor.id,f.candidate]);
 await expect(createIntakeInventoryDraft(c,actor,f.engine,f.input)).rejects.toMatchObject({status:409});
}));
it('manual corrections retain user provenance and cannot bypass the canonical market currency',async()=>fixture(async(c,f)=>{
 await expect(createIntakeInventoryDraft(c,actor,f.engine,{...f.input,listing:{...f.input.listing,currency:'AED'}})).rejects.toMatchObject({status:400});
 const result=await createIntakeInventoryDraft(c,actor,f.engine,{...f.input,manualUnit:{...f.input.manualUnit,area:'98.00'}});
 expect((await c.query('SELECT area::text FROM units WHERE id=$1',[result.unitId])).rows[0].area).toBe('98.00');
 expect((await c.query("SELECT unit_provenance->>'area' origin FROM digitization_intake_draft_links WHERE id=$1",[result.id])).rows[0].origin).toBe('user');
}));
