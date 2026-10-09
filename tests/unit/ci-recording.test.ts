import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
it('CI collector retains failure and binds sanitized logs to the actual run revision',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-ci-record-')),script=path.resolve('scripts/record-ci-check.mjs');
 const revision='a'.repeat(40),env={...process.env,HAVEN_SOURCE_REVISION:revision};
 try{
  fs.mkdirSync(path.join(root,'evidence/ci'),{recursive:true});
  const log=path.join(root,'evidence/ci/integration.log');fs.writeFileSync(log,'native assertion failed; synthetic pre-sanitization text\n');
  const invoke=(...args:string[])=>execFileSync(process.execPath,[script,...args],{cwd:root,env,stdio:'pipe'});
  invoke('integration','failed');const raw=JSON.parse(fs.readFileSync(path.join(root,'evidence/ci/gates.json'),'utf8'));
  fs.writeFileSync(log,'native assertion failed; [REDACTED]\n');invoke('--sanitized');
  const result=JSON.parse(fs.readFileSync(path.join(root,'evidence/ci/gates.json'),'utf8'));
  expect(result.sourceRevision).toBe(revision);expect(result.checks.integration.status).toBe('failed');
  expect(result.checks.integration.rawSha256).toBe(raw.checks.integration.sha256);
  expect(result.checks.integration.sha256).toBe(createHash('sha256').update(fs.readFileSync(log)).digest('hex'));
  expect(()=>invoke('unit','passed')).toThrow();
  expect(()=>execFileSync(process.execPath,[script,'integration','passed'],{cwd:root,env:{...env,HAVEN_SOURCE_REVISION:'b'.repeat(40)},stdio:'pipe'})).toThrow();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
