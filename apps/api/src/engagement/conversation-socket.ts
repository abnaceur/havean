import websocket from '@fastify/websocket';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {chatSocketCommand,messageHistoryQuery,type ChatMessageRecord} from '@haven/contracts';
import type {Actor} from '@haven/database';
import {Identity,env,fail} from '../platform/core.js';
import {authorizedConversation} from './conversations.js';
import {readMessages,persistMessage} from './messages.js';
const room=z.object({id:z.uuid()}).strict();
const selection=z.object({organizationId:z.uuid().optional()}).strict();
export async function replayConversation(a:Actor,id:string,after:string){
 const query=messageHistoryQuery.parse({after}),latest=(await readMessages(a,id,messageHistoryQuery.parse({limit:1}))).data.at(-1)?.sequence??'0';
 if(BigInt(after)>BigInt(latest))fail(400,'Replay sequence is beyond the saved history','INVALID_REPLAY_CURSOR');
 return readMessages(a,id,query);
}
export async function registerConversationSocket(server:FastifyInstance){
 const identity=new Identity();
 await server.register(websocket,{options:{maxPayload:32768,perMessageDeflate:false}});
 server.get('/api/v1/realtime/conversations/:id',{
  websocket:true,
  preValidation:async(req,reply)=>{
   if(req.headers.origin!==env.PUBLIC_WEB_URL&&req.headers.origin!==env.PUBLIC_OPS_URL){await reply.code(403).send({error:{code:'ORIGIN_REQUIRED',message:'Trusted application origin required'}});return;}
   try{const chosen=selection.parse(req.query);if(chosen.organizationId)req.headers['x-organization-id']=chosen.organizationId;const {id}=room.parse(req.params),a=await identity.actor(req);await authorizedConversation(a,id);}catch{await reply.code(404).send({error:{code:'CONVERSATION_UNAVAILABLE',message:'Conversation unavailable'}});}
  }
 },(socket,req)=>{
  const {id}=room.parse(req.params);let serial=Promise.resolve(),after:string|null=null,closed=false,ticking=false,minute=Date.now(),commands=0;
  function frame(value:unknown){if(closed||socket.readyState!==1)return;if(socket.bufferedAmount>1024*1024){socket.close(1013,'Reconnect to recover saved messages');return;}socket.send(JSON.stringify(value));}
  async function recover(a:Actor){if(after===null)return;let cursor:string=after;for(let page=0;page<20&&!closed;page++){const rows:ChatMessageRecord[]=(await replayConversation(a,id,cursor)).data;if(rows.length){cursor=rows.at(-1)!.sequence;after=cursor;frame({type:'messages',conversationId:id,messages:rows,after});}if(rows.length<100){frame({type:'caught_up',conversationId:id,after});return;}}}
  function schedule(work:()=>Promise<void>){serial=serial.then(work).catch(()=>socket.close(1008,'Conversation access unavailable'));}
  // Attach handlers synchronously before sending the first frame.
  socket.on('message',(raw:Buffer)=>{schedule(async()=>{
   const x=chatSocketCommand.parse(JSON.parse(raw.toString()));if(x.conversationId!==id)throw Error('ROOM_MISMATCH');
   const a=await identity.actor(req);await authorizedConversation(a,id);
   if(Date.now()-minute>=60000){minute=Date.now();commands=0;}if(++commands>120){frame({type:'error',code:'COMMAND_RATE_LIMITED',message:'Too many commands. Try again in a minute.'});return;}
   if(x.type==='subscribe'){after=x.after;frame({type:'subscribed',conversationId:id});await recover(a);return;}
   try{const result=await persistMessage(a,id,x.message);frame({type:'receipt',conversationId:id,message:result.data});await recover(a);}catch(e){const error=e as {getStatus?:()=>number;getResponse?:()=>{code?:string;message?:string}};if([401,403,404].includes(error.getStatus?.()??0))throw e;const body=error.getResponse?.();frame({type:'error',code:body?.code??'MESSAGE_NOT_CONFIRMED',message:body?.message??'Message was not confirmed. Retry the same client ID.'});}
  });});
  const timer=setInterval(()=>{if(closed||ticking)return;ticking=true;schedule(async()=>{try{const a=await identity.actor(req);await authorizedConversation(a,id);await recover(a);}finally{ticking=false;}});},1000);
  socket.on('close',()=>{closed=true;clearInterval(timer);});socket.on('error',()=>socket.close());
  frame({type:'subscribed',conversationId:id});
 });
}
