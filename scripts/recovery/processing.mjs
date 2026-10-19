import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checksum,safeRelative} from './envelope.mjs';

export const processingServices=['processing-cpu','processing-gpu'];
const settings=['PROCESSING_DEPLOYMENT','PROCESSING_ADAPTER','PROCESSING_ENABLE_SIMULATOR','PROCESSING_ENABLE_MEDIA_PROBE','PROCESSING_ENABLE_OCR_INVESTIGATION','PROCESSING_ENABLE_CAMERA_INVESTIGATION','PROCESSING_ENABLE_GSPLAT_INVESTIGATION','PROCESSING_RUNNER_KIND','PROCESSING_ENABLE_OCR','PROCESSING_OCR_RELEASE_SHA256'];
export function processingScope(container,project){
 const service=container.Config?.Labels?.['com.docker.compose.service'];
 if(!processingServices.includes(service)||container.Config.Labels['com.docker.compose.project']!==project||!/^sha256:[a-f0-9]{64}$/.test(container.Image??''))throw Error('OWNED_PROCESSING_IMAGE_REQUIRED');
 const env=new Map();for(const item of container.Config.Env??[]){const index=item.indexOf('=');const key=item.slice(0,index);if(env.has(key))throw Error('PROCESSING_CONFIGURATION_AMBIGUOUS');env.set(key,item.slice(index+1));}
 if(env.get('PROCESSING_EXECUTION_ROOT')!=='/jobs')throw Error('PROCESSING_EXECUTION_ROOT_UNSUPPORTED');
 const mounts=(container.Mounts??[]).filter(m=>m.Destination==='/jobs');
 if(mounts.length!==1||mounts[0].Type!=='volume'||!mounts[0].Name)throw Error('DURABLE_PROCESSING_VOLUME_REQUIRED');
 if((container.Mounts??[]).some(m=>m.Destination!=='/jobs'&&m.Type!=='tmpfs'&&!(m.Type==='bind'&&m.Destination===env.get('PROCESSING_SIGNING_KEY_FILE')&&m.RW===false)))throw Error('PROCESSING_MUTABLE_RUNTIME_REFUSED');
 const configuration=Object.fromEntries(settings.filter(key=>env.has(key)).map(key=>[key,env.get(key)]));
 if(Object.values(configuration).some(value=>typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value)))throw Error('PROCESSING_CONFIGURATION_UNSUPPORTED');
 return {service,image:container.Image,sourceVolume:mounts[0].Name,configuration,executionRoot:'/jobs',executionStoreVersion:1};
}

/** Source filenames and hashes stay inside the encrypted envelope. Reports
 * expose only counts and the manifest digest, never execution/source text. */
