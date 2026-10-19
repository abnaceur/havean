import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const roots:string[]=[],checkout=process.cwd();
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-processing-license-'));roots.push(root);fs.mkdirSync(path.join(root,'docs/adr'),{recursive:true});fs.cpSync('services/property-processing',path.join(root,'services/property-processing'),{recursive:true,filter:source=>!source.split(path.sep).some(part=>['.wheels','.ocr-wheels','.media-sources','.colmap-runtime'].includes(part))});fs.cpSync('docs/adr/licenses',path.join(root,'docs/adr/licenses'),{recursive:true});for(const file of ['images.json','processing-dependencies.json','ocr-wheel-notices.json'])fs.copyFileSync('docs/adr/'+file,path.join(root,'docs/adr',file));const manifest=JSON.parse(fs.readFileSync('docs/adr/processing-dependencies.json','utf8'));for(const native of Object.values(manifest.nativeTools??{}) as any[]){for(const file of native.validation?.evidence??[]){const destination=path.join(root,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination);}}return root;}
function change(root:string,edit:(manifest:any)=>void){const filename=path.join(root,'docs/adr/processing-dependencies.json'),manifest=JSON.parse(fs.readFileSync(filename,'utf8'));edit(manifest);fs.writeFileSync(filename,JSON.stringify(manifest));}
function run(root:string){return spawnSync(process.execPath,[path.join(checkout,'scripts/processing-licenses.mjs'),'--root',root],{encoding:'utf8'});}
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
it('keeps source CPU runtime investigations disabled and binds actual dependency notices',()=>{
 const enabled=fixture();change(enabled,m=>{m.sourceRuntimeInvestigations['colmap-source-cpu'].enabled=true;});expect(run(enabled).stderr).toContain('cannot enable production');
 const notice=fixture();fs.appendFileSync(path.join(notice,'docs/adr/licenses/colmap-source-runtime/libceres4t64.copyright'),'Changed authored notice');expect(run(notice).stderr).toContain('notice checksum/path mismatch');
 const profile=fixture(),filename=path.join(profile,'services/property-processing/colmap-source-runtime.json'),manifest=JSON.parse(fs.readFileSync(filename,'utf8'));manifest.excludedComponents=[];fs.writeFileSync(filename,JSON.stringify(manifest));expect(run(profile).stderr).toContain('exclusion/profile mismatch');
});
it('confines the recovery build alias to its unavailable test recipe and requires pinned infrastructure',()=>{
 const root=fixture();expect(run(root).status).toBe(0);
 const file=path.join(root,'services/property-processing/compose.recovery-tests.yaml');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('PROCESSING_DEPLOYMENT: test','PROCESSING_DEPLOYMENT: production'));expect(run(root).stderr).toContain('Unmanifested processing service image');
 const recipe=fixture();change(recipe,m=>{m.localRecoveryBuild.target='cpu-tests';});expect(run(recipe).stderr).toContain('Unmanifested processing service image');
 const imported=fixture();fs.writeFileSync(path.join(imported,'services/property-processing/compose.unapproved.yaml'),'services:\n  runner:\n    image: haven-processing-cpu:1.0.0-cpu-v4\n');expect(run(imported).stderr).toContain('Unmanifested processing service image');
 const floating=fixture(),target=path.join(floating,'services/property-processing/compose.recovery-tests.yaml');fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/image: postgres:[^\n]+/,'image: postgres:latest'));expect(run(floating).stderr).toContain('Unmanifested processing service image');
});
it('accepts only the declared development CPU recipe and rejects production reuse or changed targets',()=>{
 const root=fixture();fs.copyFileSync('compose.digitization.yaml',path.join(root,'compose.digitization.yaml'));expect(run(root).status).toBe(0);
 fs.writeFileSync(path.join(root,'compose.digitization.yaml'),fs.readFileSync('compose.digitization.yaml','utf8').replace('PROCESSING_DEPLOYMENT: development','PROCESSING_DEPLOYMENT: production'));expect(run(root).stderr).toContain('Unmanifested processing service image');
 const other=fixture();fs.writeFileSync(path.join(other,'compose.digitization.yaml'),fs.readFileSync('compose.digitization.yaml','utf8').replace('target: cpu','target: cpu-tests'));expect(run(other).stderr).toContain('Unmanifested processing service image');
});
it('retained OCR source notices cannot enable runtime libraries and fail on tampering or escaping symlinks',()=>{
 const root=fixture();change(root,m=>{m.sourceNoticeInvestigations['ocr-warp-ctc'].enabled=true;});expect(run(root).stderr).toContain('cannot enable runtime dependencies');
 const other=fixture(),manifest=JSON.parse(fs.readFileSync(path.join(other,'docs/adr/processing-dependencies.json'),'utf8')),notice=manifest.sourceNoticeInvestigations['ocr-warp-ctc'].notices[0];
 fs.appendFileSync(path.join(other,notice.path),'tampered');expect(run(other).stderr).toContain('Research source notice checksum/path mismatch');
 const escaped=fixture(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'haven-outside-notice-'));roots.push(outside);fs.copyFileSync(notice.path,path.join(outside,'notice'));fs.rmSync(path.join(escaped,notice.path));fs.symlinkSync(path.join(outside,'notice'),path.join(escaped,notice.path));expect(run(escaped).stderr).toContain('Research source notice checksum/path mismatch');
});
describe('HE-A02 exact processing dependency/image/model license gate',()=>{
 it('accepts actual hash-locked baseline with unavailable GPU and no approved models',()=>{const result=run(fixture());expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('8 pinned packages');expect(result.stdout).toContain('0 enabled models');});
 it('rejects absent package licenses and mismatched wheel hashes',()=>{const root=fixture();change(root,m=>{m.python.pypdf.license='';});expect(run(root).stderr).toContain('Missing processing license');const other=fixture();change(other,m=>{m.python.pypdf.artifacts[0].sha256='0'.repeat(64);});expect(run(other).stderr).toContain('wheel hashes differ');});
 it('rejects floating versions, unhashed wheels and unmanifested CPU/GPU base images',()=>{const root=fixture(),lock=path.join(root,'services/property-processing/locks/cpu.lock');fs.writeFileSync(lock,'pypdf>=6.1.1\n');expect(run(root).stderr).toContain('Unpinned or unsupported');const other=fixture();fs.writeFileSync(path.join(other,'services/property-processing/Dockerfile.gpu'),'FROM nvidia/cuda:latest\n');expect(run(other).stderr).toContain('Unmanifested processing image');});
 it('rejects new unpinned processing service images',()=>{const root=fixture();fs.writeFileSync(path.join(root,'services/property-processing/compose.gpu.yaml'),'services:\n  gpu:\n    image: nvidia/cuda:latest\n');expect(run(root).stderr).toContain('Unmanifested processing service image');});
 it('allows the versioned local CPU test build only with its test recipe and no production admission',()=>{
  const production=fixture();change(production,m=>{m.localTestBuild.production=true;});expect(run(production).stderr).toContain('Unmanifested processing service image');
  const recipe=fixture(),file=path.join(recipe,'services/property-processing/compose.tests.yaml');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Dockerfile.cpu','Dockerfile.unapproved'));expect(run(recipe).stderr).toContain('Unmanifested processing service image');
  const imported=fixture();fs.writeFileSync(path.join(imported,'services/property-processing/compose.imported.yaml'),'services:\n  imported:\n    image: haven-processing-tests-cpu:1.0.0-cpu-v1\n');expect(run(imported).stderr).toContain('Unmanifested processing service image');
 });
 it('rejects floating images in root processing deployment overrides',()=>{const root=fixture();fs.writeFileSync(path.join(root,'compose.digitization.gpu.yaml'),'services:\n  gpu:\n    image: nvidia/cuda:latest\n');expect(run(root).stderr).toContain('Unmanifested processing service image');});
 it('requires exact separately licensed GPU compatibility and dependency locks',()=>{const root=fixture();change(root,m=>{m.gpu.enabled=true;});expect(run(root).stderr).toContain('GPU requires an exact separate lock');});
 it('rejects enabled weights without proven licenses/checksums; disabled models require a reason',()=>{const root=fixture();change(root,m=>{m.models.ocr={enabled:true,version:'1'};});expect(run(root).stderr).toContain('Model requires exact');const other=fixture();change(other,m=>{m.models.ocr={enabled:false};});expect(run(other).stderr).toContain('Disabled model needs reason');});
 it('validates actual enabled model bytes instead of trusting a declared checksum',()=>{const root=fixture();fs.writeFileSync(path.join(root,'fixture-weights'),'synthetic-license-gate-fixture');change(root,m=>{m.models.fixture={enabled:true,version:'1',license:'MIT',source:'https://example.test/fixture-license',sha256:'0'.repeat(64),path:'fixture-weights'};});expect(run(root).stderr).toContain('Model checksum mismatch');});
});

