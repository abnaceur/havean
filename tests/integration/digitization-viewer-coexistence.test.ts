import '../support/env';
import {readFileSync} from 'node:fs';
import {afterAll,expect,it} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../packages/database/package.json',import.meta.url)),pg=require('pg');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
afterAll(()=>pool.end());
it.skipIf(process.env.CHECK_AGENT_WORKFLOW_EXAMPLE!=='true')('withdraws either reviewed viewer without hiding the other',async()=>{
 const f=JSON.parse(readFileSync('infra/generated/digitization-agent-actions.json','utf8')),c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query('SET LOCAL ROLE haven_app');
  await c.query("SELECT set_config('app.actor','00000000-0000-4000-8000-000000000003',true),set_config('app.org','10000000-0000-4000-8000-000000000001',true),set_config('app.admin','false',true),set_config('app.review','false',true),set_config('app.agent_only','true',true)");
  const read=async()=>(await c.query('SELECT digitization_public_model($1) model,digitization_public_package($1) tour',[f.listingId])).rows[0];
  const initial=await read();expect(initial.model).not.toBeNull();expect(initial.tour).not.toBeNull();
  for(const type of ['model','tour'] as const){await c.query('SAVEPOINT viewer');await c.query('SELECT digitization_revoke_package($1,1,$2)',[initial[type].packageId,'Rolled-back functional withdrawal of synthetic fixture.']);const after=await read();expect(after[type]).toBeNull();expect(after[type==='model'?'tour':'model']).not.toBeNull();await c.query('ROLLBACK TO SAVEPOINT viewer');}
  expect(await read()).toEqual(initial);
 }finally{await c.query('ROLLBACK');c.release();}
});
