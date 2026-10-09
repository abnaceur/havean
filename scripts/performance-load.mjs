import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {setTimeout as sleep} from 'node:timers/promises';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {signGatewayClient} from '../packages/config/dist/bff-client.js';
const base=process.env.HAVEN_LOAD_URL,sessions=Number(process.env.HAVEN_LOAD_SESSIONS||100),duration=Number(process.env.HAVEN_LOAD_SECONDS||60),warmup=Number(process.env.HAVEN_LOAD_WARMUP||30),output=process.env.HAVEN_LOAD_REPORT;
if(!base||!output||!process.env.PUBLIC_WEB_URL||!process.env.SESSION_KEY||!Number.isInteger(warmup)||warmup<0||!Number.isInteger(sessions)||sessions<1||sessions>1000||!Number.isInteger(duration)||duration<1)throw new Error('Declare URL, report, 1–1000 sessions and duration');
const target=new URL(base);if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('Use a declared HTTP API endpoint without credentials');
const detail=process.env.HAVEN_LOAD_DETAIL||'q07-synthetic-1',requests=[['search','/api/v1/listings?city=bj&transaction=sale&sort=newest'],['search','/api/v1/listings?city=bj&transaction=sale&sort=price_asc'],['search','/api/v1/listings?city=bj&transaction=rent&sort=newest'],['detail','/api/v1/listings/'+detail+'?city=bj'],['detail','/api/v1/listings/'+detail+'?city=bj']];
const workers=Number(process.env.HAVEN_LOAD_WORKERS||1);if(!Number.isInteger(workers)||workers<1||workers>16||workers>sessions)throw Error('Declare 1–16 workers, no more than sessions');
const rows=[],failures={};
const shared=workerData||{startedAt:Date.now()+1000,first:0,count:sessions};
const measureWall=shared.startedAt+warmup*1000,endWall=measureWall+duration*1000;
async function user(id){let n=id;await sleep(Math.max(0,shared.startedAt-Date.now())+id%1000);while(Date.now()<endWall){const [kind,url]=requests[n++%requests.length],at=performance.now(),wallAt=Date.now();let status=0,error='';try{const response=await fetch(base+url,{headers:{'User-Agent':'Haven declared synthetic performance session '+id,'x-bff-origin':process.env.PUBLIC_WEB_URL,'x-haven-gateway-client':signGatewayClient({address:'198.18.'+Math.floor(id/250)+'.'+(id%250+1),origin:process.env.PUBLIC_WEB_URL,method:'GET',path:url.split('?')[0]},process.env.SESSION_KEY)},signal:AbortSignal.timeout(10000)});status=response.status;const body=await response.json();if(!response.ok||!Array.isArray(body.data)&&kind==='search'||kind==='detail'&&!body.data?.id)error='invalid-or-error-response';}catch{error='transport-or-timeout';}const elapsed=performance.now()-at;if(wallAt>=measureWall&&wallAt<endWall){rows.push({kind,ms:elapsed,status,error:!!error});if(error)failures[status||'transport']=(failures[status||'transport']||0)+1;}await sleep(Math.max(0,1000-(performance.now()-at)));}}
if(isMainThread&&workers>1){
 const results=await Promise.all(Array.from({length:workers},(_,index)=>new Promise((resolve,reject)=>{
  const first=Math.floor(index*sessions/workers),count=Math.floor((index+1)*sessions/workers)-first;
  const worker=new Worker(new URL(import.meta.url),{workerData:{...shared,first,count}});let received=false;
  worker.once('message',value=>{received=true;resolve(value);});worker.once('error',reject);worker.once('exit',code=>{if(code||!received)reject(Error('Load worker did not return complete measurements'));});
 })));
 for(const result of results){for(const row of result.rows)rows.push(row);for(const [key,count] of Object.entries(result.failures))failures[key]=(failures[key]||0)+count;}
}else{await Promise.all(Array.from({length:shared.count},(_,i)=>user(shared.first+i)));}
if(!isMainThread){parentPort.postMessage({rows,failures});}else{
const metrics=kind=>{const group=rows.filter(r=>!kind||r.kind===kind),times=group.map(r=>r.ms).sort((a,b)=>a-b),errors=group.filter(r=>r.error).length;return {requests:group.length,errors,errorPercent:group.length?errors/group.length*100:null,p50Ms:times.length?times[Math.ceil(times.length*.5)-1]:null,p95Ms:times.length?times[Math.ceil(times.length*.95)-1]:null,p99Ms:times.length?times[Math.ceil(times.length*.99)-1]:null};};
const search=metrics('search'),property=metrics('detail'),total=metrics(),report={label:'P',startedAt:new Date(shared.startedAt).toISOString(),completedAt:new Date().toISOString(),sessions,workers,warmupSeconds:warmup,measuredSeconds:duration,mix:{search:60,detail:40},thinkTime:'one request per session per second, sequential within session; slow responses reduce achieved rate',loadGenerator:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),node:process.version},search,detail:property,total,failures,targets:{searchP95Ms:500,detailP95Ms:300,errorPercent:1},meetsTargets:search.p95Ms!==null&&search.p95Ms<500&&property.p95Ms!==null&&property.p95Ms<300&&total.errorPercent<1};fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.meetsTargets)process.exitCode=1;

}
