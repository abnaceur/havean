import {validateReleaseReadiness} from './release-readiness.mjs';
import fs from 'node:fs';
import {validateDigitizationTasks} from './lib/digitization-tasks.mjs';
const {tasks,uiIntegration,propertyMediaUpdate,propertyMediaExperience,propertyWizard,spacingExperience,propertyStepValidation,viewingCalendarExperience,chatExperience,digitizationPause} = JSON.parse(fs.readFileSync('TASKS.json','utf8'));
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
if(uiIntegration){
 if(!['todo','in_progress','done','blocked'].includes(uiIntegration.status))errors.push('Haven UI integration: invalid status');
 if(!uiIntegration.acceptance?.length||!uiIntegration.minimumTests?.length||!fs.existsSync(uiIntegration.evidence))errors.push('Haven UI integration: missing contract/evidence');
 if(uiIntegration.status==='done'&&uiIntegration.referenceParity!=='verified')errors.push('Haven UI integration: reference parity is unverified');
 if(process.argv.includes('--release')&&uiIntegration.status!=='done')errors.push(`Haven UI integration: ${uiIntegration.status}; ${uiIntegration.blocker}`);
}
for(const update of [propertyMediaUpdate,propertyMediaExperience,propertyWizard,spacingExperience,propertyStepValidation,viewingCalendarExperience,chatExperience,digitizationPause].filter(Boolean)){
 if(!['todo','in_progress','done','blocked'].includes(update.status))errors.push(`${update.title}: invalid status`);
 if(!update.acceptance?.length||!update.minimumTests?.length||!fs.existsSync(update.evidence))errors.push(`${update.title}: missing contract/evidence`);
 if(process.argv.includes('--release')&&update.status!=='done')errors.push(`${update.title}: ${update.status}`);
}
fs.writeFileSync('TASKS.md','# Specification backlog\n\n'+tasks.map(t=>`- [${t.status==='done'?'x':' '}] **${t.id} ${t.title}** — ${t.status}; dependencies: ${t.dependencies.join(', ')||'none'}\n`).join('')+(uiIntegration?`\n## Requested Haven UI integration\n\n- [${uiIntegration.status==='done'?'x':' '}] **Haven design and responsive integration** — ${uiIntegration.status}; local implementation: ${uiIntegration.localImplementation}; reference parity: ${uiIntegration.referenceParity}. Evidence: [integration report](${uiIntegration.evidence}).\n\n${uiIntegration.blocker}\n`:''));
if(propertyMediaUpdate)fs.appendFileSync('TASKS.md',`
## Requested property upload update

- [${propertyMediaUpdate.status==='done'?'x':' '}] **${propertyMediaUpdate.title}** — ${propertyMediaUpdate.status}. Evidence: [validation report](${propertyMediaUpdate.evidence}).
`);
if(propertyMediaExperience)fs.appendFileSync('TASKS.md',`\n## Requested full-screen media experience\n\n- [${propertyMediaExperience.status==='done'?'x':' '}] **${propertyMediaExperience.title}** — ${propertyMediaExperience.status}. Evidence: [validation report](${propertyMediaExperience.evidence}).\n`);
if(propertyWizard)fs.appendFileSync('TASKS.md',`\n## Requested guided property creation\n\n- [${propertyWizard.status==='done'?'x':' '}] **${propertyWizard.title}** — ${propertyWizard.status}. Evidence: [validation report](${propertyWizard.evidence}).\n`);
if(spacingExperience)fs.appendFileSync('TASKS.md',`\n## Requested application spacing\n\n- [${spacingExperience.status==='done'?'x':' '}] **${spacingExperience.title}** — ${spacingExperience.status}. Evidence: [validation report](${spacingExperience.evidence}).\n`);
if(propertyStepValidation)fs.appendFileSync('TASKS.md',`\n## Requested per-step property validation\n\n- [${propertyStepValidation.status==='done'?'x':' '}] **${propertyStepValidation.title}** — ${propertyStepValidation.status}. Evidence: [validation report](${propertyStepValidation.evidence}).\n`);
if(viewingCalendarExperience)fs.appendFileSync('TASKS.md',`\n## Requested viewing calendar experience\n\n- [${viewingCalendarExperience.status==='done'?'x':' '}] **${viewingCalendarExperience.title}** — ${viewingCalendarExperience.status}. Evidence: [validation report](${viewingCalendarExperience.evidence}).\n`);
if(chatExperience)fs.appendFileSync('TASKS.md',`\n## Requested chat experience\n\n- [${chatExperience.status==='done'?'x':' '}] **${chatExperience.title}** — ${chatExperience.status}. Evidence: [validation report](${chatExperience.evidence}).\n`);
if(digitizationPause)fs.appendFileSync('TASKS.md',`\n## Requested digitalization pause\n\n- [${digitizationPause.status==='done'?'x':' '}] **${digitizationPause.title}** — ${digitizationPause.status}. Evidence: [validation report](${digitizationPause.evidence}).\n`);
if(process.argv.includes('--release'))errors.push(...validateReleaseReadiness());
if(process.argv.includes('--release')) for(const t of tasks) if(t.status!=='done') errors.push(`${t.id}: ${t.status}`);
const engine=validateDigitizationTasks({release:process.argv.includes('--release')});
errors.push(...engine.errors);
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Validated ${tasks.length} tasks; ${tasks.filter(t=>t.status==='done').length} done.`);
console.log(`Validated ${engine.count} digitization tasks; ${engine.done} done.`);
