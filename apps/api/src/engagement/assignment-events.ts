import type pg from 'pg';
import type {Actor} from '@haven/database';
// Durable audit, event and recipient inbox notification share the caller's transaction.
export async function recordAssignmentEvent(c:pg.PoolClient,a:Actor,type:'listing'|'lead',id:string,payload:unknown){await c.query('INSERT INTO audit_events(actor_id,resource_id,action) VALUES($1,$2,$3)',[a.id,id,type+'.agent_assigned']);const e=(await c.query('INSERT INTO outbox(aggregate_id,kind,payload) VALUES($1,$2,$3) RETURNING id',[id,type+'.agent_assigned',JSON.stringify(payload)])).rows[0];await c.query('SELECT notify_agency_assignment($1,$2,$3)',[type,id,e.id]);}
