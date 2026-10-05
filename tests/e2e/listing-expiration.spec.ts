import '../support/env';
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {login,apiRequest} from '../support/browser';
const require=createRequire(new URL('../../packages/database/package.json',import.meta.url)),{Pool}=require('pg');const fixtures=new Pool({connectionString:process.env.DATABASE_URL});test.afterAll(()=>fixtures.end());
async function property(title:string,transaction='sale'){
 const c=await fixtures.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.admin','true',true),set_config('app.actor','00000000-0000-4000-8000-000000000010',true)");const row=(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,rent_period,photos,status,published_at) SELECT unit_id,organization_id,owner_id,agent_id,$1,$2,description,$3,segment,currency,price,CASE WHEN $3='rent' THEN 'month' END,photos,'published',now() FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id,slug,version`,['expiry-browser-'+crypto.randomUUID(),title,transaction])).rows[0];await c.query('COMMIT');return row;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
async function record(page:any,id:string){return(await(await page.request.get('http://localhost:8089/api/v1/ops/listings/'+id+'/workbench')).json()).data;}
async function unavailable(page:any,row:any){
 expect((await page.request.get('http://localhost:8088/api/v1/listings/'+row.slug)).status()).toBe(404);
 expect((await page.request.post('/api/v1/inquiries',{headers:{Origin:'http://localhost:8088','idempotency-key':crypto.randomUUID()},data:{resourceId:row.id,resourceType:'listing',name:'Expiry Buyer',email:'expiry@example.test',phone:'123456789',message:'This withdrawn property must reject a late inquiry.',consent:true}})).status()).toBe(404);
 expect((await page.request.post('/api/v1/viewings',{headers:{Origin:'http://localhost:8088','idempotency-key':crypto.randomUUID()},data:{listingId:row.id,startAt:new Date(Date.now()+86400000).toISOString()}})).status()).toBe(404);
 await page.goto('/bj/buy/'+row.slug);await expect(page.getByRole('heading',{name:'This page is unavailable.',exact:true})).toBeVisible();await expect(page.locator('.detail-actions')).toHaveCount(0);
}
test('I08 authors schedule and remove expiration, reject stale/past/foreign edits, and actual dispatcher expires the listing',async({page},info)=>{
 test.setTimeout(180000);const title='Scheduled expiration '+info.project.name+' '+crypto.randomUUID(),row=await property(title);
 await login(page,'agent','http://localhost:8089','/ops/listings');await page.getByLabel('Search records',{exact:true}).fill(title);await page.getByRole('button',{name:'Apply inventory filters',exact:true}).click();const listing=page.locator('tr[data-record-id="'+row.id+'"]');await listing.getByRole('button',{name:'Expiration',exact:true}).click();await page.getByLabel('Expiration time (UTC)',{exact:true}).fill(new Date(Date.now()+3600000).toISOString().slice(0,16));await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);let current=await record(page,row.id);expect(current.expires_at).toBeTruthy();
 expect((await apiRequest(page,'/ops/listings/'+row.id+'/expiration',{version:row.version,expiresAt:null},'PATCH')).status()).toBe(409);expect((await apiRequest(page,'/ops/listings/'+row.id+'/expiration',{version:current.version,expiresAt:'2020-01-01T00:00:00Z'},'PATCH')).status()).toBe(400);
 await listing.getByRole('button',{name:'Expiration',exact:true}).click();await page.getByLabel('Expiration time (UTC)',{exact:true}).fill('');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);current=await record(page,row.id);expect(current.expires_at).toBeNull();
 await page.locator('.inventory-workbench').screenshot({path:'evidence/i08-schedule-'+info.project.name+'.png'});
 expect((await apiRequest(page,'/ops/listings/'+row.id+'/expiration',{version:current.version,expiresAt:new Date(Date.now()+5000).toISOString()},'PATCH')).status()).toBe(200);await expect.poll(async()=>(await record(page,row.id)).status,{timeout:25000}).toBe('expired');
 await login(page,'outsider','http://localhost:8089','/ops/listings');expect((await apiRequest(page,'/ops/listings/'+row.id+'/expiration',{version:current.version+1,expiresAt:null},'PATCH')).status()).toBe(404);
 await login(page,'buyer');await unavailable(page,row);await page.screenshot({path:'evidence/i08-expired-'+info.project.name+'.png'});
});
test('I08 pause, sold and leased transitions immediately withdraw detail, inquiry and booking eligibility',async({page},info)=>{
 test.setTimeout(180000);const rows=[];for(const status of ['paused','sold','leased'])rows.push({status,...await property('Withdrawal '+status+' '+info.project.name+' '+crypto.randomUUID(),status==='leased'?'rent':'sale')});
 await login(page,'agent','http://localhost:8089','/ops/listings');
 expect((await apiRequest(page,'/ops/listings/'+rows[0].id+'/transition',{version:1,status:'leased',reason:'A sale listing cannot be completed as a rental'})).status()).toBe(409);
 for(const row of rows)expect((await apiRequest(page,'/ops/listings/'+row.id+'/transition',{version:1,status:row.status,reason:'Verified transaction withdrawal for the acceptance fixture'})).status()).toBe(201);
 await login(page,'buyer');for(const row of rows)await unavailable(page,row);
});
