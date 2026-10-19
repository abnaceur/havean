import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'haven-recovery-images-'));fs.chmodSync(folder,0o700);
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
try{
 const original=JSON.parse(docker(['inspect','haven-integration-api-1']))[0],base=JSON.parse(docker(['image','inspect','haven-recovery-api:1.0.0-registration-review']))[0].Id;
 const name='haven-recovery-build-base:1.0.0-'+base.split(':')[1].slice(0,12);docker(['image','tag',base,name]);
 const mounts=original.Mounts.filter(mount=>mount.Type==='volume'&&mount.Destination.startsWith('/workspace/')&&mount.Destination.endsWith('/node_modules'));
 if(mounts.length!==10)throw Error('COMPLETE_LOCKED_WORKSPACE_DEPENDENCIES_REQUIRED');
 const sourceRoot=path.join(folder,'source');fs.mkdirSync(sourceRoot);const excluded=new Set(['node_modules','.next','dist','.cache','coverage']);
 for(const directory of ['apps','packages','tests'])fs.cpSync(directory,path.join(sourceRoot,directory),{recursive:true,filter:source=>!excluded.has(path.basename(source))&&!path.basename(source).startsWith('.env')&&!path.basename(source).startsWith('.next')&&!path.basename(source).startsWith('.turbo')&&!source.endsWith('.tsbuildinfo')&&!fs.lstatSync(source).isSymbolicLink()});
 for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.base.json','playwright.config.ts'])fs.copyFileSync(file,path.join(sourceRoot,file));
 // Explicit authored browser fixture; do not copy service deployment secrets,
 // investigation models or the rest of the processing service into app images.
 const mediaFixture='services/property-processing/tests/fixtures/media-frames-synthetic.json';fs.mkdirSync(path.dirname(path.join(sourceRoot,mediaFixture)),{recursive:true});fs.copyFileSync(mediaFixture,path.join(sourceRoot,mediaFixture));
 const recipe=['FROM '+name,'WORKDIR /workspace','COPY source/ /workspace/'];
 for(const relative of ['apps/worker/src/digitization/coordinator.ts','apps/worker/src/main.ts']){const target=path.join(folder,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(relative,target);recipe.push('COPY '+relative+' /workspace/'+relative);}
 for(const [index,mount] of mounts.entries()){
  const directory='dependencies-'+index,target=path.join(folder,directory),archive=path.join(folder,directory+'.tar');fs.mkdirSync(target);const transfer=spawn('docker',['exec','haven-integration-api-1','tar','--exclude=.cache','-C',path.dirname(mount.Destination),'-cf','-','node_modules'],{stdio:['ignore','pipe','pipe']}),exit=new Promise((resolve,reject)=>{transfer.once('error',reject);transfer.once('exit',resolve);});transfer.stderr.resume();await pipeline(transfer.stdout,fs.createWriteStream(archive,{flags:'wx',mode:0o600}));if(await exit!==0)throw Error('LOCKED_DEPENDENCY_TRANSFER_FAILED');execFileSync('tar',['--no-same-owner','--strip-components=1','-xf',archive,'-C',target],{stdio:'ignore'});fs.unlinkSync(archive);
  fs.rmSync(path.join(folder,directory,'.cache'),{recursive:true,force:true});recipe.push('RUN rm -rf '+mount.Destination,'COPY '+directory+'/ '+mount.Destination+'/');
 }
 const digest=createHash('sha256').update(fs.readFileSync('pnpm-lock.yaml')).digest('hex'),rootIndex=mounts.findIndex(mount=>mount.Destination==='/workspace/node_modules'),installedDigest=createHash('sha256').update(fs.readFileSync(path.join(folder,'dependencies-'+rootIndex,'.pnpm','lock.yaml'))).digest('hex');if(installedDigest!==digest)throw Error('INSTALLED_LOCKED_DEPENDENCIES_CHANGED');recipe.push('LABEL com.haven.recovery.fixture-lock-sha256='+digest);fs.writeFileSync(path.join(folder,'Dockerfile'),recipe.join('\n')+'\n');
 const browserBase=JSON.parse(docker(['image','inspect','haven-integration-tests']))[0].Id,browserName='haven-recovery-browser-base:1.0.0-'+browserBase.split(':')[1].slice(0,12);docker(['image','tag',browserBase,browserName]);
 fs.writeFileSync(path.join(folder,'Dockerfile.browser'),recipe.join('\n').replace('FROM '+name,'FROM '+browserName)+'\n');
 const config={name:'haven-recovery-image-build',services:Object.fromEntries(['api','worker','web','ops'].map(service=>[service,{image:'haven-recovery-'+service+':1.0.0-locked-registration-review',build:{context:folder,dockerfile:'Dockerfile',pull:false}}]))};config.services.browser={image:'haven-recovery-browser:1.0.0-locked-registration-review',build:{context:folder,dockerfile:'Dockerfile.browser',pull:false}};const file=path.join(folder,'compose.json');fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 // Serialize fixture exports after an observed missing-parent extraction
 // failure during a parallel build.
 for(const service of ['api','worker','web','ops','browser'])execFileSync('docker',['compose','-f',file,'build',service],{stdio:'inherit',env:{...process.env,BUILDX_BUILDER:'default'}});
 console.log(JSON.stringify({label:'P',status:'locked-local-fixture-images-built',lockSha256:digest,dependencyVolumes:mounts.length,installedLockSha256:installedDigest,registryDownload:false,productionImageAcceptance:false}));
}finally{fs.rmSync(folder,{recursive:true,force:true});}
