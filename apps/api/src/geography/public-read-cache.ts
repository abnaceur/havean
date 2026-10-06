import {createHash} from 'node:crypto';
import type pg from 'pg';
import {pool,transaction} from '@haven/database';
type Stamp={revision:string;instant:Date;deadline:Date;actor:string|null;organization:string|null;privileged:boolean};
const entries=new Map<string,{revision:string;deadline:number;value:unknown}>(),pending=new Map<string,Promise<unknown>>(),maximumEntries=256,maximumBytes=200000,maximumAgeMs=60000;
async function readStamp(c:pg.PoolClient):Promise<Stamp>{
 const stamp=(await c.query<Stamp>("SELECT s.*,nullif(current_setting('app.actor',true),'') AS actor,nullif(current_setting('app.org',true),'') AS organization,coalesce(current_setting('app.admin',true),'')='true' OR coalesce(current_setting('app.review',true),'')='true' OR coalesce(current_setting('app.support',true),'')='true' OR coalesce(current_setting('app.editor',true),'')='true' AS privileged FROM public_read_cache_stamp() s")).rows[0];
 if(stamp.actor||stamp.organization||stamp.privileged)throw new Error('PUBLIC_CACHE_REQUIRES_ANONYMOUS_SCOPE');
 return stamp;
}
export async function publicRead<T>(c:pg.PoolClient,criteria:unknown,load:()=>Promise<T>,reuse:(value:T,instant:Date)=>T=value=>value):Promise<T>{return cached(await readStamp(c),criteria,load,reuse);}
/** Release the revision connection before waiting on another request's load. */
export async function anonymousPublicRead<T>(criteria:()=>unknown,load:(c:pg.PoolClient)=>Promise<T>,reuse:(value:T,instant:Date)=>T=value=>value):Promise<T>{
 const client=await pool.connect();let stamp:Stamp;try{stamp=await readStamp(client);}finally{client.release();}
 return cached(stamp,criteria(),()=>transaction(null,load),reuse);
}
async function cached<T>(stamp:Stamp,criteria:unknown,load:()=>Promise<T>,reuse:(value:T,instant:Date)=>T):Promise<T>{
 const instant=stamp.instant.getTime(),key=createHash('sha256').update(JSON.stringify(criteria)).digest('hex'),existing=entries.get(key),valid=existing?.revision===stamp.revision&&existing.deadline>instant;
 if(valid)return reuse(structuredClone(existing.value) as T,stamp.instant);
 const pendingKey=key+':'+stamp.revision+':'+stamp.deadline.toISOString();let request=pending.get(pendingKey);
 if(!request){request=(async()=>{const value=await load();if(Buffer.byteLength(JSON.stringify(value))<=maximumBytes){entries.delete(key);while(entries.size>=maximumEntries)entries.delete(entries.keys().next().value!);entries.set(key,{revision:stamp.revision,deadline:Math.min(instant+maximumAgeMs,stamp.deadline.getTime()),value:structuredClone(value)});}return value;})();pending.set(pendingKey,request);}
 try{return structuredClone(await request) as T;}finally{if(pending.get(pendingKey)===request)pending.delete(pendingKey);}
}
