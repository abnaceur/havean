import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
// Render the intended immutable deployment using `docker compose config --format json`
// into a protected file first. It contains resolved secrets and must never be committed.
const {RECOVERY_DEPLOYMENT_CONFIG:input,RECOVERY_DATABASE_REPORT:reportFile,RECOVERY_APPLICATION_CONFIG:output}=process.env;
if(!input||!reportFile||!output)throw Error('Declare protected deployment config, successful database report and unused application output');
for(const file of [input,reportFile]){const s=fs.lstatSync(file);if(!s.isFile()||(s.mode&0o077))throw Error('RECOVERY_CONFIGURATION_MUST_BE_PRIVATE');}
if(fs.existsSync(output))throw Error('RECOVERY_APPLICATION_OUTPUT_ALREADY_EXISTS');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8')),c=JSON.parse(fs.readFileSync(input,'utf8'));
if(report.status!=='database-restored'||!report.authenticatedEnvelope)throw Error('AUTHENTICATED_DATABASE_RESTORE_REQUIRED');
const r=report.retained,inspect=JSON.parse(execFileSync('docker',['inspect',r.databaseContainer],{encoding:'utf8'}))[0];
if(!inspect.State.Running||!inspect.Config.Labels['com.haven.recovery']||!inspect.NetworkSettings.Networks[r.network])throw Error('OWNED_RUNNING_RECOVERY_DATABASE_REQUIRED');
for(const name of ['api','worker','web','ops'])if(!/^sha256:[a-f0-9]{64}$/.test(c.services?.[name]?.image||''))throw Error('IMMUTABLE_APPLICATION_IMAGES_REQUIRED');
c.name=process.env.RECOVERY_APPLICATION_PROJECT||'haven-recovery-app';if(!/^haven-[a-z0-9-]+$/.test(c.name))throw Error('OWNED_RECOVERY_PROJECT_REQUIRED');
if(execFileSync('docker',['ps','-aq','--filter','label=com.docker.compose.project='+c.name],{encoding:'utf8'}).trim())throw Error('RECOVERY_APPLICATION_PROJECT_ALREADY_EXISTS');
const address=process.env.RECOVERY_BIND_ADDRESS||'127.0.0.2';if(!/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)||address==='127.0.0.1'||address.split('.').some(n=>Number(n)>255))throw Error('ISOLATED_LOCAL_RECOVERY_BIND_REQUIRED');
for(const name of ['db','archive-init','migrate'])delete c.services[name];
for(const s of Object.values(c.services))if(s.depends_on)delete s.depends_on.db;
for(const p of c.services.proxy.ports||[])p.host_ip=address;
c.networks={private:{external:true,name:r.network},gateway:{}};
// Only the proxy joins the gateway network; recovered databases remain internal.
c.services.proxy.networks={private:null,gateway:null};
delete c.volumes.database;delete c.volumes['wal-archive'];
c.volumes.objects={external:true,name:r.objectsVolume};
for(const [name,v] of Object.entries(c.volumes))if(!v.external)v.name=c.name+'_'+name;
fs.writeFileSync(output,JSON.stringify(c,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({label:'P',status:'application-configuration-created',project:c.name,bind:address,databaseContainer:r.databaseContainer,applicationVerified:false}));
