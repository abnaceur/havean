import {Controller,Patch,Req,Param,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {profileUpdate} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {Identity,env,transaction,idempotent,data,fail} from '../platform/core.js';
export async function ownProfile(c:pg.PoolClient,actor:Actor){
 const row=(await c.query('SELECT id,display_name AS "displayName",email,locale,version,email_verified AS "emailVerified",contact_synced_at AS "contactSyncedAt" FROM profiles WHERE id=$1 AND state=\'active\'',[actor.id])).rows[0];
 if(!row)fail(404,'Your active profile is unavailable');
 return {...row,roles:actor.roles,organizationId:actor.orgId,identityAccountUrl:env.OIDC_ISSUER.replace(/\/$/,'')+'/account/'};
}
@Controller('api/v1')
export class ProfileController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Patch('profiles/:id') async update(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.identity.actor(req);if(id!==actor.id)fail(404,'Editable profile not found');const input=profileUpdate.parse(body);
  return transaction(actor,c=>idempotent(c,actor,req,input,async()=>{
   const current=(await c.query('SELECT version FROM profiles WHERE id=$1 AND state=\'active\' FOR UPDATE',[actor.id])).rows[0];if(!current)fail(404,'Editable profile not found');if(current.version!==input.version)fail(409,'Your profile changed. Reload it before saving.','PROFILE_CHANGED');
   await c.query('UPDATE profiles SET display_name=$2,locale=$3,version=version+1 WHERE id=$1',[actor.id,input.displayName,input.locale]);await event(c,actor,actor.id,'account.profile_updated',{version:input.version+1});return data(await ownProfile(c,actor));
  }));
 }
}