it('native bundled license notices are checksum-bound and script-enabled PDFium builds fail closed',()=>{
 const root=fixture(),manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/adr/processing-dependencies.json'),'utf8'));
 fs.appendFileSync(path.join(root,manifest.python.pypdfium2.bundledNative.notices[0].path),'modified');expect(run(root).stderr).toContain('Native notice checksum mismatch');
 const other=fixture();change(other,m=>{m.python.pypdfium2.bundledNative.flags=['V8'];});expect(run(other).stderr).toContain('PDFium script/XFA builds are not approved');
});


it('verified media tools require current binary hashes and actual retained validation evidence',()=>{
 const root=fixture();change(root,m=>{m.nativeTools['ffmpeg-media'].binaryHashes.ffmpeg='not-a-hash';});expect(run(root).stderr).toContain('actual local validation/hash evidence');
 const other=fixture(),manifest=JSON.parse(fs.readFileSync(path.join(other,'docs/adr/processing-dependencies.json'),'utf8'));fs.rmSync(path.join(other,manifest.nativeTools['ffmpeg-media'].validation.evidence[0]));expect(run(other).stderr).toContain('actual local validation/hash evidence');
});

it('COLMAP dependency hashes and every retained package notice are required independently of media tools',()=>{
 const root=fixture(),manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/adr/processing-dependencies.json'),'utf8'));
 fs.appendFileSync(path.join(root,manifest.nativeTools['colmap-cpu'].notices[0].path),'changed');expect(run(root).stderr).toContain('COLMAP notice checksum/path mismatch');
 const other=fixture(),filename=path.join(other,'services/property-processing/locks/colmap-apt.json'),lock=JSON.parse(fs.readFileSync(filename,'utf8'));lock.packages.libceres4t64.sha256='unverified';fs.writeFileSync(filename,JSON.stringify(lock));expect(run(other).stderr).toContain('Unpinned COLMAP dependency');
});

