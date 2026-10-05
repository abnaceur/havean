import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
const admin={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
const buyer={id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['consumer']};
const source='10000000-0000-4000-8000-000000002000',otherOrg='10000000-0000-4000-8000-000000000005';
const clone=`INSERT INTO listings(unit_id,organization_id,owner_id,slug,title,description,transaction,segment,currency,price,status) SELECT unit_id,$2,owner_id,$3,title,description,transaction,segment,currency,'1234567.89','draft' FROM listings WHERE id=$1 RETURNING id,unit_id,price::text`;
afterAll(()=>pool.end());
async function rollback(work:Parameters<typeof transaction>[1]){const marker=new Error('test rollback');try{await transaction(admin,async c=>{await work(c);throw marker;});}catch(error){if(error!==marker)throw error;}}
it('I01 creates and retrieves a sale listing on the canonical unit with exact decimal price',async()=>{
 await rollback(async c=>{const row=(await c.query(clone,[source,'10000000-0000-4000-8000-000000000001','schema-test-'+crypto.randomUUID()])).rows[0];expect(row.unit_id).toBe('10000000-0000-4000-8000-000000001000');expect(row.price).toBe('1234567.89');expect((await c.query('SELECT unit_id,price::text FROM listings WHERE id=$1',[row.id])).rows[0]).toMatchObject({unit_id:row.unit_id,price:'1234567.89'});});
});
it('I01 negative area and unauthorized organization-parent mismatch are database failures',async()=>{
 await expect(transaction(admin,c=>c.query('UPDATE units SET area=-1 WHERE id=$1',['10000000-0000-4000-8000-000000001000']))).rejects.toMatchObject({code:'23514'});
 await expect(transaction(admin,c=>c.query(clone,[source,otherOrg,'invalid-org-'+crypto.randomUUID()]))).rejects.toMatchObject({code:'23514'});
});
it('I01 explicit agency mandate permits a second listing without duplicating the unit',async()=>{
 await rollback(async c=>{await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) VALUES($1,$2,$3,now()+interval '1 year')",['10000000-0000-4000-8000-000000001000',otherOrg,'00000000-0000-4000-8000-000000000002']);const row=(await c.query(clone,[source,otherOrg,'authorized-mandate-'+crypto.randomUUID()])).rows[0];expect(row.unit_id).toBe('10000000-0000-4000-8000-000000001000');});
});
it('I01 a consumer cannot forge another owner agency mandate',async()=>{
 await expect(transaction(buyer,c=>c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) VALUES($1,$2,$3,now()+interval '1 year')",['10000000-0000-4000-8000-000000001000',otherOrg,'00000000-0000-4000-8000-000000000002']))).rejects.toMatchObject({code:'42501'});
});
it('I01 subtype parent and decimal area/deposit constraints reject inconsistent terms',async()=>{
 await expect(transaction(admin,c=>c.query('INSERT INTO commercial_details(listing_id,gross_area) VALUES($1,$2)',[source,'10.25']))).rejects.toMatchObject({code:'23514'});
 await expect(transaction(admin,c=>c.query("UPDATE rental_terms SET deposit_amount=-0.01 WHERE listing_id='10000000-0000-4000-8000-000000002061'"))).rejects.toMatchObject({code:'23514'});
 await expect(transaction(admin,c=>c.query("UPDATE commercial_details SET usable_area=gross_area+1 WHERE listing_id='10000000-0000-4000-8000-000000002090'"))).rejects.toMatchObject({code:'23514'});
});

it('I01 owner cannot grant an unrelated unit under their own name',async()=>{
 await expect(transaction(admin,async c=>{
  const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) VALUES('10000000-0000-4000-8000-000000000040',$1,80,2,1,1) RETURNING id",[otherOrg])).rows[0];
  await c.query("SELECT set_config('app.actor','00000000-0000-4000-8000-000000000002',true),set_config('app.admin','false',true),set_config('app.org','',true)");
  await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) VALUES($1,$2,'00000000-0000-4000-8000-000000000002',now()+interval '1 year')",[unit.id,otherOrg]);
 })).rejects.toMatchObject({code:'42501'});
});
