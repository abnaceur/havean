import {transaction,event} from '@haven/database';
import {workerActor} from './processor.js';
export async function expireScheduledListing(id:string,deadline:string,at=new Date()){
 return transaction(workerActor,async c=>{
  const result=(await c.query('SELECT expire_scheduled_listing($1,$2,$3) AS result',[id,deadline,at])).rows[0].result as {id:string;status:string;version:number}|null;
  if(result)await event(c,workerActor,id,'listing.expired',{version:result.version});
  return result;
 });
}
export async function dueExpirations(){return transaction(workerActor,async c=>(await c.query("SELECT id,version,expires_at::text AS deadline FROM listings WHERE status='published' AND expires_at<=now() ORDER BY expires_at,id LIMIT 100")).rows);}
