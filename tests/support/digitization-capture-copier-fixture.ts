import './env';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {admitCapturedSource} from '../../apps/api/src/inventory/digitization/capture-source';
import type {Actor} from '../../packages/database/src/index';

// Test-process fault boundary only: run the real copier and pause immediately
// after its actual conditional storage write. No production hook is introduced.
const [payloadFile,markerFile]=process.argv.slice(2);
const payload=JSON.parse(readFileSync(payloadFile,'utf8')) as {actor:Actor;engine:string;capture:string;body:{workspaceVersion:number;captureVersion:number};reservation:{assetId:string;leaseId:string};copiedKey:string};
const sdk=createRequire(new URL('../../apps/api/package.json',import.meta.url))('@aws-sdk/client-s3');
const send=sdk.S3Client.prototype.send;
sdk.S3Client.prototype.send=async function(command:any,...args:any[]){
 const result=await send.call(this,command,...args);
 if(command instanceof sdk.PutObjectCommand&&command.input.Bucket==='haven-private'&&command.input.Key===payload.copiedKey&&command.input.IfNoneMatch==='*'){
  writeFileSync(markerFile,JSON.stringify({actualConditionalCopyCompleted:true}),{mode:0o600,flag:'wx'});
  for(;;)await new Promise(resolve=>setTimeout(resolve,1000));
 }
 return result;
};
try{await admitCapturedSource(payload.actor,payload.engine,payload.capture,payload.body,payload.reservation);process.exitCode=1;}
catch{process.exitCode=1;}
