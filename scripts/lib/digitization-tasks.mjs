import fs from 'node:fs';
import path from 'node:path';

// This small validator implements exactly the keywords used by tasks.schema.json.
// Reject new, unsupported keywords rather than silently weakening its contract.
function schemaErrors(value, schema, location, errors) {
 const supported = new Set(['$schema','title','type','additionalProperties','required','properties','const','enum','pattern','minLength','minItems','items','uniqueItems','minimum']);
 for (const key of Object.keys(schema)) if (!supported.has(key)) errors.push(`${location}: unsupported schema keyword ${key}`);
 if ('const' in schema && value !== schema.const) errors.push(`${location}: expected ${JSON.stringify(schema.const)}`);
 if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}: invalid value`);
 if (schema.type) {
  const matches = schema.type === 'array' ? Array.isArray(value) : schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : schema.type === 'integer' ? Number.isInteger(value) : typeof value === schema.type;
  if (!matches) { errors.push(`${location}: expected ${schema.type}`); return; }
 }
 if (typeof value === 'string') {
  if (schema.minLength && value.trim().length < schema.minLength) errors.push(`${location}: empty string`);
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: invalid format`);
 }
 if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: below minimum`);
 if (Array.isArray(value)) {
  if (schema.minItems && value.length < schema.minItems) errors.push(`${location}: too few items`);
  if (schema.uniqueItems && new Set(value.map(x=>JSON.stringify(x))).size !== value.length) errors.push(`${location}: duplicate items`);
  value.forEach((entry,index)=>schemaErrors(entry,schema.items,`${location}[${index}]`,errors));
 }
 if (schema.type === 'object') {
  for (const key of schema.required || []) if (!(key in value)) errors.push(`${location}: missing ${key}`);
  for (const [key, entry] of Object.entries(value)) {
   if (schema.properties[key]) schemaErrors(entry,schema.properties[key],`${location}.${key}`,errors);
   else if (schema.additionalProperties === false) errors.push(`${location}: unexpected ${key}`);
  }
 }
}
export function renderDigitizationTasks(tasks) {
 return '# Digitization backlog\n\nGenerated from TASKS.json by scripts/digitization-tasks.mjs --write. Original marketplace tasks remain in the root ledger.\n\n'+tasks.map(t=>`- [${t.status==='done'?'x':' '}] **${t.id} ${t.title}** — ${t.status}; dependencies: ${t.dependencies.join(', ')||'none'}; [evidence](../../${t.evidence})\n`).join('');
}
export function validateDigitizationTasks({root=process.cwd(),release=false,write=false}={}) {
 const errors=[];
 let ledger, schema;
 try {
  ledger=JSON.parse(fs.readFileSync(path.join(root,'docs/digitization/TASKS.json'),'utf8'));
  schema=JSON.parse(fs.readFileSync(new URL('../../docs/digitization/tasks.schema.json',import.meta.url),'utf8'));
 } catch { return {errors:['Digitization ledger/schema missing or invalid JSON'],count:0,done:0}; }
 schemaErrors(ledger,schema,'ledger',errors);
 if (errors.length) return {errors,count:0,done:0};
 const tasks=ledger.tasks, byId=new Map();
 for (const task of tasks) {
  if (byId.has(task.id)) errors.push(`${task.id}: duplicate ID`);
  byId.set(task.id,task);
 }
 // Baseline rows cannot disappear; additional coherent subtasks may be appended.
 for (const [group,count] of Object.entries({A:6,B:6,C:10,D:10,E:11,F:8,G:5,H:10,I:7,J:5,K:8,R:7})) {
  for(let number=1;number<=count;number++) {
   const id=`HE-${group}${String(number).padStart(2,'0')}`;
   if(!byId.has(id)) errors.push(`${id}: missing specification task`);
  }
 }
 const visiting=new Set(),visited=new Set();
 function visit(id) {
  if(visiting.has(id)) { errors.push(`${id}: dependency cycle`); return; }
  if(visited.has(id)) return;
  visiting.add(id);
  for (const dependency of byId.get(id)?.dependencies || []) {
   if(!byId.has(dependency)) errors.push(`${id}: unknown dependency ${dependency}`);
   else visit(dependency);
  }
  visiting.delete(id);visited.add(id);
 }
 for(const task of tasks) {
  visit(task.id);
  if(task.evidence!==`evidence/digitization/tasks/${task.id}.md`) errors.push(`${task.id}: evidence must match task ID`);
  for(const v of task.verification) if(v.minimumTest>=task.minimumTests.length) errors.push(`${task.id}: unknown minimum test ${v.minimumTest}`);
  if(task.status==='done') {
   for(const dependency of task.dependencies) if(byId.get(dependency)?.status!=='done') errors.push(`${task.id}: unfinished dependency ${dependency}`);
   for(let index=0;index<task.minimumTests.length;index++) if(!task.verification.some(v=>v.minimumTest===index&&v.result==='passed')) errors.push(`${task.id}: missing passing minimum test ${index}`);
   if(task.verification.some(v=>v.result!=='passed')) errors.push(`${task.id}: failed or blocked verification`);
   const evidencePath=path.join(root,task.evidence);
   try {
    // Do not allow evidence symlinks to escape the checkout.
    const relative=path.relative(fs.realpathSync(root),fs.realpathSync(evidencePath));
    if(relative.startsWith('..')||path.isAbsolute(relative)) throw Error('Outside checkout');
    const text=fs.readFileSync(evidencePath,'utf8');
    for(const heading of ['Acceptance','Implementation','Tests','Limitations','Next dependency','O','R','P','V']) {
     if(!new RegExp(`^## ${heading}\\r?\\n\\s*\\S`,'m').test(text)) errors.push(`${task.id}: missing evidence section ${heading}`);
    }
    for(const command of task.verification.map(v=>v.command)) if(!text.includes(command)) errors.push(`${task.id}: command absent from evidence`);
   } catch { errors.push(`${task.id}: missing or unsafe evidence`); }
  }
  if(release&&task.status!=='done') errors.push(`${task.id}: ${task.status}`);
 }
 if(!fs.existsSync(path.join(root,ledger.specification))) errors.push('Digitization specification missing');
 const markdown=renderDigitizationTasks(tasks),target=path.join(root,'docs/digitization/TASKS.md');
 if(write&&!errors.length) fs.writeFileSync(target,markdown);
 else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==markdown) errors.push('Digitization TASKS.md is stale; run node scripts/digitization-tasks.mjs --write');
 return {errors,count:tasks.length,done:tasks.filter(t=>t.status==='done').length};
}
