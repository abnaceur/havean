import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateOcrRelease} from './lib/ocr-release.mjs';

export function validateProcessingLicenses(root=process.cwd()) {
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 const manifest=read('docs/adr/processing-dependencies.json'),images=read('docs/adr/images.json');
 const ocrRelease=manifest.ocrRelease?validateOcrRelease(root):null;
 if(ocrRelease&&(manifest.ocrRelease.manifest!=='services/property-processing/ocr-production-release.json'||manifest.ocrRelease.sha256!==ocrRelease.releaseSha256||manifest.ocrRelease.enabled!==true))throw Error('OCR release admission checksum mismatch');
 if(manifest.schemaVersion!==1)throw Error('Unknown processing license manifest version');
 const localOcr=manifest.localDevelopmentOcrBuild;
 const localCamera=manifest.localDevelopmentCameraBuild;
 if(localCamera){
  if(localCamera.production!==false||localCamera.image!=='haven-processing-camera:3.10-local-cpu-v1'||localCamera.compose!=='compose.camera-development.yaml'||localCamera.dockerfile!=='services/property-processing/Dockerfile.camera-development'||localCamera.baseImage!==localOcr?.image||localCamera.cameraSourceImage!=='haven-colmap-runtime:3.10-source-cpu-v1'||!localCamera.reason?.trim())throw Error('Local camera composition cannot admit production');
  const composition=fs.readFileSync(path.join(root,localCamera.compose),'utf8');
  if(!composition.includes('image: '+localCamera.image)||!composition.includes('dockerfile: '+localCamera.dockerfile)||!composition.includes("PROCESSING_ENABLE_CAMERA_INVESTIGATION: 'true'")||/PROCESSING_DEPLOYMENT: (staging|production)/.test(composition))throw Error('Local camera recipes must retain their exact investigation targets');
 }
 if(localOcr){
  if(localOcr.production!==false||localOcr.image!=='haven-processing-ocr:3.3.3-local-cpu-v1'||localOcr.compose!=='compose.ocr-development.yaml'||localOcr.dockerfile!=='services/property-processing/Dockerfile.ocr-development'||localOcr.cpuSourceImage!==manifest.localDevelopmentBuild?.image||localOcr.ocrSourceImage!=='haven-ocr-worker:3.3.3-clean-cpu-no-gui-investigation-v2'||!localOcr.reason?.trim())throw Error('Local OCR composition cannot admit production');
  const composition=fs.readFileSync(path.join(root,localOcr.compose),'utf8'),source=fs.readFileSync(path.join(root,'compose.ocr-no-gui.yaml'),'utf8');
  if(!composition.includes('image: '+localOcr.image)||!composition.includes('dockerfile: '+localOcr.dockerfile)||!composition.includes('PROCESSING_DEPLOYMENT: development')||/PROCESSING_DEPLOYMENT: (staging|production)/.test(composition)||!source.includes('image: '+localOcr.ocrSourceImage)||!source.includes('target: worker-no-gui-investigation'))throw Error('Local OCR recipes must retain their exact investigation targets');
 }
 const hash=/^[a-f0-9]{64}$/;
 const names=new Set();
 const locks=path.join(root,'services/property-processing/locks');
 const ocrFile='services/property-processing/ocr-investigation-build.json';
 if(fs.existsSync(path.join(root,ocrFile))){
  const ocr=read(ocrFile),normalize=name=>name.toLowerCase().replace(/[_.]/g,'-');
  if(ocr.schemaVersion!==1||ocr.enabled!==false||!ocr.reason?.trim()||!Object.values(images).includes(ocr.baseImage))throw Error('OCR investigation cannot enable production dependencies');
  const packages=new Map(Object.entries(ocr.packages||{}).map(([name,value])=>[normalize(name),value])),seen=new Set();
  for(const line of fs.readFileSync(path.join(root,'services/property-processing/ocr-investigation.lock'),'utf8').split(/\r?\n/).filter(line=>line.trim())){
   const match=line.match(/^([a-zA-Z0-9_.-]+)==([a-zA-Z0-9_.+-]+) --hash=sha256:([a-f0-9]{64})$/),name=match&&normalize(match[1]),pkg=name&&packages.get(name);
   if(!pkg||seen.has(name)||pkg.version!==match[2]||pkg.artifacts?.length!==1||pkg.artifacts[0].sha256!==match[3]||!pkg.artifacts[0].url?.startsWith('https://files.pythonhosted.org/packages/')||path.basename(pkg.artifacts[0].filename)!==pkg.artifacts[0].filename||!pkg.artifacts[0].filename.endsWith('.whl'))throw Error('OCR investigation wheel lock mismatch');
   seen.add(name);
  }
  if(!seen.size||seen.size!==packages.size||packages.size!==Object.keys(ocr.packages).length)throw Error('OCR investigation wheel inventory incomplete');
  if(Object.keys(ocr.models||{}).sort().join(',')!==['PP-OCRv5_mobile_det','arabic_PP-OCRv3_mobile_rec','en_PP-OCRv4_mobile_rec','latin_PP-OCRv3_mobile_rec'].sort().join(','))throw Error('OCR investigation model pin mismatch');
  for(const [name,model] of Object.entries(ocr.models||{})){
   if(!/^[A-Za-z0-9_.-]+$/.test(name)||! /^[a-f0-9]{40}$/.test(model.revision)||model.license!=='apache-2.0'||!Object.keys(model.artifacts||{}).length)throw Error('OCR investigation model pin mismatch');
   for(const [filename,artifact] of Object.entries(model.artifacts))if(path.basename(filename)!==filename||!hash.test(artifact.sha256)||artifact.url!==`https://huggingface.co/PaddlePaddle/${name}/resolve/${model.revision}/${filename}`)throw Error('OCR investigation model artifact mismatch');
  }
  for(const [name,library] of Object.entries(ocr.nativeLibraries||{}))if(!/^[A-Za-z0-9_+.-]+\.so(?:\.[0-9]+)*$/.test(name)||!hash.test(library.sha256)||!library.source)throw Error('OCR investigation native library pin mismatch');
  if(['libGL.so.1','libatomic.so.1','libiomp5.so','libmklml_intel.so','libblas.so.3','liblapack.so.3','libgfortran.so.5'].some(name=>!ocr.nativeLibraries?.[name]))throw Error('OCR investigation native library inventory incomplete');
  const debian=read('services/property-processing/locks/colmap-apt.json').packages;
  for(const [name,pkg] of Object.entries(ocr.debianPackages||{}))if(!debian[name]||pkg.version!==debian[name].version||pkg.sha256!==debian[name].sha256||pkg.filename!==debian[name].filename||pkg.file!==path.basename(pkg.filename))throw Error('OCR investigation Debian package mismatch');
  const notices=read('docs/adr/ocr-wheel-notices.json');
  if(notices.schemaVersion!==1||notices.enabled!==false||!notices.reason||Object.keys(notices.packages||{}).length!==packages.size)throw Error('OCR wheel notices cannot approve runtime');
  for(const [name,pkg] of Object.entries(notices.packages)){
   const locked=packages.get(normalize(name));
   if(!locked||pkg.version!==locked.version||JSON.stringify(pkg.artifacts)!==JSON.stringify(locked.artifacts)||!pkg.notices?.length)throw Error('OCR wheel notice inventory mismatch');
   for(const notice of pkg.notices){const file=fs.realpathSync(path.join(root,notice.path)),relative=path.relative(fs.realpathSync(root),file);if(relative.startsWith('..')||path.isAbsolute(relative)||!hash.test(notice.sha256)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==notice.sha256)throw Error('OCR wheel notice checksum/path mismatch');}
  }
 }
 // Retained research notices are not runtime/distribution approval. Keep them
 // checksum-bound without admitting unreviewed OCR libraries into CPU locks.
 for(const [id,investigation] of Object.entries(manifest.sourceNoticeInvestigations||{})){
  if(investigation.enabled!==false||!investigation.reason?.trim()||! /^[a-f0-9]{40}$/.test(investigation.sourceCommit)||!hash.test(investigation.sourceArchiveSha256)||!investigation.sourceArchiveUrl?.startsWith('https://codeload.github.com/')||!investigation.sourceArchiveUrl.endsWith('/'+investigation.sourceCommit)||!investigation.notices?.length)throw Error(`Source notice investigation cannot enable runtime dependencies: ${id}`);
  const paths=new Set();
  for(const notice of investigation.notices){
   if(!notice.path?.startsWith('docs/adr/licenses/')||paths.has(notice.path)||!hash.test(notice.sha256))throw Error(`Invalid research source notice: ${id}`);
   paths.add(notice.path);
   const resolved=fs.realpathSync(path.join(root,notice.path)),relative=path.relative(fs.realpathSync(root),resolved);
   if(relative.startsWith('..')||path.isAbsolute(relative)||createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')!==notice.sha256)throw Error(`Research source notice checksum/path mismatch: ${id}`);
  }
 }
 for(const [id,investigation] of Object.entries(manifest.sourceRuntimeInvestigations||{})){
  if(id!=='colmap-source-cpu'||investigation.enabled!==false||!investigation.reason?.trim()||investigation.profile!=='services/property-processing/colmap-source-runtime.json'||investigation.noticeDirectory!=='docs/adr/licenses/colmap-source-runtime'||!/^sha256:[a-f0-9]{64}$/.test(investigation.sourceImage??''))throw Error(`Source runtime investigation cannot enable production: ${id}`);
  const profile=read(investigation.profile),source=manifest.sourceNoticeInvestigations[investigation.sourceNoticeId];
  if(!source||profile.sourceImage!==investigation.sourceImage||profile.sourceCommit!==source.sourceCommit||profile.id!=='colmap-3.10-source-cpu-runtime-v1'||profile.productionEnabled!==false||profile.gpuAvailable!==false||profile.libraryDirectory!=='/opt/colmap/lib'||profile.buildObjectCount!==145||JSON.stringify(profile.excludedComponents)!==JSON.stringify(['SiftGPU','LSD','CUDA','OpenGL','CGAL'])||!hash.test(profile.binarySha256)||!Array.isArray(profile.files)||!profile.files.length)throw Error(`Source runtime exclusion/profile mismatch: ${id}`);
  const files=new Map();
  for(const file of profile.files){
   if(!/^(?:bin\/colmap|lib\/[A-Za-z0-9_+.-]+|notices\/[A-Za-z0-9_+.-]+)$/.test(file.name??'')||files.has(file.name)||!hash.test(file.sha256)||!/^\d+$/.test(file.bytes??'')||file.package!==null&&!profile.packages?.[file.package])throw Error(`Source runtime file identity invalid: ${id}`);
   files.set(file.name,file);
   if(file.name.startsWith('notices/')){
    const filename=path.join(root,investigation.noticeDirectory,path.basename(file.name)),resolved=fs.realpathSync(filename),relative=path.relative(fs.realpathSync(root),resolved),body=fs.readFileSync(resolved);
    if(relative.startsWith('..')||path.isAbsolute(relative)||String(body.length)!==file.bytes||createHash('sha256').update(body).digest('hex')!==file.sha256)throw Error(`Source runtime notice checksum/path mismatch: ${id}`);
   }
  }
  if(files.get('bin/colmap')?.sha256!==profile.binarySha256||Object.entries(profile.packages??{}).some(([name,version])=>! /^[a-z0-9+.-]+$/.test(name)||! /^[0-9][a-zA-Z0-9:.+~_-]*$/.test(version)||files.get(`notices/${name}.copyright`)?.package!==name))throw Error(`Source runtime dependency notices incomplete: ${id}`);
 }
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
 for(const [id,native] of Object.entries(manifest.nativeTools||{})) {
  if(native.kind==='colmap'){
   if(native.enabled&&native.distributionReview?.status!=='approved')throw Error(`COLMAP distribution review remains unresolved: ${id}`);
   const profile=read(native.buildProfile),lock=read(native.buildPackages),notices=read('docs/adr/licenses/colmap-debian-3.10/package-notices.json');
   if(![true,false].includes(native.enabled)||!native.enabled&&!native.reason||!native.license||profile.kind!=='colmap'||profile.version!==native.version||profile.source!==native.source||profile.sourceSha256!==native.sourceSha256||!native.source?.startsWith('https://deb.debian.org/debian/')||!hash.test(native.sourceSha256)||profile.gpuAvailable!==false||profile.runtimeNetwork!=='none'||profile.binaryHashes.colmap!==lock.binarySha256||native.binaryHashes.colmap!==lock.binarySha256||!hash.test(lock.binarySha256)||lock.packages.colmap.sha256!==native.sourceSha256)throw Error(`Pinned CPU COLMAP profile mismatch: ${id}`);
   if(!Object.keys(lock.packages).length||Object.entries(lock.packages).some(([name,entry])=>! /^[a-z0-9+.-]+$/.test(name)||! /^[0-9][a-zA-Z0-9:.+~_-]*$/.test(entry.version)||!hash.test(entry.sha256)||!entry.filename?.startsWith('pool/')||notices[name]?.version!==entry.version))throw Error(`Unpinned COLMAP dependency: ${id}`);
   if(native.enabled&&(!native.validation?.evidence?.length||native.validation.evidence.some(file=>!fs.existsSync(path.join(root,file)))))throw Error(`COLMAP requires retained real validation: ${id}`);
   if(native.notices?.length!==Object.keys(lock.packages).length)throw Error(`Missing COLMAP dependency notices: ${id}`);
   const components=new Set();
   for(const notice of native.notices){
    const resolved=fs.realpathSync(path.join(root,notice.path)),relative=path.relative(fs.realpathSync(root),resolved);
    if(components.has(notice.component)||!lock.packages[notice.component]||notices[notice.component].sha256!==notice.sha256||relative.startsWith('..')||path.isAbsolute(relative)||!hash.test(notice.sha256)||createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')!==notice.sha256)throw Error(`COLMAP notice checksum/path mismatch: ${id}`);
    components.add(notice.component);
   }
   continue;
  }
  if(!([true,false].includes(native.enabled))||native.enabled===false&&!native.reason||!native.version||!native.license||!native.source?.startsWith('https://')||!hash.test(native.sourceSha256)||!native.notices?.length)throw Error(`Native tool needs exact pending/disabled record: ${id}`);
  if(native.enabled&&(!native.binaryHashes||!['ffmpeg','ffprobe'].every(name=>hash.test(native.binaryHashes[name]))||!native.validation?.scope||!native.validation.evidence?.length||native.validation.evidence.some(file=>!fs.existsSync(path.join(root,file)))))throw Error(`Native tool requires actual local validation/hash evidence: ${id}`);
  const profile=read(native.buildProfile),packages=read(native.buildPackages).packages;
  if(profile.version!==native.version||profile.source!==native.source||profile.sourceSha256!==native.sourceSha256||!profile.flags?.includes('--disable-network')||!profile.flags.includes('--disable-autodetect')||profile.flags.some(flag=>['--enable-gpl','--enable-nonfree','--enable-version3'].includes(flag)))throw Error(`Native media build profile mismatch: ${id}`);
  if(!Object.keys(packages||{}).length||Object.entries(packages).some(([name,version])=>! /^[a-z0-9+.-]+$/.test(name)||! /^[0-9][a-zA-Z0-9:.+~_-]*$/.test(version)))throw Error(`Unpinned native build packages: ${id}`);
  for(const notice of native.notices){
   const resolved=fs.realpathSync(path.join(root,notice.path)),relative=path.relative(fs.realpathSync(root),resolved);
   if(relative.startsWith('..')||path.isAbsolute(relative)||!hash.test(notice.sha256)||createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')!==notice.sha256)throw Error(`Native tool notice checksum/path mismatch: ${id}`);
  }
 }
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
    const compose=fs.readFileSync(file,'utf8');
    for(const match of compose.matchAll(/^\s+image:\s+([^\s]+)\s*$/gm)){
     const image=match[1].replace(/^['"]|['"]$/g,'');
     const local=manifest.localTestBuild;
     const recovery=manifest.localRecoveryBuild;
     if(recovery&&recovery.production===false&&recovery.image==='haven-processing-cpu:1.0.0-cpu-v4'&&image===recovery.image&&recovery.compose==='services/property-processing/compose.recovery-tests.yaml'&&file===path.join(root,recovery.compose)&&recovery.dockerfile==='services/property-processing/Dockerfile.cpu'&&recovery.target==='cpu'&&/processing-cpu:\s*\n\s+image: haven-processing-cpu:1\.0\.0-cpu-v4\s*\n\s+build:\s*\n\s+context: \.\.\/\.\.\s*\n\s+dockerfile: services\/property-processing\/Dockerfile\.cpu\s*\n\s+target: cpu\s*\n/.test(compose)&&/PROCESSING_DEPLOYMENT: test/.test(compose)&&/PROCESSING_ADAPTER: unavailable/.test(compose)&&!/PROCESSING_DEPLOYMENT: (development|staging|production)/.test(compose))continue;
     // A locally built test target is not a pulled deployment dependency. Its
     // recipe is checked below against the same digest-pinned base allowlist.
     if(local&&image===local.image&&local.production===false&&local.image==='haven-processing-tests-cpu:1.0.0-cpu-v1'&&local.compose==='services/property-processing/compose.tests.yaml'&&file===path.join(root,local.compose)&&local.dockerfile==='services/property-processing/Dockerfile.cpu'&&local.target==='cpu-tests'&&/dockerfile: services\/property-processing\/Dockerfile\.cpu\s*\n\s+target: \$\{PROCESSING_BUILD_TARGET:-cpu-tests\}/.test(compose))continue;
     if(!/@sha256:[a-f0-9]{64}$/.test(image)||!Object.values(images).includes(image))throw Error(`Unmanifested processing service image: ${image}`);
    }
   }
   else if(item.name.startsWith('Dockerfile')){
    const stages=new Set();
    for(const match of fs.readFileSync(file,'utf8').matchAll(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?\s*$/gim)){
     const image=match[1];
     const localOcrSource=localOcr?.production===false&&localOcr.image==='haven-processing-ocr:3.3.3-local-cpu-v1'&&localOcr.dockerfile==='services/property-processing/Dockerfile.ocr-development'&&file===path.join(root,localOcr.dockerfile)&&localOcr.compose==='compose.ocr-development.yaml'&&localOcr.cpuSourceImage===manifest.localDevelopmentBuild?.image&&localOcr.ocrSourceImage==='haven-ocr-worker:3.3.3-clean-cpu-no-gui-investigation-v2'&&[localOcr.cpuSourceImage,localOcr.ocrSourceImage].includes(image);
     const localCameraSource=localCamera?.production===false&&file===path.join(root,localCamera.dockerfile)&&[localCamera.baseImage,localCamera.cameraSourceImage].includes(image);
     if(!stages.has(image)&&!localOcrSource&&!localCameraSource&&(!/@sha256:[a-f0-9]{64}$/.test(image)||!Object.values(images).includes(image)))throw Error(`Unmanifested processing image: ${image}`);
     if(match[2])stages.add(match[2]);
    }
   }
  }
 }
 walk(path.join(root,'services/property-processing'));
 for(const filename of fs.readdirSync(root).filter(name=>/^compose\.digitization(?:[.-].*)?\.ya?ml$/.test(name))){
  const compose=fs.readFileSync(path.join(root,filename),'utf8');
  for(const match of compose.matchAll(/^\s+image:\s+([^\s]+)\s*$/gm)){
   const image=match[1].replace(/^['"]|['"]$/g,'');
   const local=manifest.localDevelopmentBuild;
   if(local&&local.production===false&&local.image==='haven-processing-cpu:1.0.0-cpu-v4'&&image===local.image&&filename==='compose.digitization.yaml'&&local.compose===filename&&local.dockerfile==='services/property-processing/Dockerfile.cpu'&&local.target==='cpu'&&/processing-cpu:\s*\n\s+image: haven-processing-cpu:1\.0\.0-cpu-v4\s*\n\s+build:\s*\n\s+context: \.\s*\n\s+dockerfile: services\/property-processing\/Dockerfile\.cpu\s*\n\s+target: cpu\s*\n/.test(compose)&&/PROCESSING_DEPLOYMENT: development/.test(compose))continue;
   if(!/@sha256:[a-f0-9]{64}$/.test(image)||!Object.values(images).includes(image))throw Error(`Unmanifested processing service image: ${image}`);
  }
 }
 return {packages:names.size,ocrPackages:ocrRelease?.packages??0,models:Object.values(manifest.models).filter(m=>m.enabled).length+(ocrRelease?.models??0),gpu:manifest.gpu.enabled};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const at=process.argv.indexOf('--root'),result=validateProcessingLicenses(at===-1?process.cwd():process.argv[at+1]);
 console.log(`Processing licenses verified: ${result.packages} pinned packages; ${result.models} enabled models; GPU ${result.gpu?'enabled':'unavailable'}`);
}
