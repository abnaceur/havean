import {createHash} from 'node:crypto';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import type {Actor} from '@haven/database';
import type pg from 'pg';
import {fail,transaction} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {captureStorage} from './multipart.js';

/** No storage key is accepted from the caller or returned to the browser. Exact
 * revision/source-read RLS and live agency/target authority guard both boundaries.
 */
export async function readArtifactPreview(a:Actor,engine:string,artifactId:string){
 async function current(c:pg.PoolClient){
  await requireDigitizationAgency(c,a);await checkedWorkspace(c,engine);
  const artifact=(await c.query("SELECT id,version,checksum,object_key,byte_size::text,format FROM artifacts WHERE id=$1 AND digitization_id=$2 AND format='image/png'",[artifactId,engine])).rows[0];
  if(!artifact)fail(404,'Private source preview not found.');
  if(!/^[a-f0-9]{64}$/.test(artifact.checksum)||!/^\d{1,9}$/.test(artifact.byte_size)||Number(artifact.byte_size)<1||Number(artifact.byte_size)>32*1024*1024)fail(422,'Private preview exceeds its approved budget.','PREVIEW_INVALID');
  return artifact;
 }
 const artifact=await transaction(a,current),storage=captureStorage();
 let body:Buffer;
 try{
  const stored=await storage.send(new GetObjectCommand({Bucket:'haven-private',Key:artifact.object_key}),{abortSignal:AbortSignal.timeout(20000)});
  if(!stored.Body||String(stored.ContentLength)!==artifact.byte_size){(stored.Body as any)?.destroy?.();fail(422,'Private preview storage does not match.','PREVIEW_INVALID');}
  const chunks:Buffer[]=[];let bytes=0;const hash=createHash('sha256');
  for await(const chunk of stored.Body as AsyncIterable<Uint8Array>){bytes+=chunk.byteLength;if(bytes>Number(artifact.byte_size)){(stored.Body as any).destroy?.();fail(422,'Private preview storage does not match.','PREVIEW_INVALID');}chunks.push(Buffer.from(chunk));hash.update(chunk);}
  if(String(bytes)!==artifact.byte_size||hash.digest('hex')!==artifact.checksum)fail(422,'Private preview storage does not match.','PREVIEW_INVALID');
  body=Buffer.concat(chunks,bytes);
  if(!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail(422,'Private preview storage does not match.','PREVIEW_INVALID');
 }finally{storage.destroy();}
 await transaction(a,async c=>{const fresh=await current(c);if(JSON.stringify(fresh)!==JSON.stringify(artifact))fail(409,'The preview changed. Reload before viewing.','PREVIEW_CHANGED');});
 return body;
}
