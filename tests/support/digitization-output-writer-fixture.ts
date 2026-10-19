import './env';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import type {Actor} from '../../packages/database/src/index';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import {collectCpuRenders} from '../../apps/api/src/inventory/digitization/execution-results';

const [payloadFile,markerFile]=process.argv.slice(2);
const payload=JSON.parse(readFileSync(payloadFile,'utf8')) as {actor:Actor;engine:string;stage:string;execution:string;fence:string;asset:string;origin:string;prefix:string};
const sdk=createRequire(new URL('../../apps/api/package.json',import.meta.url))('@aws-sdk/client-s3'),send=sdk.S3Client.prototype.send;
// Pause the real collector after its successful conditional write, before its
// artifact transaction. This override exists only in the owned fault process.
sdk.S3Client.prototype.send=async function(command:any,...args:any[]){
 const result=await send.call(this,command,...args);
 if(command instanceof sdk.PutObjectCommand&&command.input.Bucket==='haven-private'&&command.input.Key.startsWith(payload.prefix)&&command.input.IfNoneMatch==='*'){
  writeFileSync(markerFile,JSON.stringify({actualDerivedCopyCompleted:true}),{mode:0o600,flag:'wx'});
  for(;;)await new Promise(resolve=>setTimeout(resolve,1000));
 }
 return result;
};
try{
 const client=new CpuRunnerClient(payload.origin,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 await collectCpuRenders(payload.actor,payload.engine,payload.stage,payload.execution,payload.fence,payload.asset,client);process.exitCode=1;
}catch(error:any){
 const code=typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'DERIVED_COLLECTION_FAILED';
 writeFileSync(markerFile+'.failed',JSON.stringify({code}),{mode:0o600});process.exitCode=1;
}
