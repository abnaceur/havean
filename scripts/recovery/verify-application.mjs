import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {configureRestoredProcessing} from './processing.mjs';
/** Disposable local application drill only. Production/off-host acceptance is
 * separate. No source database, account, object or service is mutated. */
export async function verifyRestoredApplication({root,prefix,databaseReport,databaseReportFile,runnerImage,runnerFixture,docker}){
 const project=prefix+'-app',folder=path.join(root,'application');fs.mkdirSync(folder,{mode:0o700});
 const config=JSON.parse(docker(['compose','--env-file','.env.integration','-p','haven-integration','-f','compose.yaml','-f','compose.integration.yaml','config','--format','json']));
 const input=path.join(folder,'deployment.json'),output=path.join(folder,'application.json'),fixtures=path.join(folder,'fixtures'),artifacts=path.join(folder,'evidence');fs.mkdirSync(fixtures,{mode:0o755});fs.mkdirSync(artifacts,{mode:0o755});
 for(const kind of ['structural','splat']){const name='model-publication-'+kind+'-desktop.json';fs.copyFileSync(path.join(root,'database-fixture','model-fixtures',name),path.join(fixtures,name));}
 const envFile=path.join(folder,'fixture.env');fs.copyFileSync('.env.integration',envFile);fs.chmodSync(envFile,0o600);
 const coordinator=randomBytes(32).toString('hex'),keyMount={type:'bind',source:path.join(runnerFixture,'runner-test-key'),target:'/run/runner-test-key',read_only:true};
 for(const name of ['db','install','migrate'])delete config.services[name];
 for(const [name,service] of Object.entries(config.services)){
  delete service.build;delete service.restart;delete service.profiles;
  if(name==='tests')continue;
  const original=JSON.parse(docker(['inspect','haven-integration-'+name+'-1']))[0];service.image=original.Image;
  if(['api','worker','web','ops'].includes(name)){
   service.image=JSON.parse(docker(['image','inspect','haven-recovery-'+name+':1.0.0-locked-registration-review']))[0].Id;
   service.volumes=[];service.environment={...service.environment,HAVEN_ENV_FILE:'/run/fixture.env',HAVEN_CONTAINER_TESTS:'true'};
   if(name==='api'||name==='worker')service.environment.DIGITIZATION_COORDINATOR_KEY=coordinator;
   if(name==='api'){service.environment.DIGITIZATION_CPU_RUNNER_ORIGIN='http://processing-cpu:8020';service.environment.DIGITIZATION_CPU_SIGNING_KEY_FILE=keyMount.target;service.volumes.push(keyMount,{type:'bind',source:envFile,target:'/run/fixture.env',read_only:true},{type:'bind',source:fixtures,target:'/workspace/infra/generated/integration'});service.networks={private:null,processing:null};}
  }else{
   for(const [index,volume] of (service.volumes??[]).entries())if(volume.type==='bind'){
    const saved=path.join(folder,name+'-configuration-'+index);fs.cpSync(volume.source,saved,{recursive:true});volume.source=saved;
   }
  }
  if(service.depends_on)for(const removed of ['db','install','migrate'])delete service.depends_on[removed];
  delete service.ports;
 }
 // Realm database, clients, users and credentials were restored. Its import
 // file is the protected captured configuration, never a new seed or reset.
 const realm=config.services.identity.volumes.find(volume=>volume.target==='/opt/keycloak/data/import/haven-realm.json');if(!realm)throw Error('RECOVERY_IDENTITY_IMPORT_MISSING');realm.source=path.join(root,'database-fixture','identity-realm.json');
 config.services.proxy.ports=[];
 const backup=databaseReport.retained.processing.find(backup=>backup.service==='processing-cpu');if(!backup||backup.image!==runnerImage)throw Error('RECOVERY_APPLICATION_RUNNER_MISMATCH');
 config.services['processing-cpu']={image:runnerImage,init:true,read_only:true,user:'10001:10001',cap_drop:['ALL'],security_opt:['no-new-privileges:true'],environment:{...backup.configuration,PROCESSING_EXECUTION_ROOT:'/jobs',PROCESSING_SIGNING_KEY_FILE:keyMount.target},command:['python','-m','property_processing.server'],volumes:[{type:'volume',source:'executions',target:'/jobs'},keyMount],tmpfs:['/tmp:size=67108864,mode=1777'],mem_limit:'512m',cpus:'1',pids_limit:64,networks:{processing:null}};
 config.volumes.executions={};configureRestoredProcessing(config,databaseReport.retained.processing,image=>image);
 const tests=JSON.parse(docker(['image','inspect','haven-recovery-browser:1.0.0-locked-registration-review']))[0].Id;
 config.services.tests={image:tests,init:true,user:String(process.getuid())+':'+String(process.getgid()),network_mode:'service:proxy',profiles:['tests'],environment:{...config.services.api.environment,HAVEN_ENV_FILE:'/run/fixture.env',HAVEN_RECOVERY_REHEARSAL:'true',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',PLAYWRIGHT_HTML_OUTPUT_DIR:'/workspace/playwright-report/run'},volumes:[{type:'bind',source:envFile,target:'/run/fixture.env',read_only:true},{type:'bind',source:fixtures,target:'/workspace/infra/generated/integration'},{type:'bind',source:artifacts,target:'/workspace/evidence'},{type:'bind',source:path.join(folder,'test-results'),target:'/workspace/test-results'},{type:'bind',source:path.join(folder,'playwright-report'),target:'/workspace/playwright-report'}]};
 // Remove unused development dependency volumes. All active cache/signature
 // volumes belong to this project; restored objects/executions remain owned by
 // the authenticated restore report and are removed by its scoped cleanup.
 const used=new Set(Object.values(config.services).flatMap(service=>(service.volumes??[]).filter(volume=>volume.type==='volume').map(volume=>volume.source)));
 for(const name of Object.keys(config.volumes))if(!used.has(name))delete config.volumes[name];
 for(const name of ['test-results','playwright-report'])fs.mkdirSync(path.join(folder,name),{mode:0o700});
 config.name=project;fs.writeFileSync(input,JSON.stringify(config)+'\n',{mode:0o600,flag:'wx'});
 const result=execFileSync(process.execPath,['scripts/recovery/application.mjs'],{encoding:'utf8',env:{...process.env,RECOVERY_DEPLOYMENT_CONFIG:input,RECOVERY_DATABASE_REPORT:databaseReportFile,RECOVERY_APPLICATION_CONFIG:output,RECOVERY_APPLICATION_PROJECT:project}});console.log(result.trim());
 const compose=args=>docker(['compose','-f',output,'--profile','tests',...args]);
 let started=false;
 try{
  started=true;compose(['create','scanner']);const scanner=compose(['ps','-aq','scanner']).trim(),signatures=path.join(folder,'signatures');docker(['cp','haven-integration-scanner-1:/var/lib/clamav',signatures]);docker(['cp',signatures+'/.',scanner+':/var/lib/clamav']);
  compose(['up','-d','--no-deps','cache','storage','identity','search','mail','scanner','processing-cpu']);
  compose(['up','-d','--no-deps','api','worker','web','ops','proxy']);
  const until=Date.now()+240000;
  for(;;){const rows=JSON.parse(docker(['inspect',...compose(['ps','-q']).trim().split('\n').filter(Boolean)]));const active=rows.filter(row=>['api','worker','web','ops','identity','scanner','storage'].includes(row.Config.Labels['com.docker.compose.service']));if(active.length===7&&active.every(row=>row.State.Running&&(!row.State.Health||row.State.Health.Status==='healthy')))break;if(Date.now()>until)throw Error('RESTORED_APPLICATION_NOT_READY');await new Promise(resolve=>setTimeout(resolve,1000));}
  for(const entry of ['digitization-operator-fixture.ts','digitization-unit-application-fixture.ts','digitization-capture-source-fixture.ts'])compose(['exec','-T','-e','TSX_TSCONFIG_PATH=apps/api/tsconfig.json','api','pnpm','exec','tsx','tests/support/'+entry]);
  console.log(compose(['run','--rm','--no-deps','tests','pnpm','exec','playwright','test','tests/e2e/digitization-operator-processing.spec.ts','tests/e2e/digitization-unit-application.spec.ts','--project=desktop','--output=/workspace/test-results/run','--max-failures=1']).trim());
  compose(['exec','-T','-e','TSX_TSCONFIG_PATH=apps/api/tsconfig.json','-e','DIGITIZATION_TOUR_INVENTORY_FIXTURE=true','-e','DIGITIZATION_RUNNER_TEST_ORIGIN=http://processing-cpu:8020','api','pnpm','exec','tsx','tests/support/digitization-tour-map-fixture.ts','desktop']);
  console.log(compose(['run','--rm','--no-deps','tests','pnpm','exec','playwright','test','tests/e2e/digitization-publication.spec.ts','--project=desktop','--output=/workspace/test-results/run','--max-failures=1']).trim());
  console.log(compose(['run','--rm','--no-deps','tests','pnpm','exec','playwright','test','tests/e2e/digitization-model-publication.spec.ts','--project=desktop','--output=/workspace/test-results/run','--max-failures=1']).trim());
  console.log(compose(['run','--rm','--no-deps','tests','pnpm','exec','playwright','test','tests/e2e/digitization-capture-source.spec.ts','--project=desktop','--output=/workspace/test-results/run','--max-failures=1']).trim());
  for(const name of ['capture-source-desktop.png','unit-application-desktop.png','published-tour-desktop.png','published-model-structural-desktop.png','published-model-splat-desktop.png']){const file=path.join(artifacts,'digitization',name);if(!fs.existsSync(file))throw Error('RESTORED_APPLICATION_SCREENSHOT_MISSING');fs.copyFileSync(file,path.join('evidence/digitization','recovery-'+name));}
  console.log(JSON.stringify({label:'P',status:'restored-local-application-workflows-passed',databaseRestored:true,identityLoginVerified:true,realSourceUpload:true,actualCpuQueueCollection:true,privateMultipartCapture:true,actualMediaFrameExtraction:true,sourceLinkedReview:true,independentInventoryApproval:true,independentPanoramaPublication:true,independentModelPublication:true,modelFamilies:['structural','splat'],physicalGpu:false,offHost:false,productionAcceptance:false}));
 }catch(error){
  // Preserve bounded diagnostics from this owned synthetic browser only.
  try{const target=path.join('evidence/digitization',prefix+'-failure');fs.mkdirSync(target,{recursive:true});const results=path.join(folder,'test-results','run');if(fs.existsSync(results))for(const entry of fs.readdirSync(results,{withFileTypes:true})){if(!entry.isDirectory())continue;for(const name of ['error-context.md','test-failed-1.png']){const file=path.join(results,entry.name,name);if(fs.existsSync(file)&&fs.statSync(file).size<=2*1024*1024)fs.copyFileSync(file,path.join(target,entry.name+'-'+name));}}const failures=[];for(const line of compose(['logs','--no-color','--tail','500','api']).split('\n')){const start=line.indexOf('{');if(start<0)continue;try{const event=JSON.parse(line.slice(start));if(event.event==='request.completed'&&event.status>=400&&/^\/api\/v1\/[a-zA-Z0-9/:._-]+$/.test(event.route))failures.push({method:event.method,route:event.route,status:event.status});}catch{/* Non-JSON log lines contain no safe diagnostic event. */}}fs.writeFileSync(path.join(target,'request-failures.json'),JSON.stringify(failures,null,2)+'\n');console.log(JSON.stringify({label:'P',status:'owned-synthetic-failure-diagnostics-retained',directory:target,requestFailures:failures.length}));}catch{/* Diagnostic copying must not replace the workflow error. */}
  try{const diagnostic=`const {createRequire}=require('node:module'),load=createRequire('/workspace/apps/worker/package.json'),{Queue}=load('bullmq'),url=new URL(process.env.REDIS_URL),queue=new Queue('digitization',{connection:{host:url.hostname,port:Number(url.port)||6379,maxRetriesPerRequest:null}});(async()=>{const jobs=await queue.getFailed(0,100),codes={};for(const job of jobs){const code=/^[A-Z_]{1,100}$/.test(job.failedReason)?job.failedReason:'UNCLASSIFIED_COMMAND_FAILURE';codes[code]=(codes[code]||0)+1;}console.log(JSON.stringify({label:'P',queueCounts:await queue.getJobCounts(),failureCodes:codes}));await queue.close();})().catch(()=>process.exitCode=1);`;console.log(compose(['exec','-T','worker','node','-e',diagnostic]).trim());}catch{/* Retain the original workflow failure even if diagnostics are unavailable. */}
  try{const diagnostic=`import {pool,transaction} from './packages/database/src/index.ts';const started=performance.now();try{const rows=await transaction({id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']},async c=>{await c.query('SET LOCAL statement_timeout=15000');return (await c.query('SELECT digitization_model_publication_review_queue() rows')).rows[0].rows.length;});console.log(JSON.stringify({label:'P',scopedModelQueueRows:rows,localDiagnosticMilliseconds:performance.now()-started,productionMeasurement:false}));}catch(error){console.log(JSON.stringify({label:'P',scopedModelQueueDiagnosticCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')?error.code:'SCOPED_QUEUE_DIAGNOSTIC_UNAVAILABLE',productionMeasurement:false}));}finally{await pool.end();}`;console.log(compose(['exec','-T','api','node','--import','tsx','--input-type=module','-e',diagnostic]).trim());}catch{/* Keep the workflow failure if its bounded scoped query diagnostic fails. */}
  throw error;
 }finally{if(started)compose(['down','--volumes','--remove-orphans']);}
}
