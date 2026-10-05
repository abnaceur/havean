import '../support/env';
import {describe,it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
import type pg from 'pg';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const person=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const agent={id:person(3),orgId:id(1),roles:['agent']},outsider={id:person(11),orgId:id(5),roles:['agent']},manager={id:person(4),orgId:id(2),roles:['property_manager','finance']};
afterAll(()=>pool.end());
async function rollback(a:typeof agent,work:(c:pg.PoolClient)=>Promise<void>){try{await transaction(a,async c=>{await work(c);throw Error('TEST_ROLLBACK');});}catch(e){if(!(e instanceof Error)||e.message!=='TEST_ROLLBACK')throw e;}}
describe('F05 real database migration and role',()=>{it('has migrated PostGIS tables and public inventory',async()=>{const r=await pool.query('SELECT postgis_version() AS version');expect(r.rows[0].version).toContain('3.5');expect(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count)).toBeGreaterThan(0);expect(Number((await pool.query('SELECT count(*) FROM public_listings')).rows[0].count)).toBeGreaterThan(90);});it('runtime cannot change schema',async()=>{await expect(pool.query('ALTER TABLE listings ADD COLUMN forbidden_test text')).rejects.toMatchObject({code:'42501'});});});
describe('F07 RLS and published projections',()=>{it('public read deliberately excludes private fields and drafts',async()=>{const r=await transaction(null,c=>c.query('SELECT * FROM public_listings WHERE id=$1',[id(2000)]));expect(r.rowCount).toBe(1);expect(r.rows[0]).not.toHaveProperty('private_address');expect(r.rows[0]).not.toHaveProperty('owner_id');expect(r.rows[0]).not.toHaveProperty('organization_id');const draft=await transaction(null,c=>c.query('SELECT * FROM listings WHERE id=$1',[id(2101)]));expect(draft.rowCount).toBe(0);});it('denies foreign organization private insert',async()=>{await expect(transaction(agent,c=>c.query('INSERT INTO leads(user_id,organization_id,resource_id,resource_type,name,email,phone,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[agent.id,outsider.orgId,id(2000),'listing','Test','test@example.test','123456789','Private note']))).rejects.toMatchObject({code:'42501'});});it('pooled connection scopes do not leak',async()=>{await rollback(agent,async c=>{const inserted=await c.query('INSERT INTO leads(user_id,organization_id,resource_id,resource_type,name,email,phone,message,agent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[person(1),agent.orgId,id(2000),'listing','Isolation Test','test@example.test','123456789','PRIVATE_SENTINEL',id(60)]);await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true)",[outsider.id,outsider.orgId]);expect((await c.query('SELECT * FROM leads WHERE id=$1',[inserted.rows[0].id])).rowCount).toBe(0);});await transaction(outsider,async c=>expect((await c.query("SELECT count(*) FROM leads WHERE organization_id=$1",[agent.orgId])).rows[0].count).toBe('0'));expect((await pool.query("SELECT nullif(current_setting('app.org',true),'') AS scope")).rows[0].scope).toBeNull();});});
describe('P04/P07 real money and lease integrity',()=>{it('manager sees permitted portfolio; outsider cannot see leases',async()=>{expect((await transaction(manager,c=>c.query('SELECT * FROM leases WHERE id=$1',[id(5100)]))).rowCount).toBe(1);expect((await transaction(outsider,c=>c.query('SELECT * FROM leases WHERE id=$1',[id(5100)]))).rowCount).toBe(0);});it('rejects overlapping active leases',async()=>{await expect(transaction(manager,c=>c.query("INSERT INTO leases(organization_id,unit_id,tenant_id,start_date,end_date,rent,currency,status) VALUES($1,$2,$3,'2026-11-01','2027-01-01','6500.00','CNY','active')",[id(2),id(1060),id(5000)]))).rejects.toMatchObject({code:'23P01'});});it('stores exact decimal payments and prevents posted changes',async()=>{await rollback(manager,async c=>{const r=await c.query("INSERT INTO payments(lease_id,organization_id,amount,currency,source,reference,actor_id) VALUES($1,$2,'100.10','CNY','receipt','integrity-test',$3) RETURNING id,amount::text",[id(5100),id(2),person(4)]);expect(r.rows[0].amount).toBe('100.10');await c.query('SAVEPOINT immutability');await expect(c.query('UPDATE payments SET amount=200 WHERE id=$1',[r.rows[0].id])).rejects.toMatchObject({code:'P0001'});await c.query('ROLLBACK TO SAVEPOINT immutability');});});it('negative money is rejected by database constraints',async()=>{await expect(transaction(manager,c=>c.query("INSERT INTO payments(lease_id,organization_id,amount,currency,source,reference,actor_id) VALUES($1,$2,'-1.00','CNY','receipt','invalid',$3)",[id(5100),id(2),person(4)]))).rejects.toMatchObject({code:'23514'});});});
describe('F07 management grant expiry',()=>{it('an expired grant immediately removes lease and financial read access',async()=>{
 await rollback(manager,async c=>{
  await c.query("UPDATE management_grants SET expires_at=now()-interval '1 second' WHERE unit_id=$1",[id(1060)]);
  expect((await c.query('SELECT * FROM leases WHERE id=$1',[id(5100)])).rowCount).toBe(0);
  expect((await c.query('SELECT * FROM charges WHERE lease_id=$1',[id(5100)])).rowCount).toBe(0);
  expect((await c.query('SELECT * FROM payments WHERE lease_id=$1',[id(5100)])).rowCount).toBe(0);
 });
});});
describe('L04 viewing availability',()=>{it('rejects concurrent interval overlap at the database',async()=>{await rollback(agent,async c=>{await c.query("INSERT INTO viewings(listing_id,user_id,agent_id,start_at,end_at) VALUES($1,$2,$3,'2031-01-04T10:00:00Z','2031-01-04T11:00:00Z')",[id(2000),person(3),id(60)]);await c.query('SAVEPOINT overlap');await expect(c.query("INSERT INTO viewings(listing_id,user_id,agent_id,start_at,end_at) VALUES($1,$2,$3,'2031-01-04T10:30:00Z','2031-01-04T11:30:00Z')",[id(2000),person(3),id(60)])).rejects.toMatchObject({code:'23P01'});await c.query('ROLLBACK TO SAVEPOINT overlap');});});});
describe('F07 private unit details',()=>{
 it('keeps addresses out of anonymous and foreign raw SQL reads',async()=>{
  expect((await transaction(null,c=>c.query('SELECT * FROM unit_private_details'))).rowCount).toBe(0);
  expect((await transaction(outsider,c=>c.query('SELECT * FROM unit_private_details WHERE unit_id=$1',[id(1000)]))).rowCount).toBe(0);
  const units=await transaction(null,c=>c.query('SELECT * FROM units WHERE id=$1',[id(1000)]));
  expect(units.rows[0]).not.toHaveProperty('private_address');
 });
 it('permits the owner, assigned agent and current manager; expires the management grant',async()=>{
  const owner={id:person(2),orgId:null,roles:['owner']};
  expect((await transaction(owner,c=>c.query('SELECT * FROM unit_private_details WHERE unit_id=$1',[id(1000)]))).rowCount).toBe(1);
  expect((await transaction(agent,c=>c.query('SELECT * FROM unit_private_details WHERE unit_id=$1',[id(1000)]))).rowCount).toBe(1);
  expect((await transaction(manager,c=>c.query('SELECT * FROM unit_private_details WHERE unit_id=$1',[id(1060)]))).rowCount).toBe(1);
  await rollback(manager,async c=>{await c.query("UPDATE management_grants SET expires_at=now()-interval '1 second' WHERE unit_id=$1",[id(1060)]);expect((await c.query('SELECT * FROM unit_private_details WHERE unit_id=$1',[id(1060)])).rowCount).toBe(0);});
 });
 it('does not reveal private listing revisions owned by another actor',async()=>{
  await rollback(agent,async c=>{
   const row=(await c.query("INSERT INTO listing_revisions(listing_id,actor_id,base_version,changes) SELECT $1,$2,version,'{\"title\":\"PRIVATE_REVISION_SENTINEL\"}' FROM listings WHERE id=$1 RETURNING id",[id(2000),agent.id])).rows[0];
   await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true)",[outsider.id,outsider.orgId]);
   expect((await c.query('SELECT * FROM listing_revisions WHERE id=$1',[row.id])).rowCount).toBe(0);
  });
 });
});
describe('F07 consumer organization memberships',()=>{
 it('does not grant a consumer organization-wide private rows',async()=>{
  const buyer={id:person(1),orgId:id(1),roles:['consumer']};
  expect((await transaction(buyer,c=>c.query('SELECT * FROM unit_private_details'))).rowCount).toBe(0);
  expect((await transaction(buyer,c=>c.query('SELECT * FROM listings WHERE id=$1',[id(2101)]))).rowCount).toBe(0);
  await transaction(buyer,async c=>expect((await c.query("SELECT nullif(current_setting('app.org',true),'') AS scope")).rows[0].scope).toBeNull());
 });
});
