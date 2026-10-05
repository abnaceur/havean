import {createConnection} from 'node:net';
import {once} from 'node:events';
import {fail} from '../platform/core.js';

export async function scanFile(body:Buffer){
 const socket=createConnection({host:process.env.SCANNER_HOST||'scanner',port:3310});
 const result=new Promise<string>((resolve,reject)=>{
  let message='';socket.setTimeout(45000,()=>socket.destroy(new Error('Scanner timeout')));
  socket.on('data',chunk=>{message+=chunk.toString('utf8');if(message.includes('\0')||message.includes('\n'))resolve(message);});
  socket.on('error',reject);socket.on('end',()=>resolve(message));
 });
 result.catch(()=>undefined);
 try{
  await once(socket,'connect');socket.write('zINSTREAM\0');
  for(let start=0;start<body.length;start+=65536){const chunk=body.subarray(start,start+65536),size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);if(!socket.write(Buffer.concat([size,chunk])))await once(socket,'drain');}
  socket.write(Buffer.alloc(4));const verdict=await result;
  if(verdict.includes('FOUND'))fail(400,'The upload failed the malware scan','UNSAFE_FILE');
  if(!/stream: OK/.test(verdict))fail(503,'File scanning is temporarily unavailable','SCANNER_UNAVAILABLE');
 }catch(error:any){if(error.getStatus)throw error;fail(503,'File scanning is temporarily unavailable','SCANNER_UNAVAILABLE');}
 finally{socket.destroy();}
}
