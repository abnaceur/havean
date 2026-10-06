import type pg from 'pg';
import type {FastifyRequest} from 'fastify';
import type {Actor} from '../../packages/database/src/index';
import {platformAccount} from '../../apps/api/src/administration/platform-users';
const administrator:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
// Fixture setup/cleanup uses the real versioned administration workflow. Never use
// this helper for a negative guard assertion or to revive a deletion request.
export async function fixtureAccountState(c:pg.PoolClient,state:'active'|'suspended',where:string,values:unknown[]=[]){
 const old=(await c.query("SELECT current_setting('app.actor',true) actor,current_setting('app.org',true) org,current_setting('app.admin',true) admin,current_setting('app.administration_reason',true) reason")).rows[0];
 await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org','',true),set_config('app.admin','true',true)",[administrator.id]);
 try{
  const records=(await c.query('SELECT id,state,version FROM profiles '+where+' ORDER BY id FOR UPDATE',values)).rows;
  for(const r of records){
   if(r.state===state)continue;
   const request={method:'POST',url:'/api/v1/ops/users/'+r.id+'/suspend',headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest;
   await platformAccount(c,administrator,request,r.id,{version:r.version,action:state==='active'?'reactivate':'suspend',reason:'Synthetic integration fixture account state setup or cleanup.'});
  }
 }finally{await c.query("SELECT set_config('app.actor',$1,true),set_config('app.org',$2,true),set_config('app.admin',$3,true),set_config('app.administration_reason',$4,true)",[old.actor||'',old.org||'',old.admin||'false',old.reason||'']);}
}
