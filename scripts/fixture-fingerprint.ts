import fs from 'node:fs';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../packages/database/package.json',import.meta.url));
const {Pool}=require('pg') as typeof pg;
const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL});
const tables=['profiles','organizations','memberships','cities','districts','communities','neighborhoods','transit_lines','transit_stations','buildings','units','unit_private_details','agents','listings','residential_details','commercial_details','rental_terms','listing_mandates','developments','floor_plans','providers','management_grants','tenants','leases','market_config'];
try{
 const state:Record<string,unknown>={};
 for(const table of tables){const rows=await pool.query(`SELECT coalesce(jsonb_agg(row ORDER BY row::text),'[]') AS rows FROM (SELECT to_jsonb(t) AS row FROM ${table} t) records`);state[table]=rows.rows[0].rows;}
 const fingerprint=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 const path=process.argv[2];if(path){fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync(path,JSON.stringify({fingerprint,counts:Object.fromEntries(Object.entries(state).map(([table,rows])=>[table,(rows as unknown[]).length]))},null,2)+'\n');}
 console.log('Synthetic fixture fingerprint: '+fingerprint);
}finally{await pool.end();}
