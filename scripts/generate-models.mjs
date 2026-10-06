import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../packages/database/package.json',import.meta.url));
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL});
try{
 const rows=(await pool.query("SELECT table_name,column_name,data_type,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('spatial_ref_sys','geography_columns','geometry_columns') ORDER BY table_name,ordinal_position")).rows;
 const tables=new Map();
 for(const row of rows){
  if(row.udt_name==='geography'||row.udt_name==='geometry')continue;
  let schema;
  if(row.data_type==='ARRAY')schema='z.array('+(row.udt_name==='_uuid'?'z.string().uuid()':['_int2','_int4','_float4','_float8'].includes(row.udt_name)?'z.number()':row.udt_name==='_bool'?'z.boolean()':'z.string()')+')';
  else if(row.data_type==='uuid')schema='z.string().uuid()';
  else if(['integer','smallint','real','double precision'].includes(row.data_type))schema='z.number()';
  else if(row.data_type==='boolean')schema='z.boolean()';
  else if(['json','jsonb'].includes(row.data_type))schema='z.json()';
  else if(row.data_type==='numeric')schema="z.string().regex(/^-?\\d+(\\.\\d+)?$/)";
  else schema='z.string()';
  if(row.is_nullable==='YES'&&(row.table_name!=='public_listings'||['price','rentPeriod','rentalMode','availableFrom','agentId','latitude','longitude','publishedAt','neighborhoodId','builtYear','floorCategory','buildingType','finishing','heating','propertyType','grossArea','usableArea','areaBasis','priceBasis','fitOut','parkingSpaces','commercialFloor'].includes(row.column_name)))schema+='.nullable()';
  if(!tables.has(row.table_name))tables.set(row.table_name,[]);
  tables.get(row.table_name).push(JSON.stringify(row.column_name)+':'+schema);
 }
 const source="// Generated from the migrated database schema. Run pnpm contracts:models.\nimport {z} from 'zod';\nexport const models={\n"+[...tables].map(([table,fields])=>JSON.stringify(table)+':z.object({'+fields.join(',')+'})').join(',\n')+'\n};\n';
 fs.writeFileSync('packages/contracts/src/generated/models.ts',source);
 console.log('Generated '+tables.size+' model schemas; no database values exported.');
}finally{await pool.end();}
