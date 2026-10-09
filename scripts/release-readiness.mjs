import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const requiredGates=['marketplaceJourneys','managementIntegrity','englishVisualApproval','responsiveAccessibility','securityProviders','performance','httpsStaging','offHostRecovery','applicationRollback','cleanCheckoutDocumentation','remoteCi'];
const ciChecks=['install','credentials','tasks','fixtures','contracts','reference','licenses','lint','types','unit','visual','integration','browser','build'];
function fileWithin(root,file){if(typeof file!=='string'||!file.startsWith('evidence/')||file.split('/').includes('..')||file.includes('\\'))throw Error('Release evidence must remain under evidence/');return path.join(root,file);}

function repositoryRevision(root){try{let directory=path.join(root,'.git');if(fs.statSync(directory).isFile()){const match=/^gitdir: (.+)\s*$/.exec(fs.readFileSync(directory,'utf8'));if(!match)return null;directory=path.resolve(root,match[1]);}const head=fs.readFileSync(path.join(directory,'HEAD'),'utf8').trim();if(/^[a-f0-9]{40}$/.test(head))return head;const ref=/^ref: (refs\/[a-zA-Z0-9._/-]+)$/.exec(head)?.[1];if(!ref||ref.split('/').includes('..'))return null;try{return fs.readFileSync(path.join(directory,ref),'utf8').trim();}catch{const rows=fs.readFileSync(path.join(directory,'packed-refs'),'utf8').split('\n');return rows.find(l=>l.endsWith(' '+ref))?.split(' ')[0]||null;}}catch{return null;}}
export function validateReleaseReadiness({root=process.cwd(),ledgerFile='evidence/release/readiness.json',sourceRevision=process.env.HAVEN_SOURCE_REVISION||null}={}){
 sourceRevision=sourceRevision||repositoryRevision(root);
 const errors=[];if(!sourceRevision)errors.push('Cannot identify the exact release source revision');let report;try{report=JSON.parse(fs.readFileSync(path.resolve(root,ledgerFile),'utf8'));}catch{return ['Missing mandatory release readiness ledger'];}
 if(report.version!==1||report.label!=='P')errors.push('Invalid release readiness ledger');
 for(const name of requiredGates){const gate=report.gates?.[name];if(gate?.status!=='passed'){errors.push(name+': '+(gate?.status||'missing')+'; mandatory release gate unfinished');continue;}try{const data=fs.readFileSync(fileWithin(root,gate.path));if(createHash('sha256').update(data).digest('hex')!==gate.sha256)errors.push(name+': evidence changed or checksum missing');}catch{errors.push(name+': required evidence missing or outside evidence/');}}
 // A green manual checklist cannot replace actual outcomes of the full test run.
 let ci;try{ci=JSON.parse(fs.readFileSync(path.join(root,'evidence/ci/gates.json'),'utf8'));}catch{errors.push('Missing mandatory recorded CI/test outcomes');return errors;}
 if(ci.version!==1||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(ci.sourceRevision||''))errors.push('Missing exact tested CI source revision');
 if(sourceRevision&&ci.sourceRevision!==sourceRevision)errors.push('CI outcomes belong to another source revision');
 for(const name of ciChecks){const check=ci.checks?.[name];if(check?.status!=='passed'){errors.push('CI '+name+': '+(check?.status||'missing'));continue;}try{if(createHash('sha256').update(fs.readFileSync(fileWithin(root,check.path))).digest('hex')!==check.sha256)errors.push('CI '+name+': log changed or checksum missing');}catch{errors.push('CI '+name+': test evidence missing');}}
 return errors;
}
if(process.argv[1]?.endsWith('release-readiness.mjs')){const errors=validateReleaseReadiness();if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('All mandatory release and full CI/test evidence gates passed.');}
