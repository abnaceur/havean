import websocket from '@fastify/websocket';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {Identity,env} from '../platform/core.js';
import {authorizedConversation} from './conversations.js';
const room=z.object({id:z.uuid()}).strict();
const selection=z.object({organizationId:z.uuid().optional()}).strict();
const subscribe=z.object({type:z.literal('subscribe'),conversationId:z.uuid()}).strict();
export async function registerConversationSocket(server:FastifyInstance){
 const identity=new Identity();
 await server.register(websocket,{options:{maxPayload:8192,perMessageDeflate:false}});
 server.get('/api/v1/realtime/conversations/:id',{
  websocket:true,
  preValidation:async(req,reply)=>{
   if(req.headers.origin!==env.PUBLIC_WEB_URL&&req.headers.origin!==env.PUBLIC_OPS_URL){await reply.code(403).send({error:{code:'ORIGIN_REQUIRED',message:'Trusted application origin required'}});return;}
   try{const chosen=selection.parse(req.query);if(chosen.organizationId)req.headers['x-organization-id']=chosen.organizationId;const {id}=room.parse(req.params),a=await identity.actor(req);await authorizedConversation(a,id);}catch{await reply.code(404).send({error:{code:'CONVERSATION_UNAVAILABLE',message:'Conversation unavailable'}});}
  }
 },(socket,req)=>{
  const {id}=room.parse(req.params);
  // The URL is the single authorized room; client messages cannot join another ID.
  socket.send(JSON.stringify({type:'subscribed',conversationId:id}));
  let serial=Promise.resolve();
  socket.on('message',(raw:Buffer)=>{serial=serial.then(async()=>{try{const x=subscribe.parse(JSON.parse(raw.toString()));if(x.conversationId!==id)throw Error('ROOM_MISMATCH');await authorizedConversation(await identity.actor(req),id);socket.send(JSON.stringify({type:'subscribed',conversationId:id}));}catch{socket.close(1008,'Conversation access unavailable');}});});
  socket.on('error',()=>socket.close());
 });
}
