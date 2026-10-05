import nodemailer from 'nodemailer';
import {z} from 'zod';
import {config} from '@haven/config';
export type AlertMail={messageId:string;to:string;subject:string;text:string};
export type MailAcceptance={messageId:string};
export interface MailSender{lookup(messageId:string):Promise<MailAcceptance|null>;send(mail:AlertMail):Promise<MailAcceptance>}
const accepted=z.object({status:z.literal('accepted'),messageId:z.string().min(1).max(255)});
export function createAlertMailSender(options:{mailApiUrl?:string;mailHost?:string;mailPort?:number}={}):MailSender{
 const env=config();if(env.NODE_ENV==='production'){
  const provider=env.MAIL_PROVIDER_URL!,headers={Authorization:'Bearer '+env.MAIL_PROVIDER_KEY};
  return {async lookup(key){const response=await fetch(provider+'/messages/'+encodeURIComponent(key),{headers,signal:AbortSignal.timeout(10000)});if(response.status===404)return null;if(!response.ok)throw Error('MAIL_LOOKUP_UNAVAILABLE');return accepted.parse(await response.json());},async send(mail){const response=await fetch(provider+'/messages',{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':mail.messageId},body:JSON.stringify({...mail,from:env.MAIL_FROM}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('MAIL_SEND_UNCONFIRMED');return accepted.parse(await response.json());}};
 }
 const api=options.mailApiUrl||'http://mail:8025',transport=nodemailer.createTransport({host:options.mailHost||'mail',port:options.mailPort||1025,secure:false,connectionTimeout:5000,socketTimeout:10000});
 return {async lookup(messageId){const response=await fetch(api+'/api/v1/search?query='+encodeURIComponent('message-id:'+messageId),{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('MAIL_LOOKUP_UNAVAILABLE');const result=await response.json() as {messages_count:number};return result.messages_count>0?{messageId}:null;},async send(mail){try{const result=await transport.sendMail({from:env.MAIL_FROM,to:mail.to,subject:mail.subject,text:mail.text,messageId:mail.messageId});if(!result.accepted.includes(mail.to))throw Error('MAIL_SEND_UNCONFIRMED');return {messageId:mail.messageId};}catch{throw Error('MAIL_SEND_UNCONFIRMED');}}};
}
