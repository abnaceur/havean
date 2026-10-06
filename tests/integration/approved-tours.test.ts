import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
afterAll(()=>pool.end());
const origin=(process.env.INTEGRATION_WEB_URL||process.env.PUBLIC_WEB_URL||'http://localhost:8088');
it('D09 only scanned decoded approved panoramas expose public metadata and a tour badge; denied assets expose no storage URL',async()=>{
 const sentinel='PRIVATE-OBJECT-'+crypto.randomUUID();let listing='',asset='',media='';
 await transaction(workerActor,async c=>{
  listing=(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,'D09 tour fixture','Synthetic authorized tour metadata fixture','sale','residential','CNY','2333333.33',photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id`,['tour-'+crypto.randomUUID()])).rows[0].id;
  asset=(await c.query(`INSERT INTO media_assets(owner_id,listing_id,object_key,mime,size,rights,visibility,status,purpose,width,height,scan_at,variants) VALUES($1,$2,$3,'image/jpeg',100,'Synthetic authorized metadata test','public','approved','panorama',2048,1024,now(),$4) RETURNING id`,[workerActor.id,listing,sentinel,{display:'variants/'+sentinel+'.webp'}])).rows[0].id;
  media=(await c.query(`INSERT INTO listing_media(listing_id,asset_id,kind,title,status,submitted_by) VALUES($1,$2,'panorama','Approved scene','approved',$3) RETURNING id`,[listing,asset,workerActor.id])).rows[0].id;
 });
 const detail=async()=> (await (await fetch(origin+'/api/v1/listings/'+listing)).json()).data;
 const rows=async()=> (await (await fetch(origin+'/api/v1/listings/'+listing+'/media')).json()).data;
 async function assertHidden(){expect((await detail()).tourAvailable).toBe(false);expect(await rows()).toEqual([]);const r=await fetch(origin+'/api/v1/media/'+asset+'/view');expect(r.status).toBe(404);expect(r.headers.get('location')).toBeNull();expect(await r.text()).not.toContain(sentinel);}
 try{
  expect((await detail()).tourAvailable).toBe(true);const publicRows=await rows();expect(publicRows.map((x:any)=>x.id)).toEqual([media]);expect(publicRows[0].url).toBe('/api/v1/media/'+asset+'/view');expect(JSON.stringify(publicRows)).not.toContain(sentinel);
  for(const status of ['draft','rejected']){await transaction(workerActor,c=>c.query('UPDATE listing_media SET status=$2 WHERE id=$1',[media,status]));await assertHidden();}
  await transaction(workerActor,c=>c.query("UPDATE listing_media SET status='approved' WHERE id=$1",[media]));
  for(const change of ["visibility='private'","status='quarantined'","scan_at=NULL"]){await transaction(workerActor,async c=>{await c.query("UPDATE media_assets SET visibility='public',status='approved',scan_at=now() WHERE id=$1",[asset]);await c.query(`UPDATE media_assets SET ${change} WHERE id=$1`,[asset]);});await assertHidden();}
  await transaction(workerActor,c=>c.query("UPDATE media_assets SET visibility='public',status='approved',scan_at=now(),variants='{}' WHERE id=$1",[asset]));await assertHidden();
  await transaction(workerActor,c=>c.query("UPDATE media_assets SET variants=$2,width=800 WHERE id=$1",[asset,{display:'variants/'+sentinel+'.webp'}]));expect((await detail()).tourAvailable).toBe(false);expect(await rows()).toEqual([]);
  await transaction(workerActor,c=>c.query("UPDATE media_assets SET width=2048 WHERE id=$1",[asset]));expect((await detail()).tourAvailable).toBe(true);
  await transaction(workerActor,c=>c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[listing]));expect((await fetch(origin+'/api/v1/listings/'+listing)).status).toBe(404);expect((await fetch(origin+'/api/v1/listings/'+listing+'/media')).status).toBe(404);const r=await fetch(origin+'/api/v1/media/'+asset+'/view');expect(r.status).toBe(404);expect(await r.text()).not.toContain(sentinel);
 }finally{await transaction(workerActor,async c=>{await c.query("UPDATE listings SET status='paused',version=version+1 WHERE id=$1",[listing]);await c.query("UPDATE media_assets SET status='quarantined' WHERE id=$1",[asset]);});}
});
