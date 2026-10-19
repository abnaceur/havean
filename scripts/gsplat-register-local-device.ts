// Trusted local deployment registration; does not alter property records.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url)),{Pool}=requireApi('pg');
assert.equal(process.env.NODE_ENV,'development');
assert.equal(process.env.PROCESSING_DEPLOYMENT,'development');
assert.equal(process.env.PROCESSING_ENABLE_GSPLAT_INVESTIGATION,'true');
const device=process.argv[2];assert.match(device,/^GPU-[0-9a-f-]{36}$/i);
const db=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),profiles=['gsplat-1.5.3-cu126-fixed-density-investigation-v1','gsplat-1.5.3-cu126-adaptive-investigation-v2'];
try{
 const connection=await db.connect();
 try{
  await connection.query('BEGIN');
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('local-gsplat-device-registration',0))");
  const existing=(await connection.query('SELECT resource_key,stage_id FROM digitization_gpu_slots WHERE enabled AND profiles && $1::text[]',[profiles])).rows;
  assert.ok(existing.every((row:{resource_key:string;stage_id:string|null})=>row.resource_key===device&&row.stage_id===null),'Another active device/reservation must not be overwritten');
  const result=await connection.query('INSERT INTO digitization_gpu_slots(resource_key,enabled,profiles) VALUES($1,true,$2) ON CONFLICT(resource_key) DO UPDATE SET enabled=true,profiles=excluded.profiles WHERE digitization_gpu_slots.stage_id IS NULL RETURNING id',[device,profiles]);
  assert.equal(result.rowCount,1);await connection.query('COMMIT');
  console.log(JSON.stringify({label:'P',registeredDevices:1,profiles}));
 }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
}finally{await db.end();}
