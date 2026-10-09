import fs from 'node:fs';
import {createHash} from 'node:crypto';
const [name,status]=process.argv.slice(2);
if(name==='--sanitized'){const file='evidence/ci/gates.json';if(fs.existsSync(file)){const report=JSON.parse(fs.readFileSync(file,'utf8'));for(const check of Object.values(report.checks)){check.rawSha256=check.sha256;check.sha256=createHash('sha256').update(fs.readFileSync(check.path)).digest('hex');}fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}process.exit(0);}
if(!/^[a-z-]+$/.test(name||'')||!['passed','failed'].includes(status))throw Error('Declare actual CI check name and outcome');
const file='evidence/ci/gates.json',log='evidence/ci/'+name+'.log';
if(!fs.existsSync(log))throw Error('CI_CHECK_LOG_REQUIRED');
const revision=process.env.HAVEN_SOURCE_REVISION||null;
const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,label:'P',sourceRevision:revision,checks:{}};
if(report.sourceRevision!==revision)throw Error('CI_REVISION_CHANGED_DURING_RUN');
report.checks[name]={status,completedAt:new Date().toISOString(),path:log,sha256:createHash('sha256').update(fs.readFileSync(log)).digest('hex')};
fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