it('does not enable COLMAP while the publisher and distribution license conflict is unresolved',()=>{
 const root=fixture();change(root,m=>{m.nativeTools['colmap-cpu'].enabled=true;});
 expect(run(root).stderr).toContain('COLMAP distribution review remains unresolved');
 const other=fixture();change(other,m=>{delete m.nativeTools['colmap-cpu'].distributionReview;m.nativeTools['colmap-cpu'].enabled=true;});
 expect(run(other).stderr).toContain('COLMAP distribution review remains unresolved');
});

it('keeps the exact OCR investigation disabled and rejects changed wheel/model/source pins',()=>{
 function edit(root:string,change:(record:any)=>void){const file=path.join(root,'services/property-processing/ocr-investigation-build.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));change(record);fs.writeFileSync(file,JSON.stringify(record));}
 const enabled=fixture();edit(enabled,record=>{record.enabled=true;});expect(run(enabled).stderr).toContain('cannot enable production dependencies');
 const wheel=fixture();edit(wheel,record=>{record.packages.paddleocr.artifacts[0].sha256='0'.repeat(64);});expect(run(wheel).stderr).toContain('wheel lock mismatch');
 const model=fixture();edit(model,record=>{record.models.PP_OCRv5={revision:'unversioned',artifacts:{}};});expect(run(model).stderr).toContain('model pin mismatch');
 const source=fixture();edit(source,record=>{record.models['PP-OCRv5_mobile_det'].artifacts['README.md'].url='https://example.test/weights';});expect(run(source).stderr).toContain('model artifact mismatch');
});

it('rejects changed retained OCR wheel copyright notices independently of wheel pins',()=>{
 const root=fixture(),file=path.join(root,'docs/adr/ocr-wheel-notices.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));
 fs.appendFileSync(path.join(root,record.packages['bce-python-sdk'].notices[0].path),'changed');expect(run(root).stderr).toContain('OCR wheel notice checksum/path mismatch');
 const other=fixture(),metadata=JSON.parse(fs.readFileSync(path.join(other,'docs/adr/ocr-wheel-notices.json'),'utf8'));metadata.enabled=true;fs.writeFileSync(path.join(other,'docs/adr/ocr-wheel-notices.json'),JSON.stringify(metadata));expect(run(other).stderr).toContain('cannot approve runtime');
});
