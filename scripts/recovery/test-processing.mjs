import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {clearTimeout} from 'node:timers';
import {encryptSnapshot,decryptSnapshot} from './envelope.mjs';
import {captureProcessingVolume,restoreProcessingVolumes,configureRestoredProcessing,digitizationRecoveryTables} from './processing.mjs';
import {inspectRecoverySubnet} from './network.mjs';

const prefix='haven-recovery-'+randomUUID().slice(0,8),project=prefix+'-source',root=fs.mkdtempSync(path.join(os.tmpdir(),prefix+'-')),fixture=path.join(root,'fixture'),plaintext=path.join(root,'plaintext');
fs.chmodSync(root,0o755);fs.mkdirSync(fixture,{mode:0o770});fs.mkdirSync(plaintext,{mode:0o700});fs.writeFileSync(path.join(fixture,'runner-test-key'),'test-only-private-key-not-a-production-credential-0000',{mode:0o644});
const composeFile=path.resolve('services/property-processing/compose.recovery-tests.yaml'),env={...process.env,PROCESSING_RECOVERY_PROJECT:project,PROCESSING_RECOVERY_FIXTURE:fixture};
function docker(args,options={}){return execFileSync('docker',args,{encoding:'utf8',stdio:[options.input===undefined?'ignore':'pipe','pipe','pipe'],...options});}
const imageOverrideFile=path.join(root,'immutable-images.json'),composeFiles=['-f',composeFile,'-f',imageOverrideFile],imageOverrides={services:{}};
function saveImageOverrides(){for(const service of Object.values(imageOverrides.services))if(!/^sha256:[a-f0-9]{64}$/.test(service.image))throw Error('RECOVERY_TEST_IMMUTABLE_IMAGE_REQUIRED');fs.writeFileSync(imageOverrideFile,JSON.stringify(imageOverrides),{mode:0o600});}
function compose(args){return docker(['compose',...composeFiles,'--profile','client','--profile','restored',...args],{env});}
let processing,clientId,databaseReport;const databaseReportFile=path.join(root,'database-restore-report.json'),driftReportFile=path.join(root,'database-drift-report.json'),started=performance.now(),databaseDrill=process.argv.includes('--database')||process.argv.includes('--application'),applicationDrill=process.argv.includes('--application');
async function captureCommand(args,file){const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']}),exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});child.stderr.resume();await pipeline(child.stdout,fs.createWriteStream(file,{mode:0o600,flags:'wx'}));if(await exit!==0)throw Error('RECOVERY_TEST_SOURCE_CAPTURE_FAILED');}
async function fixtureSourceSnapshot(work){
 // Both existing test locks are needed: the composite retention case owns the
 // software lock, while individual runner/database cases own integration.
 const child=spawn('flock',['-n','/tmp/haven-digitization-software.lock','flock','-n','/tmp/haven-integration.lock',process.execPath,'-e',"process.stdout.write('ready\\n');process.stdin.resume();process.stdin.on('end',()=>process.exit(0));"],{stdio:['pipe','pipe','ignore']}),exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',()=>resolve(null));});
 child.stdin.on('error',()=>{});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('RECOVERY_FIXTURE_SOURCE_LOCK_TIMEOUT'));},10000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(Error('RECOVERY_FIXTURE_SOURCE_BUSY'));});child.stdout.once('data',chunk=>{clearTimeout(timer);if(String(chunk)==='ready\n')resolve();else reject(Error('RECOVERY_FIXTURE_SOURCE_LOCK_INVALID'));});});
  console.log(JSON.stringify({label:'P',status:'synthetic-source-snapshot-locked',sourceMutated:false}));
  return await work();
 }finally{child.stdin.end();await exited;}
}
function nodeCommand(script,extraEnv){return execFileSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,...extraEnv},maxBuffer:16*1024*1024});}
async function prepareDatabase(image){
 const privateFolder=path.join(root,'database-fixture');fs.mkdirSync(privateFolder,{mode:0o700});
 // Read-only synthetic isolated database clone. Original services/volumes stay running.
 for(const database of ['haven','haven_identity'])await captureCommand(['exec','haven-integration-db-1','sh','-c','pg_dump -U "$POSTGRES_USER" --create --format=plain '+database],path.join(privateFolder,database+'.sql'));
 env.PROCESSING_RECOVERY_DB_IMAGE=JSON.parse(docker(['inspect','haven-integration-db-1']))[0].Image;env.PROCESSING_RECOVERY_API_IMAGE=JSON.parse(docker(['inspect','haven-integration-api-1']))[0].Image;env.PROCESSING_RECOVERY_WORKER_IMAGE=JSON.parse(docker(['inspect','haven-integration-worker-1']))[0].Image;
 for(const [service,container] of Object.entries({db:'haven-integration-db-1',api:'haven-integration-api-1',worker:'haven-integration-worker-1',identity:'haven-integration-identity-1'}))imageOverrides.services[service]={image:JSON.parse(docker(['inspect',container]))[0].Image};saveImageOverrides();
 env.PROCESSING_RECOVERY_DB_SUBNET=inspectRecoverySubnet(docker,[...routesForHost(),env.PROCESSING_RECOVERY_SUBNET]);
 docker(['compose',...composeFiles,'--profile','database','up','-d','db'],{env});
 const db=compose(['ps','-q','db']).trim(),until=Date.now()+20000;
 for(;;){try{docker(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{/* TCP excludes the transient initdb socket-only server. */}if(Date.now()>until)throw Error('RECOVERY_TEST_DATABASE_NOT_READY');await new Promise(resolve=>setTimeout(resolve,100));}
 const roles=docker(['exec','haven-integration-db-1','sh','-c',`psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname<>'postgres';"`]).trim().split('\n').filter(Boolean);if(roles.some(role=>!/^[a-z_][a-z0-9_]{0,62}$/.test(role)))throw Error('RECOVERY_TEST_ROLE_INVALID');docker(['exec','-i',db,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:roles.map(role=>`CREATE ROLE "${role}" LOGIN;`).join('\n')});
 if(applicationDrill){const roleSecrets=docker(['exec','haven-integration-db-1','sh','-c',"psql -U \"$POSTGRES_USER\" -d postgres -Atc \"SELECT format('ALTER ROLE %I PASSWORD %L;',rolname,rolpassword) FROM pg_authid WHERE rolname IN('haven_app','haven_identity','haven_migrate');\""]);docker(['exec','-i',db,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:roleSecrets,stdio:['pipe','ignore','pipe']});}
 for(const database of ['haven','haven_identity'])docker(['exec','-i',db,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:fs.readFileSync(path.join(privateFolder,database+'.sql')),stdio:['pipe','ignore','pipe'],maxBuffer:16*1024*1024});
 // Logical fixture imports do not carry planner statistics. Refresh only the
 // owned clone before its physical snapshot; original databases remain untouched.
 for(const database of ['haven','haven_identity'])docker(['exec',db,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-c','ANALYZE'],{stdio:['ignore','ignore','pipe']});
 docker(['exec',db,'sh','-c','chown postgres:postgres /var/lib/postgresql/wal-archive && chmod 700 /var/lib/postgresql/wal-archive']);
 docker(['compose',...composeFiles,'--profile','database','create','api','worker','identity','storage'],{env});
 if(applicationDrill){
  const models=path.join(privateFolder,'model-fixtures');fs.mkdirSync(models,{mode:0o700});
  for(const kind of ['structural','splat']){const name='model-publication-'+kind+'-desktop.json',file=path.join('infra/generated/integration',name),content=fs.readFileSync(file);if(content.length>16384)throw Error('RECOVERY_MODEL_FIXTURE_BUDGET');const value=JSON.parse(content);for(const field of ['engineId','listingId','artifactId','sourceAssetId','geometryRevisionId','reviewId','approvalId'])if(!/^[a-f0-9-]{36}$/.test(value[field]??''))throw Error('RECOVERY_MODEL_FIXTURE_SCOPE_INVALID');fs.writeFileSync(path.join(models,name),content,{mode:0o600});}
  const original=JSON.parse(docker(['inspect','haven-integration-storage-1']))[0],credentials=path.join(privateFolder,'s3.json');fs.copyFileSync('infra/generated/integration/s3.json',credentials);fs.chmodSync(credentials,0o640);
  imageOverrides.services.storage={image:original.Image,command:original.Config.Cmd.map(arg=>arg==='-ip=storage'?'-ip='+project+'-storage-1':arg),volumes:[{type:'volume',source:'objects',target:'/data'},{type:'bind',source:credentials,target:'/etc/seaweedfs/s3.json',read_only:true}]};saveImageOverrides();
  docker(['compose',...composeFiles,'--profile','database','up','-d','--no-deps','storage'],{env});
  const target=compose(['ps','-q','storage']).trim(),name=JSON.parse(docker(['inspect',target]))[0].Name.slice(1),originalNetwork=Object.keys(original.NetworkSettings.Networks)[0];docker(['network','connect',originalNetwork,target]);
  try{const endpoint='http://'+name+':8333',until=Date.now()+30000;for(;;){try{docker(['exec','haven-integration-api-1','node','-e',"fetch(process.argv[1]).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))",endpoint]);break;}catch{/* Wait for the isolated S3 service within this deadline. */}if(Date.now()>until)throw Error('RECOVERY_FIXTURE_STORAGE_NOT_READY');await new Promise(resolve=>setTimeout(resolve,250));}
   console.log(docker(['exec','-e','HAVEN_CONTAINER_TESTS=true','-e','RECOVERY_FIXTURE_STORAGE_ENDPOINT='+endpoint,'haven-integration-api-1','node','scripts/recovery/copy-fixture-objects.mjs']).trim());
  }finally{docker(['network','disconnect',originalNetwork,target]);docker(['stop',target]);}
 }
 const storage=compose(['ps','-aq','storage']).trim();docker(['cp',path.join(fixture,'actual-source-preview.png'),storage+':/data/actual-source-preview.png']);
 // The realm config is protected and is encrypted; no secrets enter the report.
 fs.copyFileSync('infra/generated/integration/haven-realm.json',path.join(privateFolder,'identity-realm.json'));fs.chmodSync(path.join(privateFolder,'identity-realm.json'),0o600);
 return {identityFile:path.join(privateFolder,'identity-realm.json'),image};
}
// Production failures retain labelled resources for diagnosis. The disposable
// drill owns these reports and removes only resources carrying their exact label.
function cleanupReportedRecovery(report){
 const recoveredPrefix=report.retained.prefix??report.retained.network.replace(/-private$/,'');if(!/^haven-recovery-[a-z0-9-]+$/.test(recoveredPrefix))throw Error('RECOVERY_TEST_CLEANUP_SCOPE_INVALID');
 for(const [kind,list,remove] of [['container',['ps','-aq'],['rm','-f']],['network',['network','ls','-q'],['network','rm']],['volume',['volume','ls','-q'],['volume','rm']]]){
  const ids=docker([...list,'--filter','label=com.haven.recovery='+recoveredPrefix]).trim().split('\n').filter(Boolean);
  for(const id of ids)docker([...remove,id]);
  if(docker([...list,'--filter','label=com.haven.recovery='+recoveredPrefix]).trim())throw Error('RECOVERY_TEST_'+kind.toUpperCase()+'_CLEANUP_INCOMPLETE');
 }
}
function routesForHost(){return JSON.parse(execFileSync('ip',['-j','route','show'],{encoding:'utf8'})).map(route=>route.dst);}
try{
 const routes=routesForHost();
 env.PROCESSING_RECOVERY_SUBNET=inspectRecoverySubnet(docker,routes);
 const image=JSON.parse(docker(['image','inspect','haven-processing-cpu:1.0.0-cpu-v4']))[0].Id;
 for(const service of ['processing-cpu','restored-cpu','client'])imageOverrides.services[service]={image};saveImageOverrides();
 compose(['run','--rm','--no-deps','client','python','/fixture-test.py','prepare']);compose(['up','-d','processing-cpu']);
 clientId=compose(['run','-d','--no-deps','client','python','/fixture-test.py','interrupt']).trim();
 const sourceId=compose(['ps','-q','processing-cpu']).trim(),until=Date.now()+12000;let interrupted=false;
 for(;;){
  if(fs.existsSync(path.join(fixture,'partial-ready'))){const execution=fs.readFileSync(path.join(fixture,'partial-ready'),'utf8').trim();if(!/^[a-f0-9-]{36}$/.test(execution))throw Error('RECOVERY_TEST_EXECUTION_INVALID');try{docker(['exec',sourceId,'test','-f','/jobs/'+execution+'/source.partial']);interrupted=true;break;}catch{/* Wait only within the explicit deadline for the real partial file. */}}
  if(Date.now()>until)throw Error('RECOVERY_TEST_PARTIAL_TRANSFER_NOT_OBSERVED');await new Promise(resolve=>setTimeout(resolve,50));
 }
 docker(['kill',sourceId]);
 const container=JSON.parse(docker(['inspect',sourceId]))[0];let backup;
 const rsa=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),signing=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 for(const [name,value] of Object.entries({'recovery.pub':rsa.publicKey,'recovery.key':rsa.privateKey,'signing.pub':signing.publicKey,'signing.key':signing.privateKey}))fs.writeFileSync(path.join(root,name),value,{mode:0o600});
 if(databaseDrill){const database=await fixtureSourceSnapshot(()=>prepareDatabase(image));nodeCommand('scripts/recovery/snapshot.mjs',{RECOVERY_PROJECT:project,RECOVERY_ENCRYPTED_OUTPUT:path.join(root,'encrypted'),RECOVERY_PUBLIC_KEY:path.join(root,'recovery.pub'),RECOVERY_SIGNING_PRIVATE_KEY:path.join(root,'signing.key'),RECOVERY_IDENTITY_IMPORT_FILE:database.identityFile,HAVEN_RECOVERY_LOCAL_DRILL:'true'});}
 else{backup=await captureProcessingVolume(container,project,plaintext,docker);await encryptSnapshot(plaintext,path.join(root,'encrypted'),path.join(root,'recovery.pub'),{label:'P',processing:[backup],requiredFiles:[backup.directory+'/proof.json']},path.join(root,'signing.key'));}
 const damaged=path.join(root,'damaged');fs.cpSync(path.join(root,'encrypted'),damaged,{recursive:true});const ciphertext=path.join(damaged,fs.readdirSync(damaged).find(name=>name.endsWith('.bin')&&fs.statSync(path.join(damaged,name)).size>0)),bytes=fs.readFileSync(ciphertext);bytes[0]^=1;fs.writeFileSync(ciphertext,bytes);let tamperRejected=false;try{await decryptSnapshot(damaged,path.join(root,'refused'),path.join(root,'recovery.key'),path.join(root,'signing.pub'));}catch(error){if(error.message!=='RECOVERY_CIPHERTEXT_MISMATCH')throw error;tamperRejected=true;}if(!tamperRejected||fs.existsSync(path.join(root,'refused')))throw Error('RECOVERY_TEST_TAMPER_ACCEPTED');
 const restored=path.join(root,'restored');const decoded=await decryptSnapshot(path.join(root,'encrypted'),restored,path.join(root,'recovery.key'),path.join(root,'signing.pub'));
 backup=decoded.metadata.processing[0];
 let databaseDriftRejected=false;
 if(databaseDrill){
  const drift=path.join(root,'database-drift-plaintext');fs.cpSync(restored,drift,{recursive:true});const proofFile=path.join(drift,'database/digitization-proof.json'),proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));if(proof.schemaVersion!==7||JSON.stringify(proof.tables.map(table=>table.table))!==JSON.stringify(digitizationRecoveryTables))throw Error('RECOVERY_TEST_DIGITIZATION_PROOF_INCOMPLETE');const writer=proof.tables.find(table=>table.table==='digitization_output_writes');writer.digest='0'.repeat(64);fs.writeFileSync(proofFile,JSON.stringify(proof)+'\n',{mode:0o600});
  // Authored test with a trusted signer: authenticated files still cannot pass
  // when the recorded workflow digest disagrees with the native restored DB.
  await encryptSnapshot(drift,path.join(root,'database-drift-encrypted'),path.join(root,'recovery.pub'),decoded.metadata,path.join(root,'signing.key'));
  try{nodeCommand('scripts/recovery/restore.mjs',{RECOVERY_ENCRYPTED_INPUT:path.join(root,'database-drift-encrypted'),RECOVERY_PRIVATE_KEY:path.join(root,'recovery.key'),RECOVERY_SIGNING_PUBLIC_KEY:path.join(root,'signing.pub'),RECOVERY_REPORT_FILE:driftReportFile});}catch{databaseDriftRejected=true;}
  const refused=JSON.parse(fs.readFileSync(driftReportFile,'utf8'));if(!databaseDriftRejected||refused.code!=='RESTORED_DIGITIZATION_RECONCILIATION_FAILED'||refused.status!=='failed'||refused.applicationVerified!==false)throw Error('RECOVERY_TEST_DATABASE_DRIFT_ACCEPTED');cleanupReportedRecovery(refused);
 }

 if(databaseDrill){const reportFile=databaseReportFile;nodeCommand('scripts/recovery/restore.mjs',{RECOVERY_ENCRYPTED_INPUT:path.join(root,'encrypted'),RECOVERY_PRIVATE_KEY:path.join(root,'recovery.key'),RECOVERY_SIGNING_PUBLIC_KEY:path.join(root,'signing.pub'),RECOVERY_REPORT_FILE:reportFile});databaseReport=JSON.parse(fs.readFileSync(reportFile,'utf8'));processing=databaseReport.retained.processing;if(databaseReport.status!=='database-restored'||databaseReport.digitizationReconciled?.schemaVersion!==7||JSON.stringify(databaseReport.digitizationReconciled.tables.map(table=>table.table))!==JSON.stringify(digitizationRecoveryTables))throw Error('RECOVERY_TEST_DATABASE_RECONCILIATION_FAILED');
  const restoredObjects=path.join(root,'restored-object-check');fs.mkdirSync(restoredObjects,{mode:0o700});const helper=prefix+'-object-check';docker(['create','--name',helper,'--label','com.haven.recovery='+prefix,'--network','none','-v',databaseReport.retained.objectsVolume+':/objects:ro','--entrypoint','sh',env.PROCESSING_RECOVERY_DB_IMAGE,'-c','true']);try{docker(['cp',helper+':/objects/actual-source-preview.png',path.join(restoredObjects,'preview.png')]);if(!fs.readFileSync(path.join(restoredObjects,'preview.png')).equals(fs.readFileSync(path.join(fixture,'actual-source-preview.png'))))throw Error('RECOVERY_TEST_OBJECT_BYTES_MISMATCH');}finally{docker(['rm',helper]);}
 }else processing=await restoreProcessingVolumes(decoded.metadata.processing,restored,prefix,image,docker);
 env.PROCESSING_RESTORED_VOLUME=processing[0].volume;
 // Check the same production application configuration fence used by recovery.
 const config={services:{'processing-cpu':{image,environment:{...backup.configuration,PROCESSING_EXECUTION_ROOT:'/jobs'},volumes:[{type:'volume',source:'executions',target:'/jobs'}]}},volumes:{executions:{}},networks:{}};
 configureRestoredProcessing(config,processing,()=>image);
 compose(['up','-d','--no-deps','restored-cpu']);const result=compose(['run','--rm','--no-deps','client','python','/fixture-test.py','verify']);
 if(applicationDrill){const {verifyRestoredApplication}=await import('./verify-application.mjs');await verifyRestoredApplication({root,prefix,databaseReport,databaseReportFile,runnerImage:image,runnerFixture:fixture,docker});}
 console.log(result.trim());console.log(JSON.stringify({label:'P',status:applicationDrill?'local-application-workflow-recovery-passed':databaseDrill?'database-objects-runner-recovery-passed':'runner-volume-recovery-passed',elapsedMilliseconds:performance.now()-started,interrupted,authenticatedEnvelope:true,tamperRejected,fileCount:backup.fileCount,bytes:backup.bytes,image,physicalGpu:false,platformDatabaseRestore:databaseDrill,databaseDriftRejected,digitizationTablesReconciled:databaseReport?.digitizationReconciled?.tables.length??0,applicationVerified:applicationDrill,offHost:false}));
}finally{
 let cleanupFailed=false;
 if(clientId)try{docker(['rm','-f',clientId]);}catch{cleanupFailed=true;}
 try{docker(['compose',...composeFiles,'--profile','client','--profile','restored','--profile','database','down','--volumes','--remove-orphans'],{env});}catch{cleanupFailed=true;}
 try{
  if(!databaseReport&&fs.existsSync(databaseReportFile))databaseReport=JSON.parse(fs.readFileSync(databaseReportFile,'utf8'));
  if(databaseReport)cleanupReportedRecovery(databaseReport);
  if(fs.existsSync(driftReportFile))cleanupReportedRecovery(JSON.parse(fs.readFileSync(driftReportFile,'utf8')));
 }catch{cleanupFailed=true;}
 // Includes volumes created before a failed reconciliation returned descriptors.
 try{for(const volume of docker(['volume','ls','--filter','label=com.haven.recovery='+prefix,'--format','{{.Name}}']).trim().split('\n').filter(Boolean))docker(['volume','rm',volume]);}catch{cleanupFailed=true;}
 try{fs.rmSync(root,{recursive:true,force:true});}catch(error){if(error.code!=='EACCES'||!root.startsWith(path.join(os.tmpdir(),prefix+'-'))){cleanupFailed=true;console.error('RECOVERY_TEST_PRIVATE_FOLDER_CLEANUP_FAILED');}else{const cleanupImage=JSON.parse(docker(['inspect','haven-integration-api-1']))[0].Image;docker(['run','--rm','--network','none','--read-only','--memory','128m','--pids-limit','32','--user','0:0','--mount','type=bind,source='+root+',target=/owned-fixture','--entrypoint','node',cleanupImage,'-e',"const fs=require('node:fs');for(const name of fs.readdirSync('/owned-fixture'))fs.rmSync('/owned-fixture/'+name,{recursive:true,force:true});"]);fs.rmSync(root,{recursive:true,force:true});}}
 if(cleanupFailed){console.error('RECOVERY_TEST_CLEANUP_INCOMPLETE');process.exitCode=1;}
}
