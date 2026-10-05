import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction} from '../../packages/database/src/index';
const admin={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
afterAll(()=>pool.end());
it('G01 database rejects a station whose city differs from its district',async()=>{
 await expect(transaction(admin,async c=>{
  const city=(await c.query("INSERT INTO cities(id,slug,name,country,currency,timezone) VALUES(gen_random_uuid(),'isolated-cross-city-test','Isolated city','CN','CNY','Asia/Shanghai') RETURNING id")).rows[0];
  const line=(await c.query("INSERT INTO transit_lines(city_id,slug,name) VALUES($1,'isolated-line','Isolated line') RETURNING id",[city.id])).rows[0];
  const district=(await c.query("SELECT id FROM districts WHERE city_id=(SELECT id FROM cities WHERE slug='bj') ORDER BY id LIMIT 1")).rows[0];
  await c.query("INSERT INTO transit_stations(city_id,line_id,district_id,slug,name,latitude,longitude) VALUES($1,$2,$3,'invalid-city','Invalid city',39.9,116.4)",[city.id,line.id,district.id]);
 })).rejects.toMatchObject({code:'23503'});
});
it('G01 database refuses changing a stable geography slug',async()=>{
 await expect(transaction(admin,c=>c.query("UPDATE cities SET slug='changed-city-slug' WHERE slug='bj'"))).rejects.toMatchObject({code:'23514'});
});
it('G02 public community buildings omit private unit and tenant data',async()=>{
 const result=await transaction(null,c=>c.query("SELECT b.id,b.name,b.floors,b.completed_year FROM buildings b JOIN communities co ON co.id=b.community_id WHERE co.slug='willow-park' ORDER BY b.id"));
 expect(result.rowCount).toBeGreaterThan(0);expect(JSON.stringify(result.rows)).not.toMatch(/PRIVATE_FIXTURE|private_address|tenant_id|owner_id/);
});
it('G02 unit building mismatch is rejected by the database',async()=>{
 await expect(transaction(admin,async c=>{const building=(await c.query("SELECT id FROM buildings WHERE community_id<>'10000000-0000-4000-8000-000000000040' ORDER BY id LIMIT 1")).rows[0];await c.query("UPDATE units SET building_id=$1 WHERE id='10000000-0000-4000-8000-000000001000'",[building.id]);})).rejects.toMatchObject({code:'23514'});
});
