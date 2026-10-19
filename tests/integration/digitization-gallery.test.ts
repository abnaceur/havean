import '../support/env';
import {afterAll,expect,it} from 'vitest';
import type pg from 'pg';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createListingDigitization} from '../../apps/api/src/inventory/digitization/intakes';
import {publicApprovedGallery} from '../../apps/api/src/inventory/rich-media';
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']},agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function scope(c:pg.PoolClient,a:Actor|null){await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.agent_only',$4,true)",[a?.id||'',a?.orgId||'',String(a?.roles.includes('admin')||false),String(a?.roles.includes('agent')||false)]);}
it('HE-F08 actual failed reconstruction leaves approved public gallery intact; private/draft/unscanned/revoked photos stay excluded',async()=>{
 const marker=new Error('rollback synthetic gallery fixture');
 try{await transaction(admin,async c=>{
  const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
  const listing=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,owner_id,agent_id,$2,'Independent gallery fixture','Self-authored policy fixture','sale','residential','CNY','2500000.25','published' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id",[unit,'gallery-'+crypto.randomUUID()])).rows[0].id;
  const ids:string[]=[];
  for(const [visibility,status,scan] of [['public','approved',true],['private','approved',true],['public','draft',true],['public','approved',false]] as const){
   const asset=(await c.query("INSERT INTO media_assets(owner_id,listing_id,object_key,mime,size,rights,visibility,status,purpose,width,height,scan_at,variants) VALUES($1,$2,$3,'image/jpeg',100,'Synthetic approval metadata only',$4,'approved','photo',1024,768,$5,$6) RETURNING id",[agent.id,listing,crypto.randomUUID(),visibility,scan?new Date():null,{display:'synthetic/private-key-never-serialized.webp'}])).rows[0].id;
   ids.push((await c.query("INSERT INTO listing_media(listing_id,asset_id,kind,title,status,submitted_by,position) VALUES($1,$2,'photo','Synthetic photo',$3,$4,$5) RETURNING id",[listing,asset,status,agent.id,ids.length])).rows[0].id);
  }
  await scope(c,agent);const engine=await createListingDigitization(c,agent,listing,1);
  await c.query("INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,1,'[]')",[engine.id,agent.orgId,agent.id]);
  const run=(await c.query("INSERT INTO processing_runs(digitization_id,organization_id,created_by,input_revision,desired_outputs,budget,deadline) VALUES($1,$2,$3,1,ARRAY['scene'],'{}',now()+interval '1 hour') RETURNING id",[engine.id,agent.orgId,agent.id])).rows[0].id;
  const stage=(await c.query("INSERT INTO processing_stages(digitization_id,organization_id,created_by,run_id,stage_type,input_revision,input_fingerprint,profile_id) VALUES($1,$2,$3,$4,'camera_solve',1,$5,'synthetic-failure-policy-v1') RETURNING id",[engine.id,agent.orgId,agent.id,run,'a'.repeat(64)])).rows[0].id;
  await scope(c,null);const before=await publicApprovedGallery(c,listing);expect(before.map(photo=>photo.id)).toEqual([ids[0]]);expect(JSON.stringify(before)).not.toContain('private-key');
  await scope(c,agent);await c.query("UPDATE processing_runs SET state='queued',version=version+1 WHERE id=$1",[run]);await c.query("UPDATE processing_stages SET state='queued',version=version+1 WHERE id=$1",[stage]);await c.query("UPDATE processing_stages SET state='leased',version=version+1,attempt=attempt+1,fencing_token=fencing_token+1,execution_id=$2,lease_until=statement_timestamp()+interval '1 minute' WHERE id=$1",[stage,crypto.randomUUID()]);await c.query("UPDATE processing_stages SET state='running',version=version+1 WHERE id=$1",[stage]);await c.query("UPDATE processing_stages SET state='failed_terminal',version=version+1,error_code='SYNTHETIC_INSUFFICIENT_OVERLAP' WHERE id=$1",[stage]);await c.query("UPDATE processing_runs SET state='failed',version=version+1 WHERE id=$1",[run]);
  await scope(c,null);expect(await publicApprovedGallery(c,listing)).toEqual(before);
  await scope(c,admin);await c.query("UPDATE listing_media SET status='rejected',version=version+1 WHERE id=$1",[ids[0]]);await scope(c,null);expect(await publicApprovedGallery(c,listing)).toEqual([]);
  throw marker;
 });}catch(error){if(error!==marker)throw error;}
});
