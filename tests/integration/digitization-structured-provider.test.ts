import '../support/env';
import {afterAll,expect,it} from 'vitest';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pool} from '../../packages/database/src/index';
import {structuredSuggestions} from '../../apps/api/src/inventory/digitization/structured-provider';
afterAll(()=>pool.end());
it('optional private provider is disabled without configuration, validates scoped suggestions and refuses unsupported claims',async()=>{
 const keys=['DIGITIZATION_STRUCTURED_PROVIDER_ENABLED','DIGITIZATION_STRUCTURED_PROVIDER_ORIGIN','DIGITIZATION_STRUCTURED_PROVIDER_SHA256','DIGITIZATION_STRUCTURED_PROVIDER_KEY_FILE'],prior=keys.map(key=>process.env[key]);
 const directory=await mkdtemp(path.join(os.tmpdir(),'haven-structured-provider-')),keyFile=path.join(directory,'test-key'),profile='a'.repeat(64),key=Buffer.from('authored-functional-provider-key-not-a-secret-0000');
 const candidates=[{id:'10000000-0000-4000-8000-000000000001',field:'unitArea' as const,rawText:'Unit area 123.45 m2',normalizedValue:{amount:'123.45',unit:'m2' as const,basis:'document_unit_area' as const},evidence:[{assetId:'10000000-0000-4000-8000-000000000002',page:1,bbox:[.1,.1,.5,.2] as [number,number,number,number],coordinateSpace:'upright-page-normalized-top-left' as const,quotedText:'Unit area 123.45 m2'}]}];
 let requests=0,unsupported=false;
 const server=createServer(async(req,res)=>{requests++;const chunks=[];for await(const part of req)chunks.push(part);const body=JSON.parse(Buffer.concat(chunks).toString());expect(req.url).toBe('/v1/structured-proposals');expect(req.headers.authorization).toBe('Bearer '+key.toString('base64'));expect(body).toEqual({schemaVersion:1,providerSha256:profile,locale:'en',candidates});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schemaVersion:1,providerSha256:profile,candidateIds:[unsupported?'10000000-0000-4000-8000-000000000099':candidates[0].id]}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  for(const name of keys)delete process.env[name];
  expect((await structuredSuggestions(candidates,'en')).state).toBe('disabled');expect(requests).toBe(0);
  process.env.DIGITIZATION_STRUCTURED_PROVIDER_ENABLED='true';expect((await structuredSuggestions(candidates,'en')).state).toBe('unavailable');expect(requests).toBe(0);
  await writeFile(keyFile,key,{mode:0o600});
  Object.assign(process.env,{DIGITIZATION_STRUCTURED_PROVIDER_ORIGIN:'http://127.0.0.1:'+(server.address() as {port:number}).port,DIGITIZATION_STRUCTURED_PROVIDER_SHA256:profile,DIGITIZATION_STRUCTURED_PROVIDER_KEY_FILE:keyFile});
  const before=JSON.stringify(candidates);expect(await structuredSuggestions(candidates,'en')).toEqual({state:'validated',providerSha256:profile,candidateIds:[candidates[0].id],reviewRequired:true});
  unsupported=true;expect(await structuredSuggestions(candidates,'en')).toEqual({state:'rejected',providerSha256:profile,candidateIds:[],reviewRequired:true});expect(JSON.stringify(candidates)).toBe(before);
  process.env.DIGITIZATION_STRUCTURED_PROVIDER_ORIGIN='http://169.254.169.254';expect((await structuredSuggestions(candidates,'en')).state).toBe('unavailable');expect(requests).toBe(2);
 }finally{for(const [i,name] of keys.entries()){if(prior[i]===undefined)delete process.env[name];else process.env[name]=prior[i];}await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