export async function processingFileProof(directory){
 if(!fs.lstatSync(directory).isDirectory())throw Error('PROCESSING_CAPTURE_DIRECTORY_REQUIRED');
 const files=[];let bytes=0n;
 async function walk(folder){
  for(const item of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const file=path.join(folder,item.name),stat=fs.lstatSync(file);
   if(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile())throw Error('PROCESSING_CAPTURE_SPECIAL_FILE_REFUSED');
   if(stat.isDirectory())await walk(file);
   else{const name=safeRelative(path.relative(directory,file).split(path.sep).join('/')),size=fs.statSync(file,{bigint:true}).size;bytes+=size;files.push({name,bytes:size.toString(),sha256:await checksum(file)});}
  }
 }
 await walk(directory);return {schemaVersion:1,fileCount:files.length,bytes:bytes.toString(),digest:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
export function validateProcessingBackup(value){
 if(!value||!processingServices.includes(value.service)||!/^sha256:[a-f0-9]{64}$/.test(value.image??'')||value.executionRoot!=='/jobs'||value.executionStoreVersion!==1||value.directory!==`processing/${value.service}`||!value.configuration||Object.keys(value.configuration).some(key=>!settings.includes(key))||Object.values(value.configuration).some(v=>typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(v)))throw Error('PROCESSING_BACKUP_METADATA_INVALID');
 return value;
}
export async function captureProcessingVolume(container,project,plaintext,docker){
 const scope=processingScope(container,project),current=JSON.parse(docker(['inspect',container.Id]))[0];
 if(current.State.Running||JSON.stringify(processingScope(current,project))!==JSON.stringify(scope))throw Error('PROCESSING_CAPTURE_REQUIRES_STOPPED_RUNNER');
 const directory=`processing/${scope.service}`,target=path.join(plaintext,directory);fs.mkdirSync(target,{recursive:true,mode:0o700});
 docker(['cp',container.Id+':/jobs',path.join(target,'jobs')]);
 const proof=await processingFileProof(path.join(target,'jobs'));fs.writeFileSync(path.join(target,'proof.json'),JSON.stringify(proof)+'\n',{mode:0o600,flag:'wx'});
 const {sourceVolume:_,...metadata}=scope;return {...metadata,directory,fileCount:proof.fileCount,bytes:proof.bytes,digest:proof.digest};
}
export async function verifyProcessingBackup(value,plaintext){
 validateProcessingBackup(value);const target=path.join(plaintext,value.directory),proof=JSON.parse(fs.readFileSync(path.join(target,'proof.json'),'utf8'));
 if(proof.schemaVersion!==1||proof.fileCount!==value.fileCount||proof.bytes!==value.bytes||proof.digest!==value.digest||!Array.isArray(proof.files)||proof.files.length!==proof.fileCount)throw Error('PROCESSING_CAPTURE_PROOF_INVALID');
 const jobs=path.join(target,'jobs');if(proof.fileCount===0&&!fs.existsSync(jobs))fs.mkdirSync(jobs,{mode:0o700});
 if(JSON.stringify(await processingFileProof(jobs))!==JSON.stringify(proof))throw Error('PROCESSING_CAPTURE_RECONCILIATION_FAILED');return jobs;
}
export async function restoreProcessingVolumes(backups,plaintext,prefix,image,docker){
 if(!Array.isArray(backups)||new Set(backups.map(v=>v.service)).size!==backups.length)throw Error('PROCESSING_BACKUP_METADATA_INVALID');
 if(!/^haven-recovery-[a-z0-9-]+$/.test(prefix)||!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('PROCESSING_RESTORE_SCOPE_INVALID');
 // Validate every runner before creating any volume.
 const sources=[];for(const backup of backups)sources.push(await verifyProcessingBackup(backup,plaintext));
 const restored=[];
 for(const [index,backup] of backups.entries()){
  const volume=prefix+'-'+backup.service;if(docker(['volume','ls','--filter','name=^'+volume+'$','--format','{{.Name}}']).trim())throw Error('RESTORE_VOLUME_ALREADY_EXISTS');
  docker(['volume','create','--label','com.haven.recovery='+prefix,volume]);
  const source=sources[index];if(source.includes(','))throw Error('RECOVERY_BIND_PATH_COMMA_REFUSED');
  docker(['run','--rm','--network','none','--user','0:0','--security-opt','no-new-privileges:true','--mount','type=bind,src='+source+',dst=/backup,readonly','--mount','type=volume,src='+volume+',dst=/restore','--entrypoint','sh',image,'-c','cp -a /backup/. /restore/ && chown -R 10001:10001 /restore && find /restore -type d -exec chmod 700 {} + && find /restore -type f -exec chmod 600 {} +']);
  // Check the copied volume before exposing it to a runner.
  const verify=path.join(plaintext,backup.directory,'restored-check');fs.mkdirSync(verify,{mode:0o700});
  const helper=prefix+'-'+backup.service+'-verify';
  docker(['create','--name',helper,'--label','com.haven.recovery='+prefix,'--network','none','--mount','type=volume,src='+volume+',dst=/jobs,readonly','--entrypoint','sh',image,'-c','true']);
  try{docker(['cp',helper+':/jobs',path.join(verify,'jobs')]);if(JSON.stringify(await processingFileProof(path.join(verify,'jobs')))!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(plaintext,backup.directory,'proof.json'),'utf8'))))throw Error('PROCESSING_RESTORED_VOLUME_MISMATCH');}finally{docker(['rm',helper]);fs.rmSync(verify,{recursive:true,force:true});}
  restored.push({...backup,volume});
 }
 return restored;
}

// Version 1 remains immutable: older signed envelopes must reconcile against
// their original coverage rather than silently acquire a different contract.
const legacyDigitizationRecoveryTables=['property_digitizations','property_input_revisions','digitization_asset_bindings','document_pages','fact_candidates','fact_decisions','geometry_revisions','processing_runs','processing_stages','stage_attempts','artifacts','tour_revisions','approval_records','published_packages','digitization_publication_proposals','digitization_deletion_jobs','digitization_scene_privacy_declarations','outbox','outbox_effects'];
const version2DigitizationRecoveryTables=[...legacyDigitizationRecoveryTables,
 'digitization_evidence_grants','capture_sessions','processing_stage_dependencies','digitization_events',
 'digitization_capture_uploads','digitization_capture_receipts','digitization_input_slots',
 'digitization_trace_checkpoints','digitization_gpu_slots','digitization_input_changes',
 'digitization_approval_invalidations','digitization_capture_cleanup_jobs','inventory_unit_fact_versions',
 'digitization_inventory_applications','digitization_frame_datasets','digitization_tour_review_requests',
 'digitization_frame_privacy_recipes','digitization_intake_draft_links','digitization_scene_registrations',
 'digitization_stage_outcomes','digitization_public_package_bindings','digitization_package_revocations','idempotency'];
