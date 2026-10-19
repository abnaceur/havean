// Copy only the retained licensed CPU fixture into the isolated integration DB.
// This is test seeding, not an application import or GPU reconstruction result.
import './env';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {latestCameraReview,readCameraTrainingArchive} from '../../apps/api/src/inventory/digitization/camera-results';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
const directory='infra/generated/integration/gsplat',engine='9acf2520-a922-4b23-830e-0a55aa0b97a6';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const tables=['property_digitizations','media_assets','property_input_revisions','digitization_asset_bindings','processing_runs','processing_stages','processing_stage_dependencies','stage_attempts','artifacts','digitization_frame_datasets','digitization_frame_privacy_recipes','digitization_camera_inputs'];
try{
 if(process.argv[2]==='export'){
  if(process.env.HAVEN_ENV_FILE!=='.env')throw Error('Export only the known local CPU fixture');
  mkdirSync(directory,{recursive:true});
  const snapshot=await transaction(actor,async c=>{
   const review=await latestCameraReview(c,actor,engine);if(!review?.trainingArchiveAvailable)throw Error('Retained calibrated fixture required');
   const archive=(await c.query("SELECT ar.* FROM artifacts ar JOIN artifacts report ON report.stage_id=ar.stage_id WHERE report.id=$1 AND ar.quality_report->>'kind'='camera_training_archive'",[review.artifactId])).rows[0];
   const rows:Record<string,unknown[]>={};for(const table of tables){const filter=table==='property_digitizations'?'id=$1':table==='media_assets'?'id IN(SELECT asset_id FROM digitization_asset_bindings WHERE digitization_id=$1)':'digitization_id=$1';rows[table]=(await c.query(`SELECT * FROM ${table} WHERE ${filter}`,[engine])).rows;}
   return {engine,review,archive,rows};
  });
  writeFileSync(directory+'/archive.tar',await readCameraTrainingArchive(actor,engine,snapshot.review.artifactId),{mode:0o600});
  writeFileSync(directory+'/fixture.json',JSON.stringify(snapshot),{mode:0o600});
  // Hex encoding makes the seed SQL data-only, even if a source label has quotes.
  writeFileSync(directory+'/seed.sql',"BEGIN; SET LOCAL session_replication_role=replica;\n"+tables.map(table=>`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},convert_from(decode('${Buffer.from(JSON.stringify(snapshot.rows[table])).toString('hex')}','hex'),'UTF8')::jsonb) ON CONFLICT DO NOTHING;`).join('\n')+'\nCOMMIT;\n',{mode:0o600});
  console.log('Exported only the retained CPU camera fixture for isolated transport validation.');
 }else if(process.argv[2]==='storage'){
  if(process.env.HAVEN_ENV_FILE!=='.env.integration')throw Error('Seed storage only in the isolated integration environment');
  const fixture=JSON.parse(readFileSync(directory+'/fixture.json','utf8')),storage=captureStorage(),requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{PutObjectCommand}=requireApi('@aws-sdk/client-s3');
  try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:fixture.archive.object_key,Body:readFileSync(directory+'/archive.tar'),ContentType:'application/x-tar'}));}finally{storage.destroy();}
  console.log('Seeded the calibrated CPU archive in isolated private storage.');
 }else throw Error('Choose export or storage');
}finally{await pool.end();}
