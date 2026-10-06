import {Controller,Post,Req,Body,Inject} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {inquirySchema,guestInquiry} from '@haven/contracts';
import type {z} from 'zod';
import {event,type Actor} from '@haven/database';
import {Identity,cookie,transaction,idempotent,data,fail} from '../platform/core.js';
import {activeInquiryGuest,inquiryClientAddress} from '../identity/inquiry-sessions.js';
import {admitInquiry,inquiryLimits} from '../identity/inquiry-limits.js';
import {inquiryDestination} from './inquiry-destinations.js';
import {notifyInquiryTeam} from './inquiry-routing.js';
type Inquiry=z.infer<typeof inquirySchema>;
async function persist(c:pg.PoolClient,a:Actor|null,sessionId:string|null,x:Inquiry){
 const target=await inquiryDestination(c,x);
 const lead=(await c.query('INSERT INTO leads(user_id,guest_session_id,organization_id,agent_id,resource_id,resource_type,name,email,phone,message,floor_plan_id,inquiry_intent,resource_version,floor_plan_version,consent_at,consent_policy_version,inquiry_city) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,statement_timestamp(),$15,$16) RETURNING id,status,created_at',[a?.id??null,sessionId,target.organization_id,target.agent_id,x.resourceId,x.resourceType,x.name,x.email,x.phone,x.message,x.floorPlanId??null,x.intent,target.version,x.floorPlanVersion??null,x.consentPolicyVersion,target.city])).rows[0];
 let conversationId:string|null=null;
 if(a){conversationId=(await c.query('INSERT INTO conversations(user_id,organization_id,agent_id,resource_id) VALUES($1,$2,$3,$4) RETURNING id',[a.id,target.organization_id,target.agent_id,x.resourceId])).rows[0].id;await c.query('UPDATE leads SET conversation_id=$2 WHERE id=$1',[lead.id,conversationId]);}
 await event(c,a,lead.id,'inquiry.submitted',{resourceId:x.resourceId});
 await notifyInquiryTeam(c,a,lead.id);
 return data({...lead,created_at:new Date(lead.created_at).toISOString(),conversationId});
}
export async function submitAccountInquiry(a:Actor,req:FastifyRequest,x:Inquiry){return transaction(a,c=>idempotent(c,a,req,x,async()=>{await admitInquiry(c,[{purpose:'account',value:a.id,maximum:inquiryLimits.account},{purpose:'contact',value:x.email,maximum:inquiryLimits.account}]);return persist(c,a,null,x);}));}
@Controller('api/v1')
export class GuestInquiriesController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('guest-inquiries') async submit(@Req() req:FastifyRequest,@Body() body:unknown){
  if(cookie(req,'haven_session')){await this.identity.actor(req);fail(400,'Use your signed-in account to send this inquiry','ACCOUNT_INQUIRY_REQUIRED');}
  const x=guestInquiry.parse(body),address=inquiryClientAddress(req),key=req.headers['idempotency-key'];
  if(typeof key!=='string'||key.length<8||key.length>100)fail(400,'A valid Idempotency-Key is required');
  const canonical=Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)));
  const hash=createHash('sha256').update(JSON.stringify({method:req.method,path:req.url,body:canonical})).digest('hex');
  return transaction(null,async c=>{const session=await activeInquiryGuest(c,req,x.sessionVersion);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['guest-inquiry:'+session.id+':'+key]);
   const prior=(await c.query('SELECT request_hash,response FROM guest_inquiry_requests WHERE session_id=$1 AND key=$2',[session.id,key])).rows[0];
   if(prior){if(prior.request_hash!==hash)fail(409,'This request key was already used with different data','IDEMPOTENCY_CONFLICT');return prior.response;}
   await admitInquiry(c,[{purpose:'guest',value:session.id,maximum:inquiryLimits.guest},{purpose:'contact',value:x.email,maximum:inquiryLimits.guest},{purpose:'guest-address',value:address,maximum:inquiryLimits.guestAddress}]);
   const result=await persist(c,null,session.id,x);
   await c.query('INSERT INTO guest_inquiry_requests(session_id,key,request_hash,lead_id,response) VALUES($1,$2,$3,$4,$5)',[session.id,key,hash,result.data.id,JSON.stringify(result)]);
   return result;
  });
 }
}
