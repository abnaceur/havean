import {createHash} from 'node:crypto';
import type pg from 'pg';
import {pool,transaction} from '@haven/database';
type Stamp={revision:string;instant:Date;deadline:Date;actor:string|null;organization:string|null;privileged:boolean};
// Retain a private snapshot and copy its plain SQL/JSON values for each reader.
// Avoid the V8 wire codec on every hit while preserving Dates and exact money.
const entries=new Map<string,{revision:string;deadline:number;value:unknown}>(),pending=new Map<string,Promise<unknown>>(),maximumEntries=256,maximumBytes=200000,maximumAgeMs=60000;
function copySnapshot<T>(value:T):T{
 if(!value||typeof value!=='object')return value;
 if(value instanceof Date)return new Date(value.getTime()) as T;
 if(Array.isArray(value))return value.map(copySnapshot) as T;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return structuredClone(value);
 const copy:Record<string,unknown>=prototype===null?Object.create(null):{};
 for(const key in value){if(!Object.hasOwn(value,key))continue;const child=copySnapshot(value[key]);if(key==='__proto__')Object.defineProperty(copy,key,{value:child,enumerable:true,writable:true,configurable:true});else copy[key]=child;}
 return copy as T;
}
async function readStamp(c:pg.PoolClient):Promise<Stamp>{
 const stamp=(await c.query<Stamp>("SELECT s.*,nullif(current_setting('app.actor',true),'') AS actor,nullif(current_setting('app.org',true),'') AS organization,coalesce(current_setting('app.admin',true),'')='true' OR coalesce(current_setting('app.review',true),'')='true' OR coalesce(current_setting('app.support',true),'')='true' OR coalesce(current_setting('app.editor',true),'')='true' AS privileged FROM public_read_cache_stamp() s")).rows[0];
 if(stamp.actor||stamp.organization||stamp.privileged)throw new Error('PUBLIC_CACHE_REQUIRES_ANONYMOUS_SCOPE');
 return stamp;
}
type StampWaiter={resolve:(stamp:Stamp)=>void;reject:(error:unknown)=>void};
const stampWaiters:StampWaiter[]=[];let stampScheduled=false;
function scheduleStamp(){if(stampScheduled||!stampWaiters.length)return;stampScheduled=true;setImmediate(()=>{void flushStamp();});}
async function flushStamp(){
 // Select callers before starting SQL. Requests arriving after this batch starts
 // queue another read, so a later request cannot inherit an earlier SQL snapshot.
 const batch=stampWaiters.splice(0,256);stampScheduled=false;scheduleStamp();
 let client:pg.PoolClient|undefined;
 try{client=await pool.connect();const stamp=await readStamp(client);client.release();client=undefined;for(const waiter of batch)waiter.resolve({...stamp,instant:new Date(stamp.instant),deadline:new Date(stamp.deadline)});}
 catch(error){client?.release();for(const waiter of batch)waiter.reject(error);}
}
function anonymousStamp():Promise<Stamp>{return new Promise((resolve,reject)=>{stampWaiters.push({resolve,reject});scheduleStamp();});}
export async function publicRead<T>(c:pg.PoolClient,criteria:unknown,load:()=>Promise<T>,reuse:(value:T,instant:Date)=>T=value=>value):Promise<T>{return cached(await readStamp(c),criteria,load,reuse);}
/** Release the revision connection before waiting on another request's load. */
export async function anonymousPublicRead<T>(criteria:()=>unknown,load:(c:pg.PoolClient)=>Promise<T>,reuse:(value:T,instant:Date)=>T=value=>value):Promise<T>{
 const stamp=await anonymousStamp();
 return cached(stamp,criteria(),()=>transaction(null,load),reuse);
}
async function cached<T>(stamp:Stamp,criteria:unknown,load:()=>Promise<T>,reuse:(value:T,instant:Date)=>T):Promise<T>{
 const instant=stamp.instant.getTime(),key=createHash('sha256').update(JSON.stringify(criteria)).digest('hex'),existing=entries.get(key),valid=existing?.revision===stamp.revision&&existing.deadline>instant;
 if(valid)return reuse(copySnapshot(existing.value) as T,stamp.instant);
 const pendingKey=key+':'+stamp.revision+':'+stamp.deadline.toISOString();let request=pending.get(pendingKey);
 if(!request){request=(async()=>{const value=copySnapshot(await load());if(Buffer.byteLength(JSON.stringify(value))<=maximumBytes){entries.delete(key);while(entries.size>=maximumEntries)entries.delete(entries.keys().next().value!);entries.set(key,{revision:stamp.revision,deadline:Math.min(instant+maximumAgeMs,stamp.deadline.getTime()),value});}return value;})();pending.set(pendingKey,request);}
 try{return copySnapshot(await request) as T;}finally{if(pending.get(pendingKey)===request)pending.delete(pendingKey);}
}