const version3DigitizationRecoveryTables=[...version2DigitizationRecoveryTables,'digitization_model_review_requests','digitization_model_publication_proposals'];
const version4DigitizationRecoveryTables=[...version3DigitizationRecoveryTables,'digitization_tenant_deletions'];
const version5DigitizationRecoveryTables=[...version4DigitizationRecoveryTables,'digitization_output_writes'];
const version6DigitizationRecoveryTables=[...version5DigitizationRecoveryTables,'digitization_camera_inputs'];
export const digitizationRecoveryTables=[...version6DigitizationRecoveryTables,'digitization_training_inputs'];
export function digitizationTableProofSql(table){
 if(!digitizationRecoveryTables.includes(table))throw Error('DIGITIZATION_RECOVERY_TABLE_INVALID');
 return `SELECT json_build_object('table','${table}','count',count(*)::text,'digest',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex')) FROM ${table} t;`;
}
export function readDigitizationDatabaseProof(runSql,schemaVersion=7){
 if(schemaVersion!==1&&schemaVersion!==2&&schemaVersion!==3&&schemaVersion!==4&&schemaVersion!==5&&schemaVersion!==6&&schemaVersion!==7)throw Error('DIGITIZATION_RECOVERY_PROOF_VERSION_UNSUPPORTED');
 const tables=[];for(const table of schemaVersion===1?legacyDigitizationRecoveryTables:schemaVersion===2?version2DigitizationRecoveryTables:schemaVersion===3?version3DigitizationRecoveryTables:schemaVersion===4?version4DigitizationRecoveryTables:schemaVersion===5?version5DigitizationRecoveryTables:schemaVersion===6?version6DigitizationRecoveryTables:digitizationRecoveryTables){
  if(runSql(`SELECT to_regclass('public.${table}') IS NOT NULL;`).trim()==='t')tables.push(JSON.parse(runSql(digitizationTableProofSql(table))));
  else if(schemaVersion>=2)throw Error('DIGITIZATION_RECOVERY_TABLE_MISSING:'+table);
 }
 return {schemaVersion,tables};
}
export function configureRestoredProcessing(config,restored,imageId){
 const backups=restored??[];if(!Array.isArray(backups)||new Set(backups.map(v=>v.service)).size!==backups.length)throw Error('PROCESSING_BACKUP_METADATA_INVALID');
 for(const backup of backups)validateProcessingBackup(backup);
 const configured=processingServices.filter(service=>config.services?.[service]);
 if(backups.length!==configured.length||backups.some(backup=>!configured.includes(backup.service)))throw Error('PROCESSING_BACKUP_CONFIGURATION_MISMATCH');
 for(const service of configured){
  const backup=backups.find(v=>v.service===service),runner=config.services[service];
  if(imageId(runner.image)!==backup.image||!/^haven-recovery-[a-z0-9-]+$/.test(backup.volume??''))throw Error('PROCESSING_RESTORE_IMAGE_MISMATCH');
  const settingsNow=Object.fromEntries(settings.filter(key=>key in (runner.environment??{})).map(key=>[key,String(runner.environment[key])]));
  if(JSON.stringify(Object.entries(settingsNow).sort())!==JSON.stringify(Object.entries(backup.configuration).sort())||runner.environment?.PROCESSING_EXECUTION_ROOT!=='/jobs')throw Error('PROCESSING_RESTORE_CONFIGURATION_MISMATCH');
  const jobs=(runner.volumes??[]).filter(v=>v.target==='/jobs');if(jobs.length!==1||jobs[0].type!=='volume'||!jobs[0].source)throw Error('DURABLE_PROCESSING_VOLUME_REQUIRED');
  if((runner.volumes??[]).some(v=>v.target!=='/jobs'&&v.type!=='tmpfs'&&!(v.type==='bind'&&v.target===runner.environment?.PROCESSING_SIGNING_KEY_FILE&&v.read_only===true)))throw Error('PROCESSING_MUTABLE_RUNTIME_REFUSED');
  config.volumes[jobs[0].source]={external:true,name:backup.volume};runner.image=backup.image;runner.networks={processing:null};
 }
 if(configured.length){config.networks.processing={internal:true};delete config.services['processing-volume-init'];for(const runner of Object.values(config.services))if(runner.depends_on)delete runner.depends_on['processing-volume-init'];}
 return config;
}
