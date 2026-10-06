import type pg from 'pg';
import type {Actor} from '@haven/database';
export async function notifyInquiryTeam(c:pg.PoolClient,a:Actor|null,id:string){await c.query('INSERT INTO audit_events(actor_id,resource_id,action) VALUES($1,$2,\'inquiry.routed\')',[a?.id??null,id]);const e=(await c.query("INSERT INTO outbox(aggregate_id,kind,payload) VALUES($1,'inquiry.routed','{}'::jsonb) RETURNING id",[id])).rows[0];await c.query('SELECT notify_inquiry_destination($1,$2)',[id,e.id]);}
