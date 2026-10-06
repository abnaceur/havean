import {Controller,Get,Post,Req,Param,Body} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {validNotificationWorker} from '@haven/config';
import {notificationVersion} from '@haven/contracts';
import {data,fail,env} from '../platform/core.js';
import {alertTransaction} from './alert-service.js';
import {createAlertMailSender,type MailSender} from './mail-sender.js';
type Payload={messageId:string;email:string|null;title:string;body:string};
async function lock(c:pg.PoolClient,id:string){const first=(await c.query('SELECT v.agent_id,v.id FROM viewing_reminders r JOIN viewings v ON v.id=r.viewing_id WHERE r.id=$1',[id])).rows[0];if(!first)fail(404,'Reminder not found');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['viewing-agent:'+first.agent_id]);const v=(await c.query('SELECT * FROM viewings WHERE id=$1 FOR UPDATE',[first.id])).rows[0],r=(await c.query('SELECT * FROM viewing_reminders WHERE id=$1 FOR UPDATE',[id])).rows[0];return {v,r};}
async function recipient(c:pg.PoolClient,v:Record<string,any>){return (await c.query("SELECT p.email,p.email_verified,l.title FROM profiles p JOIN listings l ON l.id=$2 WHERE p.id=$1 AND p.state='active' AND l.agent_id=$3 AND rental_listing_available(l.id) AND EXISTS(SELECT 1 FROM public_viewing_schedule(l.id) s WHERE s.agent_id=l.agent_id) FOR SHARE OF p,l",[v.user_id,v.listing_id,v.agent_id])).rows[0];}
function current(v:Record<string,any>,r:Record<string,any>){return v.status==='confirmed'&&v.version===r.booking_version&&v.start_at>new Date();}
function summary(r:Record<string,any>){return {id:r.id,version:r.version,status:r.status,attempts:r.attempts,dueAt:new Date(r.due_at).toISOString(),acceptedAt:r.accepted_at?new Date(r.accepted_at).toISOString():null,errorCode:r.error_code};}
export class ViewingReminderService{
 constructor(private readonly mail:MailSender=createAlertMailSender(),private readonly afterAcceptance?:()=>Promise<void>){}
 async due(){return alertTransaction(async c=>data((await c.query("SELECT id,version FROM viewing_reminders WHERE due_at<=now() AND (status IN('queued','failed') AND attempts<5 OR status='processing' AND updated_at<now()-interval '60 seconds') ORDER BY due_at,id LIMIT 100")).rows));}
 async read(id:string){return alertTransaction(async c=>{const r=(await c.query('SELECT * FROM viewing_reminders WHERE id=$1',[id])).rows[0];if(!r)fail(404,'Reminder not found');return data(summary(r));});}
 async deliver(id:string,version:number){
  const prepared=await alertTransaction(async c=>{const {v,r}=await lock(c,id);if(r.version!==version||['accepted','in_app','cancelled'].includes(r.status)||r.due_at>new Date()||r.attempts>=5&&r.status!=='processing'||r.status==='processing'&&r.updated_at>new Date(Date.now()-60000))return {terminal:summary(r)};const profile=await recipient(c,v);if(!current(v,r)||!profile){const cancelled=(await c.query("UPDATE viewing_reminders SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];return {terminal:summary(cancelled)};}const when=new Intl.DateTimeFormat('en-GB',{timeZone:v.property_zone,dateStyle:'full',timeStyle:'short'}).format(v.start_at);const payload:Payload=r.payload??{messageId:'viewing-'+id+'@'+new URL(env.PUBLIC_WEB_URL).hostname,email:profile.email_verified&&z.email().safeParse(profile.email).success?profile.email:null,title:'Upcoming viewing: '+profile.title,body:'Your confirmed viewing is '+when+' ('+v.property_zone+'). Check your viewing calendar for the current booking.'};const next=(await c.query("UPDATE viewing_reminders SET status='processing',attempts=least(5,attempts+1),version=version+1,payload=$2,updated_at=now(),error_code=NULL WHERE id=$1 RETURNING *",[id,JSON.stringify(payload)])).rows[0];return {version:next.version,recovery:r.status==='processing'};});
  if(prepared.terminal)return data(prepared.terminal);
  return alertTransaction(async c=>{const {v,r}=await lock(c,id);if(r.version!==prepared.version||r.status!=='processing')return data(summary(r));const payload=r.payload as Payload;
   if(!current(v,r)||!await recipient(c,v)){const cancelled=(await c.query("UPDATE viewing_reminders SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];return data(summary(cancelled));}
   let receipt=null,sent=false;try{if(payload.email){receipt=await this.mail.lookup(payload.messageId);if(!receipt){const profile=await recipient(c,v);if(profile.email_verified&&profile.email===payload.email){if(r.attempts>=5&&prepared.recovery)throw Error('MAIL_ATTEMPTS_EXHAUSTED');receipt=await this.mail.send({messageId:payload.messageId,to:payload.email,subject:payload.title,text:payload.body});sent=true;}}}}catch{const failed=(await c.query("UPDATE viewing_reminders SET status='failed',error_code='MAIL_UNCONFIRMED',due_at=now()+make_interval(secs=>least(300,5*power(2,attempts)::int)),version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];return data(summary(failed));}
   if(sent&&this.afterAcceptance)await this.afterAcceptance();
   await c.query("INSERT INTO notifications(user_id,title,body,viewing_reminder_id,action_url,email_status,provider_message_id,acceptance_recorded_at) VALUES($1,$2,$3,$4,'/account/viewings',$5,$6,$7) ON CONFLICT(viewing_reminder_id) DO NOTHING",[r.user_id,payload.title,payload.body,id,receipt?'accepted':null,receipt?.messageId??null,receipt?new Date():null]);const saved=(await c.query("UPDATE viewing_reminders SET status=$2,provider_message_id=$3,accepted_at=$4,error_code=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id,receipt?'accepted':'in_app',receipt?.messageId??null,receipt?new Date():null])).rows[0];return data(summary(saved));
  });
 }
}
function service(req:FastifyRequest){if(!validNotificationWorker(req.method,req.url,req.body,req.headers,env.SESSION_KEY))fail(401,'Reminder service authorization is required','SERVICE_AUTH_REQUIRED');}
@Controller('api/v1')
export class ViewingReminderWorkerController{
 private readonly reminders=new ViewingReminderService();
 @Get('internal/viewing-reminders/due') async due(@Req() req:FastifyRequest){service(req);return this.reminders.due();}
 @Get('internal/viewing-reminders/:id') async read(@Req() req:FastifyRequest,@Param('id') id:string){service(req);z.uuid().parse(id);return this.reminders.read(id);}
 @Post('internal/viewing-reminders/:id/deliver') async deliver(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){service(req);z.uuid().parse(id);const x=notificationVersion.parse(body);return this.reminders.deliver(id,x.version);}
}
