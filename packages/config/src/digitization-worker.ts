import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)])):value;}
function signature(method:string,path:string,body:unknown,time:string,key:string){
 if(!/^[a-f0-9]{64}$/.test(key))throw Error('DIGITIZATION_WORKER_KEY_INVALID');
 const purpose=createHmac('sha256',Buffer.from(key,'hex')).update('haven-digitization-coordinator-v1').digest();
 return createHmac('sha256',purpose).update(time+'\n'+method+'\n'+path+'\n'+createHash('sha256').update(JSON.stringify(canonical(body??null))).digest('hex')).digest('hex');
}
export function digitizationWorkerHeaders(method:string,path:string,body:unknown,key:string,time=String(Date.now())){return {'x-digitization-timestamp':time,'x-digitization-signature':signature(method,path,body,time,key)};}
export function validDigitizationWorker(method:string,path:string,body:unknown,headers:Record<string,unknown>,key:string,now=Date.now()){
 const time=headers['x-digitization-timestamp'],provided=headers['x-digitization-signature'];
 if(!/^[a-f0-9]{64}$/.test(key)||typeof time!=='string'||!/^\d{13}$/.test(time)||Math.abs(now-Number(time))>60000||typeof provided!=='string'||!/^[a-f0-9]{64}$/.test(provided))return false;
 return timingSafeEqual(Buffer.from(signature(method,path,body,time,key),'hex'),Buffer.from(provided,'hex'));
}
