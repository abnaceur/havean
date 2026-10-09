import {validateReleaseReadiness} from './release-readiness.mjs';
import fs from 'node:fs';
import {validateDigitizationTasks} from './lib/digitization-tasks.mjs';
const {tasks} = JSON.parse(fs.readFileSync('TASKS.json','utf8'));
const ids = new Set(tasks.map(t=>t.id));
const errors=[];
if(ids.size !== 120 || tasks.length !== 120) errors.push('Expected 120 unique specification tasks');
for(const t of tasks){
 if(!['todo','in_progress','done','blocked'].includes(t.status)) errors.push(`${t.id}: invalid status`);
 for(const d of t.dependencies) if(!ids.has(d)) errors.push(`${t.id}: unknown dependency ${d}`);
 if(!t.acceptance.length || !t.minimumTests.length) errors.push(`${t.id}: missing contract`);
 if(t.status==='done'){
  if(!fs.existsSync(t.evidence)) errors.push(`${t.id}: missing evidence`);
  for(const d of t.dependencies) if(tasks.find(x=>x.id===d)?.status!=='done') errors.push(`${t.id}: unfinished dependency ${d}`);
 }
}
fs.writeFileSync('TASKS.md','# Specification backlog\n\n'+tasks.map(t=>`- [${t.status==='done'?'x':' '}] **${t.id} ${t.title}** — ${t.status}; dependencies: ${t.dependencies.join(', ')||'none'}\n`).join(''));
if(process.argv.includes('--release'))errors.push(...validateReleaseReadiness());
if(process.argv.includes('--release')) for(const t of tasks) if(t.status!=='done') errors.push(`${t.id}: ${t.status}`);
const engine=validateDigitizationTasks({release:process.argv.includes('--release')});
errors.push(...engine.errors);
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Validated ${tasks.length} tasks; ${tasks.filter(t=>t.status==='done').length} done.`);
console.log(`Validated ${engine.count} digitization tasks; ${engine.done} done.`);
