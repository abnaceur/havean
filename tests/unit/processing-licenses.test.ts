import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const roots:string[]=[],checkout=process.cwd();
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-processing-license-'));roots.push(root);fs.mkdirSync(path.join(root,'docs/adr'),{recursive:true});fs.cpSync('services/property-processing',path.join(root,'services/property-processing'),{recursive:true,filter:source=>!source.split(path.sep).includes('.wheels')});fs.cpSync('docs/adr/licenses',path.join(root,'docs/adr/licenses'),{recursive:true});for(const file of ['images.json','processing-dependencies.json'])fs.copyFileSync('docs/adr/'+file,path.join(root,'docs/adr',file));return root;}
function change(root:string,edit:(manifest:any)=>void){const filename=path.join(root,'docs/adr/processing-dependencies.json'),manifest=JSON.parse(fs.readFileSync(filename,'utf8'));edit(manifest);fs.writeFileSync(filename,JSON.stringify(manifest));}
function run(root:string){return spawnSync(process.execPath,[path.join(checkout,'scripts/processing-licenses.mjs'),'--root',root],{encoding:'utf8'});}
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
describe('HE-A02 exact processing dependency/image/model license gate',()=>{
 it('accepts actual hash-locked baseline with unavailable GPU and no approved models',()=>{const result=run(fixture());expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('8 pinned packages');expect(result.stdout).toContain('0 enabled models');});
 it('rejects absent package licenses and mismatched wheel hashes',()=>{const root=fixture();change(root,m=>{m.python.pypdf.license='';});expect(run(root).stderr).toContain('Missing processing license');const other=fixture();change(other,m=>{m.python.pypdf.artifacts[0].sha256='0'.repeat(64);});expect(run(other).stderr).toContain('wheel hashes differ');});
 it('rejects floating versions, unhashed wheels and unmanifested CPU/GPU base images',()=>{const root=fixture(),lock=path.join(root,'services/property-processing/locks/cpu.lock');fs.writeFileSync(lock,'pypdf>=6.1.1\n');expect(run(root).stderr).toContain('Unpinned or unsupported');const other=fixture();fs.writeFileSync(path.join(other,'services/property-processing/Dockerfile.gpu'),'FROM nvidia/cuda:latest\n');expect(run(other).stderr).toContain('Unmanifested processing image');});
 it('rejects new unpinned processing service images',()=>{const root=fixture();fs.writeFileSync(path.join(root,'services/property-processing/compose.gpu.yaml'),'services:\n  gpu:\n    image: nvidia/cuda:latest\n');expect(run(root).stderr).toContain('Unmanifested processing service image');});
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
