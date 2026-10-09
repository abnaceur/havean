import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
import {verifySmallDigitizationSource} from '../../apps/api/src/inventory/digitization/source-validation';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{CreateBucketCommand,PutObjectCommand,DeleteObjectCommand}=requireApi('@aws-sdk/client-s3');
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('HE-B03 small-upload source validation detects forged MIME/object sizes and retains explicit PDF decoder state',async()=>{
 const workspace=await transaction(agent,c=>createIntake(c,agent)),key=crypto.randomUUID(),bytes=Buffer.from('%PDF-1.4\nSynthetic signature fixture; isolated PDF decoder must still validate this input.');
 const asset=await transaction(agent,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',$3,'Synthetic forged-source test fixture','private','document','approved',now()) RETURNING id,version",[agent.id,key,bytes.length])).rows[0]);const storage=captureStorage();
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name)&&e.$metadata?.httpStatusCode!==409)throw e;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));const source=await verifySmallDigitizationSource(agent,workspace.id,asset.id,asset.version,1,'document');expect(source.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));expect(source.decoderState).toBe('requires_isolated_pdf_decoder');
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:Buffer.alloc(bytes.length,65)}));await expect(verifySmallDigitizationSource(agent,workspace.id,asset.id,asset.version,1,'document')).rejects.toMatchObject({status:422});
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:Buffer.alloc(bytes.length+1,65)}));await expect(verifySmallDigitizationSource(agent,workspace.id,asset.id,asset.version,1,'document')).rejects.toMatchObject({status:422});
  const over=await transaction(agent,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',20971521,'Synthetic oversize metadata without object','private','document','approved',now()) RETURNING id,version",[agent.id,crypto.randomUUID()])).rows[0]);await expect(verifySmallDigitizationSource(agent,workspace.id,over.id,over.version,1,'document')).rejects.toMatchObject({status:413});
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();}
});

it('HE-B04 current stored bytes must pass real malware policy even when the old asset row is marked scanned',async()=>{
 const workspace=await transaction(agent,c=>createIntake(c,agent)),key=crypto.randomUUID();
 const bytes=Buffer.from(['X5O!P%@AP[4','\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''));
 const asset=await transaction(agent,async c=>(await c.query("INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose,status,scan_at) VALUES($1,$2,'application/pdf',$3,'Synthetic malicious object substitution','private','document','approved',now()) RETURNING id,version",[agent.id,key,bytes.length])).rows[0]);
 const storage=captureStorage();
 try{
  try{await storage.send(new CreateBucketCommand({Bucket:'haven-private'}));}catch(e:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name))throw e;}
  await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key,Body:bytes}));
  await expect(verifySmallDigitizationSource(agent,workspace.id,asset.id,asset.version,1,'document')).rejects.toMatchObject({status:400,response:{code:'UNSAFE_FILE'}});
  expect(await transaction(agent,async c=>(await c.query('SELECT count(*)::int n FROM property_input_revisions WHERE digitization_id=$1',[workspace.id])).rows[0].n)).toBe(0);
 }finally{await storage.send(new DeleteObjectCommand({Bucket:'haven-private',Key:'quarantine/'+key}));storage.destroy();}
},60000);
