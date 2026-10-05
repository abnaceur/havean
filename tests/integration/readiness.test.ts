import '../support/env';
import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
import {checkReadiness,requiredMigrations} from '../../apps/api/src/platform/observability';
const requireDatabase=createRequire(new URL('../../packages/database/package.json',import.meta.url));
const {Pool}=requireDatabase('pg');
it('F13 readiness requires a reachable database and every source migration',async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1000});
 try{expect(await checkReadiness(pool)).toEqual({status:'ready',database:'up',migrations:'current'});expect(await checkReadiness(pool,[...requiredMigrations,'999-unapplied.sql'])).toEqual({status:'not_ready',database:'up',migrations:'incomplete'});}finally{await pool.end();}
});
it('F13 real database connection outage fails readiness without leaking credentials',async()=>{
 const pool=new Pool({connectionString:'postgres://private_user:private_password@127.0.0.1:1/private_database',connectionTimeoutMillis:1000});
 try{const response=await checkReadiness(pool);expect(response).toEqual({status:'not_ready',database:'unavailable',migrations:'unknown'});expect(JSON.stringify(response)).not.toMatch(/private_|ECONNREFUSED/);}finally{await pool.end();}
});
