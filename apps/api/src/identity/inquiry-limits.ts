import {createHmac} from 'node:crypto';
import type pg from 'pg';
import {env,fail} from '../platform/core.js';
export const inquiryLimits={windowSeconds:600,guest:5,account:30,guestSessions:60,guestAddress:60} as const;
export function inquiryFingerprint(purpose:string,value:string){return createHmac('sha256',Buffer.from(env.SESSION_KEY,'hex')).update('haven-inquiry-v1:'+purpose+':'+value).digest('hex');}
export async function admitInquiry(c:pg.PoolClient,limits:{purpose:string;value:string;maximum:number}[]){const keys=limits.map(l=>({...l,fingerprint:inquiryFingerprint(l.purpose,l.value)})).sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));const time=(await c.query("SELECT to_timestamp(floor(extract(epoch FROM statement_timestamp())/600)*600) AS start")).rows[0];for(const l of keys){const r=(await c.query('SELECT * FROM consume_inquiry_rate($1,$2,$3)',[l.fingerprint,l.maximum,time.start])).rows[0];if(r.used_count>l.maximum)fail(429,'This inquiry limit has been reached. Try again after '+new Date(r.reset_at).toISOString()+'.','INQUIRY_RATE_LIMITED');}}
