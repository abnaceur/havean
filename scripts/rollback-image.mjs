import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const input=process.env.ROLLBACK_DEPLOYMENT_CONFIG,manifestFile=process.env.ROLLBACK_COMPATIBILITY_FILE,output=process.env.ROLLBACK_REPORT_FILE;
if(!input||!manifestFile||!output)throw Error('Declare protected rendered deployment, reviewed compatibility manifest and unused rollback report');
const stat=fs.lstatSync(input);if(!stat.isFile()||(stat.mode&0o077))throw Error('ROLLBACK_DEPLOYMENT_MUST_BE_PRIVATE');
if(fs.existsSync(output))throw Error('ROLLBACK_REPORT_ALREADY_EXISTS');
const c=JSON.parse(fs.readFileSync(input,'utf8')),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),image=manifest.previousImage;
if(!/^haven-[a-z0-9-]+$/.test(c.name||'')||!/^sha256:[a-f0-9]{64}$/.test(image||'')||!manifest.review?.reason||!c.services?.migrate)throw Error('REVIEWED_IMMUTABLE_ROLLBACK_CONFIGURATION_REQUIRED');
const db=execFileSync('docker',['ps','-q','--filter','label=com.docker.compose.project='+c.name,'--filter','label=com.docker.compose.service=db'],{encoding:'utf8'}).trim().split('\n');if(db.length!==1||!db[0])throw Error('OWNED_RUNNING_ROLLBACK_DATABASE_REQUIRED');
const temp=fs.mkdtempSync(path.join(path.dirname(path.resolve(output)),'.haven-rollback-')),configFile=path.join(temp,'compose.json'),startedAt=new Date().toISOString();
try{
 c.services.migrate.volumes=[...(c.services.migrate.volumes||[]),{type:'bind',source:path.resolve(manifestFile),target:'/run/reviewed-schema.json',read_only:true}];
 c.services.migrate.environment={...c.services.migrate.environment,SCHEMA_COMPATIBILITY_FILE:'/run/reviewed-schema.json'};
 fs.writeFileSync(configFile,JSON.stringify(c),{mode:0o600});
 const command=['compose','-p',c.name,'-f',configFile,'--profile','maintenance'];
 let result;try{result=execFileSync('docker',[...command,'run','--rm','--no-deps','migrate','node','scripts/schema-preflight.mjs'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(error){const raw=String(error.stdout||'').trim().split('\n').find(l=>l.startsWith('{'));const refusal=raw?JSON.parse(raw):{status:'refused',action:'Inspect the native preflight service without resetting the database.'};fs.writeFileSync(output,JSON.stringify({label:'P',status:'refused',startedAt,image,schema:refusal,applicationChanged:false,databaseReset:false},null,2)+'\n',{mode:0o600,flag:'wx'});console.error(JSON.stringify({status:'refused',applicationChanged:false,schema:refusal}));process.exitCode=1;returnFromMain();}
 const schema=JSON.parse(result.trim().split('\n').find(l=>l.startsWith('{')));if(schema.status!=='compatible')throw Error('ROLLBACK_SCHEMA_PREFLIGHT_DID_NOT_PASS');
 const previousImage=c.services.api.image;c.services.api.image=image;fs.writeFileSync(configFile,JSON.stringify(c),{mode:0o600});execFileSync('docker',[...command,'up','-d','--no-deps','api'],{stdio:['ignore','ignore','pipe']});
 const id=execFileSync('docker',['compose','-p',c.name,'-f',configFile,'ps','-q','api'],{encoding:'utf8'}).trim();let healthy=false;for(let i=0;i<120;i++){const s=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];if(s.State.Health?.Status==='healthy'){healthy=true;break;}if(!s.State.Running)break;await new Promise(r=>setTimeout(r,500));}
 if(healthy){const managed=JSON.parse(fs.readFileSync(input,'utf8'));managed.services.api.image=image;fs.writeFileSync(input,JSON.stringify(managed,null,2)+'\n',{mode:0o600});}
 const report={label:'P',status:healthy?'rolled-back':'rollback-unhealthy',startedAt,completedAt:new Date().toISOString(),previousImage,image,schema,applicationChanged:true,databaseReset:false,scope:'Reviewed API image only; schema is retained. Continue the required financial and HTTPS smoke before accepting recovery.'};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));if(!healthy)process.exitCode=1;
}catch(error){if(error?.message!=='ROLLBACK_REFUSED_STOP')throw error;}finally{fs.rmSync(temp,{recursive:true,force:true});}
function returnFromMain(){throw Error('ROLLBACK_REFUSED_STOP');}
