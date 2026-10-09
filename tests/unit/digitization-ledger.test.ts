import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const checkout=process.cwd(),temporary:string[]=[];
const baseline=fs.readFileSync('TASKS.json','utf8');
const engine=JSON.parse(fs.readFileSync('docs/digitization/TASKS.json','utf8'));
for(const task of engine.tasks){task.status='todo';task.verification=[];}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-digitization-ledger-'));temporary.push(root);
 for(const directory of ['docs/digitization','evidence/digitization/tasks']) fs.mkdirSync(path.join(root,directory),{recursive:true});
 fs.writeFileSync(path.join(root,'docs/digitization/specification.md'),'Fixture specification');
 fs.writeFileSync(path.join(root,'docs/digitization/TASKS.json'),JSON.stringify(engine));
 const generated=run(root,'--write');if(generated.status!==0)throw Error(generated.stderr);
 return root;
}
function mutate(root:string,edit:(ledger:any)=>void){const ledger=structuredClone(engine);edit(ledger);fs.writeFileSync(path.join(root,'docs/digitization/TASKS.json'),JSON.stringify(ledger));}
function run(root:string,...args:string[]){return spawnSync(process.execPath,[path.join(checkout,'scripts/digitization-tasks.mjs'),'--root',root,...args],{encoding:'utf8'});}
function done(ledger:any,root:string){
 const task=ledger.tasks.find((t:any)=>t.id==='HE-R01');task.status='done';task.verification=[{minimumTest:0,command:'test-ledger',result:'passed'}];
 fs.writeFileSync(path.join(root,task.evidence),['Acceptance','Implementation','Tests','Limitations','Next dependency','O','R','P','V'].map(h=>`## ${h}\n${h==='Tests'?'test-ledger passed':'Explicit fixture evidence.'}\n`).join('\n'));
}
afterEach(()=>{for(const root of temporary.splice(0))fs.rmSync(root,{recursive:true,force:true});expect(fs.readFileSync('TASKS.json','utf8')).toBe(baseline);});
describe('HE-R01 separate digitization acceptance and release gate',()=>{
 it('accepts complete baseline ledger without touching the 120 marketplace tasks',()=>{const result=run(fixture());expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain(`${engine.tasks.length} digitization tasks`);expect(JSON.parse(baseline).tasks).toHaveLength(120);});
 it('rejects unfinished engine release even when ordinary validation passes',()=>{const result=run(fixture(),'--release');expect(result.status).toBe(1);expect(result.stderr).toMatch(/HE-K08: todo/);});
 it('rejects duplicate IDs, removed baseline rows and dependency cycles',()=>{
  const root=fixture();mutate(root,l=>l.tasks[0].id='HE-A02');expect(run(root).stderr).toMatch(/duplicate ID|missing specification task/);
  mutate(root,l=>l.tasks.push({...l.tasks[0],id:'HE-A01-EXTRA',dependencies:['HE-A01-EXTRA']}));expect(run(root).stderr).toContain('dependency cycle');
 });
 it('rejects unknown prerequisites and empty acceptance/tests',()=>{
  const root=fixture();mutate(root,l=>l.tasks[0].dependencies=['HE-R99']);expect(run(root).stderr).toContain('unknown dependency');
  mutate(root,l=>{l.tasks[0].acceptance=[' '];l.tasks[0].minimumTests=[];});expect(run(root).stderr).toMatch(/empty string/);expect(run(root).stderr).toMatch(/too few items/);
 });
 it('requires passing minimum tests and evidence before marking done',()=>{
  const root=fixture();mutate(root,l=>{l.tasks.find((t:any)=>t.id==='HE-R01').status='done';});const result=run(root);expect(result.stderr).toContain('missing passing minimum test');expect(result.stderr).toContain('missing or unsafe evidence');
 });
 it('rejects missing provenance and unfinished done prerequisites',()=>{
  const root=fixture();mutate(root,l=>{done(l,root);l.tasks[0].status='done';l.tasks.find((t:any)=>t.id==='HE-R01').dependencies=['HE-R02'];});expect(run(root).stderr).toContain('unfinished dependency');
  mutate(root,l=>done(l,root));fs.writeFileSync(path.join(root,'evidence/digitization/tasks/HE-R01.md'),'## Tests\ntest-ledger passed\n');expect(run(root).stderr).toContain('missing evidence section V');
 });
 it('accepts reviewed evidence and requires explicit markdown regeneration',()=>{
  const root=fixture();mutate(root,l=>done(l,root));expect(run(root).stderr).toContain('TASKS.md is stale');expect(run(root,'--write').status).toBe(0);expect(run(root).status).toBe(0);
 });
 it('rejects evidence symlinks outside the checkout',()=>{
  const root=fixture();mutate(root,l=>done(l,root));const file=path.join(root,'evidence/digitization/tasks/HE-R01.md');fs.unlinkSync(file);fs.symlinkSync(path.join(checkout,'AGENTS.md'),file);expect(run(root).stderr).toContain('missing or unsafe evidence');
 });
 it('wires both root gates without modifying marketplace ledger bytes',()=>{
  // Make the isolated platform fixture explicitly unfinished; the live ledger
  // may legitimately reach 120/120 while engine release work is still pending.
  const platform=JSON.parse(baseline);platform.tasks.find((task:any)=>task.id==='Q11').status='todo';const platformBaseline=JSON.stringify(platform);
  const root=fixture();fs.writeFileSync(path.join(root,'TASKS.json'),platformBaseline);
  for(const task of JSON.parse(baseline).tasks) if(task.status==='done'){const file=path.join(root,task.evidence);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'Preserved platform evidence fixture');}
  const validate=spawnSync(process.execPath,[path.join(checkout,'scripts/tasks.mjs')],{cwd:root,encoding:'utf8'});expect(validate.status,validate.stderr).toBe(0);expect(validate.stdout).toContain('120 tasks');expect(validate.stdout).toContain(`${engine.tasks.length} digitization tasks`);
  const release=spawnSync(process.execPath,[path.join(checkout,'scripts/tasks.mjs'),'--release'],{cwd:root,encoding:'utf8'});expect(release.status).toBe(1);expect(release.stderr).toContain('HE-K08: todo');expect(release.stderr).toMatch(/Q11: todo/);expect(fs.readFileSync(path.join(root,'TASKS.json'),'utf8')).toBe(platformBaseline);
 });
});
