import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {encryptSnapshot,decryptSnapshot} from '../../scripts/recovery/envelope.mjs';
import {processingScope,processingFileProof,verifyProcessingBackup,configureRestoredProcessing,digitizationTableProofSql,digitizationRecoveryTables,readDigitizationDatabaseProof} from '../../scripts/recovery/processing.mjs';
import {availableRecoverySubnet} from '../../scripts/recovery/network.mjs';
const image='sha256:'+'a'.repeat(64),configuration={PROCESSING_DEPLOYMENT:'development',PROCESSING_ADAPTER:'unavailable',PROCESSING_ENABLE_SIMULATOR:'false'};
const backup={service:'processing-cpu',image,configuration,executionRoot:'/jobs',executionStoreVersion:1,directory:'processing/processing-cpu',volume:'haven-recovery-test-processing-cpu'};
it('current recovery covers every engine ledger table, including revocations and capture/inventory lineage',()=>{
 const migrations=path.resolve('packages/database/migrations');
 const engineTables=fs.readdirSync(migrations).filter(name=>name.endsWith('.sql')).flatMap(name=>[...fs.readFileSync(path.join(migrations,name),'utf8').matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)].map(match=>match[1])).filter(name=>name.startsWith('digitization_'));
 expect(engineTables.length).toBeGreaterThan(20);
 expect(engineTables.filter(name=>!digitizationRecoveryTables.includes(name))).toEqual([]);
 expect(new Set(digitizationRecoveryTables).size).toBe(digitizationRecoveryTables.length);
 for(const table of ['capture_sessions','processing_stage_dependencies','inventory_unit_fact_versions','outbox','outbox_effects','idempotency'])expect(digitizationRecoveryTables).toContain(table);
});
it('new snapshots fail on missing engine tables while legacy signed proof coverage remains stable',()=>{
 const queried:string[]=[];
 const runSql=(sql:string)=>{
  queried.push(sql);
  if(sql.includes('to_regclass'))return sql.includes('digitization_scene_registrations')?'f':'t';
  const table=sql.match(/'table','([a-z_]+)'/)![1];
  return JSON.stringify({table,count:'0',digest:'a'.repeat(64)});
 };
 expect(()=>readDigitizationDatabaseProof(runSql)).toThrow('DIGITIZATION_RECOVERY_TABLE_MISSING:digitization_scene_registrations');
 const legacy=readDigitizationDatabaseProof(runSql,1);
 expect(legacy.schemaVersion).toBe(1);expect(legacy.tables).toHaveLength(19);
 expect(legacy.tables.map((table:any)=>table.table)).not.toContain('digitization_scene_registrations');
 const beforeModels=readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}),2);expect(beforeModels.schemaVersion).toBe(2);expect(beforeModels.tables).toHaveLength(42);expect(beforeModels.tables.map((table:any)=>table.table)).not.toContain('digitization_model_review_requests');
 expect(()=>readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?sql.includes('digitization_model_review_requests')?'f':'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}))).toThrow('DIGITIZATION_RECOVERY_TABLE_MISSING:digitization_model_review_requests');
 const beforeTenants=readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}),3);expect(beforeTenants.tables).toHaveLength(44);expect(beforeTenants.tables.map((table:any)=>table.table)).not.toContain('digitization_tenant_deletions');
 expect(()=>readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?sql.includes('digitization_tenant_deletions')?'f':'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}))).toThrow('DIGITIZATION_RECOVERY_TABLE_MISSING:digitization_tenant_deletions');
 const beforeWriters=readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}),4);expect(beforeWriters.tables).toHaveLength(45);expect(beforeWriters.tables.map((table:any)=>table.table)).not.toContain('digitization_output_writes');
 expect(()=>readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?sql.includes('digitization_output_writes')?'f':'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}))).toThrow('DIGITIZATION_RECOVERY_TABLE_MISSING:digitization_output_writes');
 const beforeCameras=readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}),5);expect(beforeCameras.tables).toHaveLength(46);expect(beforeCameras.tables.map((table:any)=>table.table)).not.toContain('digitization_camera_inputs');
 const proof=(version:number)=>readDigitizationDatabaseProof(sql=>sql.includes('to_regclass')?'t':JSON.stringify({table:sql.match(/'table','([a-z_]+)'/)![1],count:'0',digest:'a'.repeat(64)}),version);
 expect(proof(6).tables).toHaveLength(47);expect(proof(6).tables.map((t:any)=>t.table)).not.toContain('digitization_training_inputs');
 expect(proof(7).tables).toHaveLength(48);expect(proof(7).tables.map((t:any)=>t.table)).toContain('digitization_training_inputs');
 queried.length=0;
 expect(()=>readDigitizationDatabaseProof(runSql,8)).toThrow('DIGITIZATION_RECOVERY_PROOF_VERSION_UNSUPPORTED');expect(queried).toEqual([]);
});
function restoredConfig(){return {services:{api:{networks:{private:null,processing:null}},'processing-cpu':{image,environment:{...configuration,PROCESSING_EXECUTION_ROOT:'/jobs'},networks:{processing:null},volumes:[{type:'volume',source:'processing-executions',target:'/jobs'}],depends_on:{'processing-volume-init':{condition:'service_completed_successfully'}}},'processing-volume-init':{}},volumes:{'processing-executions':{}},networks:{private:{external:true},gateway:{}}};}
it('isolated recovery skips overlapping Docker and host subnets without pruning shared networks',()=>{
 expect(availableRecoverySubnet(['default','0.0.0.0/1','128.0.0.0/1','172.16.0.0/12','10.247.200.0/24','10.247.201.8/32'])).toBe('10.247.201.16/28');
 expect(()=>availableRecoverySubnet(['10.247.0.0/16'])).toThrow('ISOLATED_RECOVERY_SUBNET_UNAVAILABLE');
});
it('runner recovery binds the owned image, named volume and allowlisted configuration, excluding signing keys',()=>{
 const container={Image:image,Config:{Labels:{'com.docker.compose.project':'haven-test','com.docker.compose.service':'processing-cpu'},Env:[...Object.entries(configuration).map(([key,value])=>key+'='+value),'PROCESSING_EXECUTION_ROOT=/jobs','PROCESSING_SIGNING_KEY_FILE=/run/protected-key','PRIVATE_SECRET=do-not-serialize']},Mounts:[{Type:'volume',Destination:'/jobs',Name:'haven-test-processing-executions'}]};
 expect(JSON.stringify(processingScope(container,'haven-test'))).not.toMatch(/protected-key|PRIVATE_SECRET|do-not-serialize/);
 expect(()=>processingScope(container,'another-project')).toThrow('OWNED_PROCESSING_IMAGE_REQUIRED');
 expect(()=>processingScope({...container,Mounts:[{Type:'tmpfs',Destination:'/jobs'}]},'haven-test')).toThrow('DURABLE_PROCESSING_VOLUME_REQUIRED');
 expect(()=>processingScope({...container,Mounts:[...container.Mounts,{Type:'bind',Destination:'/opt/processing',RW:false}]},'haven-test')).toThrow('PROCESSING_MUTABLE_RUNTIME_REFUSED');
 const configured=configureRestoredProcessing(restoredConfig(),[backup],()=>image);
 expect(configured.volumes['processing-executions']).toEqual({external:true,name:backup.volume});expect(configured.networks.processing).toEqual({internal:true});expect(configured.services['processing-volume-init']).toBeUndefined();expect(configured.services.api.networks.processing).toBeNull();
});
it('refuses absent backups, changed images/profiles and malformed restore volume identity',()=>{
 expect(()=>configureRestoredProcessing(restoredConfig(),[],()=>image)).toThrow('PROCESSING_BACKUP_CONFIGURATION_MISMATCH');
 expect(()=>configureRestoredProcessing(restoredConfig(),[backup],()=>'sha256:'+'b'.repeat(64))).toThrow('PROCESSING_RESTORE_IMAGE_MISMATCH');
 const changed=restoredConfig();changed.services['processing-cpu'].environment.PROCESSING_ENABLE_SIMULATOR='true';expect(()=>configureRestoredProcessing(changed,[backup],()=>image)).toThrow('PROCESSING_RESTORE_CONFIGURATION_MISMATCH');
 expect(()=>configureRestoredProcessing(restoredConfig(),[{...backup,volume:'unrelated-existing-volume'}],()=>image)).toThrow('PROCESSING_RESTORE_IMAGE_MISMATCH');
 expect(()=>digitizationTableProofSql('fact_candidates; SELECT private_secret')).toThrow('DIGITIZATION_RECOVERY_TABLE_INVALID');
});
it('authenticated recovery preserves durable bytes and tombstones, and refuses missing/corrupt runner data',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-runner-envelope-'));try{
  const source=path.join(root,'source'),target=path.join(source,backup.directory),jobs=path.join(target,'jobs');fs.mkdirSync(jobs,{recursive:true});fs.writeFileSync(path.join(jobs,'execution.db'),Buffer.alloc(4096,71));fs.writeFileSync(path.join(jobs,'deletion-tombstone.json'),'Authored software fixture; not a real execution');
  const proof=await processingFileProof(jobs);fs.writeFileSync(path.join(target,'proof.json'),JSON.stringify(proof));const metadata={...backup,fileCount:proof.fileCount,bytes:proof.bytes,digest:proof.digest};
  const rsa=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),sign=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  for(const [name,bytes] of Object.entries({'recovery.pub':rsa.publicKey,'recovery.key':rsa.privateKey,'sign.pub':sign.publicKey,'sign.key':sign.privateKey}))fs.writeFileSync(path.join(root,name),bytes,{mode:0o600});
  await encryptSnapshot(source,path.join(root,'encrypted'),path.join(root,'recovery.pub'),{processing:[metadata],requiredFiles:[backup.directory+'/proof.json']},path.join(root,'sign.key'));
  const recovered=path.join(root,'recovered');await decryptSnapshot(path.join(root,'encrypted'),recovered,path.join(root,'recovery.key'),path.join(root,'sign.pub'));expect(await verifyProcessingBackup(metadata,recovered)).toBe(path.join(recovered,backup.directory,'jobs'));
  const restoredFile=path.join(recovered,backup.directory,'jobs','execution.db');fs.writeFileSync(restoredFile,Buffer.alloc(4096,72));await expect(verifyProcessingBackup(metadata,recovered)).rejects.toThrow('PROCESSING_CAPTURE_RECONCILIATION_FAILED');fs.unlinkSync(restoredFile);await expect(verifyProcessingBackup(metadata,recovered)).rejects.toThrow('PROCESSING_CAPTURE_RECONCILIATION_FAILED');
  fs.symlinkSync(path.join(jobs,'execution.db'),path.join(recovered,backup.directory,'jobs','foreign-link'));await expect(verifyProcessingBackup(metadata,recovered)).rejects.toThrow('PROCESSING_CAPTURE_SPECIAL_FILE_REFUSED');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
