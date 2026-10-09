import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {login,apiRequest} from '../support/browser';
import {execFileSync} from 'node:child_process';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),pg=requireApi('pg');
const environment=Object.fromEntries(readFileSync(process.env.HAVEN_ENV_FILE||'.env','utf8').trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
test('HE-R04 real server session stream resumes by cursor and terminates on session expiry',async({page})=>{
 await login(page,'agent','http://localhost:8089','/ops');const created=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true});expect(created.status()).toBe(201);const workspace=(await created.json()).data,path='/api/v1/ops/digitization-intakes/'+workspace.id+'/events';
 const first=await page.evaluate(async path=>{const response=await fetch(path),reader=response.body!.getReader();let text='';while(!text.includes('digitization.intake_created')){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value);}await reader.cancel();return {status:response.status,text};},path);expect(first.status).toBe(200);expect(first.text).toContain('digitization.intake_created');const cursor=/id: (\d+)/.exec(first.text)![1];
 await page.evaluate(async ({path,cursor})=>{const response=await fetch(path,{headers:{'Last-Event-ID':cursor}}),reader=response.body!.getReader();const w=window as any;w.engineStreamText='';w.engineStreamClosed=false;w.engineStreamReader=reader;w.engineStreamTask=(async()=>{try{while(true){const part=await reader.read();if(part.done)break;w.engineStreamText+=new TextDecoder().decode(part.value);}}finally{w.engineStreamClosed=true;}})();},{path,cursor});
 await expect.poll(()=>page.evaluate(()=>(window as any).engineStreamText)).toContain('heartbeat');expect(await page.evaluate(()=>(window as any).engineStreamText)).not.toContain('digitization.intake_created');
 const ticket=(await page.context().cookies('http://localhost:8089')).find(c=>c.name==='haven_session')!.value,pool=new pg.Pool({connectionString:environment.MIGRATION_DATABASE_URL});try{await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[ticket]);}finally{await pool.end();}
 await expect.poll(()=>page.evaluate(()=>(window as any).engineStreamClosed),{timeout:12000}).toBe(true);expect((await page.request.get('http://localhost:8089'+path)).status()).toBe(401);
});

test('HE-C09 real persisted run timeline resumes through BFF and revoking membership closes its active stream',async({page})=>{
 await login(page,'agent','http://localhost:8089','/ops');
 const created=await apiRequest(page,'/ops/digitization-intakes',{authorityConfirmed:true});expect(created.status()).toBe(201);
 const workspace=(await created.json()).data,path='/api/v1/ops/digitization-intakes/'+workspace.id+'/events';
 const cursor=await page.evaluate(async path=>{const response=await fetch(path),reader=response.body!.getReader();let text='';while(!text.includes('digitization.intake_created')){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value);}await reader.cancel();return /id: (\d+)/.exec(text)![1];},path);
 const actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001'};
 const fixtures=new pg.Pool({connectionString:environment.MIGRATION_DATABASE_URL});
 try{
  // A real draft is persisted by API domain code, with no source/output claims.
  // Its empty input cannot be executed until an authorized source is bound.
  const {runId}=JSON.parse(execFileSync(process.execPath,['--import','tsx','tests/support/digitization-progress-fixture.ts',workspace.id],{encoding:'utf8',env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json'}}));
  await page.evaluate(async({path,cursor})=>{const response=await fetch(path,{headers:{'Last-Event-ID':cursor}}),reader=response.body!.getReader(),w=window as any;w.progressText='';w.progressClosed=false;w.progressTask=(async()=>{try{for(;;){const part=await reader.read();if(part.done)break;w.progressText+=new TextDecoder().decode(part.value);}}finally{w.progressClosed=true;}})();},{path,cursor});
  await expect.poll(()=>page.evaluate(()=>(window as any).progressText)).toContain('digitization.run_created');
  const text=await page.evaluate(()=>(window as any).progressText);expect(text).toContain(runId);expect(text).toContain('"state":"draft"');expect(text).not.toContain('digitization.intake_created');expect(text).not.toContain('input_fingerprint');
  await fixtures.query("UPDATE memberships SET status='inactive',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[actor.id,actor.orgId]);
  await expect.poll(()=>page.evaluate(()=>(window as any).progressClosed),{timeout:12000}).toBe(true);
  expect((await page.request.get('http://localhost:8089'+path)).status()).toBe(403);
 }finally{
  await fixtures.query("UPDATE memberships SET status='active',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role='agent'",[actor.id,actor.orgId]);
  await fixtures.end();
 }
});
