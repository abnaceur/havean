import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function validateProcessingLicenses(root=process.cwd()) {
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 const manifest=read('docs/adr/processing-dependencies.json'),images=read('docs/adr/images.json');
 if(manifest.schemaVersion!==1)throw Error('Unknown processing license manifest version');
 const hash=/^[a-f0-9]{64}$/;
 const names=new Set();
 const locks=path.join(root,'services/property-processing/locks');
 for(const filename of fs.readdirSync(locks).filter(name=>name.endsWith('.lock'))) {
  const lines=fs.readFileSync(path.join(locks,filename),'utf8').replace(/\\\r?\n/g,' ').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
  for(const line of lines) {
   const match=/^([a-z0-9-]+)==([0-9]+(?:\.[0-9]+)*(?:[a-z0-9.+-]*)?)((?:\s+--hash=sha256:[a-f0-9]{64})+)$/.exec(line);
   if(!match)throw Error(`Unpinned or unsupported processing lock entry: ${filename}`);
   const [,name,version,rest]=match,entry=manifest.python[name];
   if(!entry||entry.version!==version||!entry.license?.trim()||!entry.source?.startsWith('https://'))throw Error(`Missing processing license/version/source: ${name}`);
   if(!entry.artifacts?.length)throw Error(`Missing processing artifact: ${name}`);
   const pinned=[...rest.matchAll(/sha256:([a-f0-9]{64})/g)].map(m=>m[1]).sort();
   const declared=entry.artifacts.map(artifact=>{
    if(!hash.test(artifact.sha256)||!/^[A-Za-z0-9_.+-]+\.whl$/.test(artifact.filename||'')||!artifact.url?.startsWith('https://files.pythonhosted.org/'))throw Error(`Invalid processing artifact: ${name}`);
    return artifact.sha256;
   }).sort();
   if(JSON.stringify(pinned)!==JSON.stringify(declared))throw Error(`Processing wheel hashes differ: ${name}`);
   if(entry.bundledNative){
    const native=entry.bundledNative;
    if(!native.name||!native.version||!Array.isArray(native.flags)||!hash.test(native.binarySha256)||!native.binaryWheelPath||native.binaryWheelPath.split('/').includes('..')||!native.review||!native.notices?.length)throw Error(`Missing native processing license/build record: ${name}`);
    if(native.name==='pdfium'&&native.flags.length)throw Error('PDFium script/XFA builds are not approved');
    const noticePaths=new Set();
    for(const notice of native.notices){
     if(!notice.component||!notice.license||!hash.test(notice.sha256)||!notice.path||noticePaths.has(notice.path))throw Error(`Invalid native processing notice: ${name}`);
     noticePaths.add(notice.path);
     const file=path.resolve(root,notice.path),relative=path.relative(fs.realpathSync(root),fs.realpathSync(file));
     if(relative.startsWith('..')||path.isAbsolute(relative))throw Error(`Native notice escapes checkout: ${name}`);
     if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==notice.sha256)throw Error(`Native notice checksum mismatch: ${name}`);
    }
   }
   names.add(name);
  }
 }
 for(const name of Object.keys(manifest.python))if(!names.has(name))throw Error(`Processing dependency is absent from locks: ${name}`);
 for(const [id,model] of Object.entries(manifest.models)) {
  if(model.enabled===false){if(!model.reason)throw Error(`Disabled model needs reason: ${id}`);continue;}
  if(model.enabled!==true||!model.version||!model.license||!model.source?.startsWith('https://')||!hash.test(model.sha256)||!model.path)throw Error(`Model requires exact version/license/source/checksum: ${id}`);
  const file=path.resolve(root,model.path),relative=path.relative(fs.realpathSync(root),fs.realpathSync(file));
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error(`Model path escapes checkout: ${id}`);
  if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==model.sha256)throw Error(`Model checksum mismatch: ${id}`);
 }
 if(manifest.gpu.enabled){
  if(!fs.existsSync(path.join(locks,'gpu.lock')))throw Error('GPU requires an exact separate lock');
  for(const name of ['torch','gsplat'])if(!names.has(name))throw Error(`GPU dependency absent: ${name}`);
  if(!manifest.gpu.cudaVersion||!manifest.gpu.cudaLicenseSource?.startsWith('https://')||!manifest.gpu.compatibilityEvidence)throw Error('CUDA license/compatibility record required');
 }else if(manifest.gpu.enabled!==false||!manifest.gpu.reason)throw Error('GPU must be explicitly enabled or unavailable');
 function walk(directory){
  for(const item of fs.readdirSync(directory,{withFileTypes:true})){
   const file=path.join(directory,item.name);
   if(item.isDirectory())walk(file);
   else if(/\.ya?ml$/.test(item.name)){
    for(const match of fs.readFileSync(file,'utf8').matchAll(/^\s+image:\s+([^\s]+)\s*$/gm)){
     const image=match[1].replace(/^['"]|['"]$/g,'');
     if(!/@sha256:[a-f0-9]{64}$/.test(image)||!Object.values(images).includes(image))throw Error(`Unmanifested processing service image: ${image}`);
    }
   }
   else if(item.name.startsWith('Dockerfile')){
    const stages=new Set();
    for(const match of fs.readFileSync(file,'utf8').matchAll(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?\s*$/gim)){
     const image=match[1];
     if(!stages.has(image)&&(!/@sha256:[a-f0-9]{64}$/.test(image)||!Object.values(images).includes(image)))throw Error(`Unmanifested processing image: ${image}`);
     if(match[2])stages.add(match[2]);
    }
   }
  }
 }
 walk(path.join(root,'services/property-processing'));
 for(const filename of fs.readdirSync(root).filter(name=>/^compose\.digitization(?:[.-].*)?\.ya?ml$/.test(name))){
  for(const match of fs.readFileSync(path.join(root,filename),'utf8').matchAll(/^\s+image:\s+([^\s]+)\s*$/gm)){
   const image=match[1].replace(/^['"]|['"]$/g,'');
   if(!/@sha256:[a-f0-9]{64}$/.test(image)||!Object.values(images).includes(image))throw Error(`Unmanifested processing service image: ${image}`);
  }
 }
 return {packages:names.size,models:Object.values(manifest.models).filter(m=>m.enabled).length,gpu:manifest.gpu.enabled};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const at=process.argv.indexOf('--root'),result=validateProcessingLicenses(at===-1?process.cwd():process.argv[at+1]);
 console.log(`Processing licenses verified: ${result.packages} pinned packages; ${result.models} enabled models; GPU ${result.gpu?'enabled':'unavailable'}`);
}
