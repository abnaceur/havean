import {Controller,Get,Post,Req,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {deletionRequest} from '@haven/contracts';
import {event} from '@haven/database';
import {Identity,transaction,idempotent,data,fail} from '../platform/core.js';
export const accountRetention={version:1 as const,exportRecordLimit:2000,classes:[
 {category:'Optional preferences and browsing activity',handling:'Disabled when access ends; reviewed for removal with the deletion request.'},
 {category:'Personal profile, inquiries, messages and requests',handling:'Reviewed for removal or anonymization, subject to open obligations and authorized retention.'},
 {category:'Posted charges, payments, allocations, deposits and reversals',handling:'Preserved for bookkeeping and required history. No automatic financial deletion.'},
 {category:'Audit history and deletion request',handling:'Preserved to document actions and retention decisions.'},
 {category:'Identity-provider account',handling:'Managed by the sign-in service; Haven access is revoked immediately.'}
]};
// Explicit personal-data projections. Organization access never broadens a personal export.
const datasets:Record<string,string>={
 memberships:'SELECT id,organization_id,role,status FROM memberships WHERE user_id=$1 ORDER BY id',
 ownerSubmissions:`SELECT id,status,listing_id,version,wizard_step,asking_price::text,currency,rent_period,created_at,(SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(data) WHERE key IN('title','transaction','districtId','communityId','area','beds','livingRooms','price','description','contact','contactAudience','city','currency','rentPeriod','consent','photos','documents','documentTypes')) data FROM owner_submissions WHERE user_id=$1 ORDER BY id`,
 ownedListings:'SELECT id,unit_id,slug,title,description,transaction,segment,currency,price::text,status,version FROM listings WHERE owner_id=$1 ORDER BY id',
 ownedPrivateUnits:'SELECT d.unit_id,d.private_address,d.version,d.private_latitude::text,d.private_longitude::text FROM unit_private_details d WHERE EXISTS(SELECT 1 FROM listings l WHERE l.unit_id=d.unit_id AND l.owner_id=$1) ORDER BY d.unit_id',
 ownedUnits:'SELECT u.id,u.area::text,u.beds,u.living_rooms,u.baths,u.orientation,u.floor,u.elevator FROM units u WHERE EXISTS(SELECT 1 FROM listings l WHERE l.unit_id=u.id AND l.owner_id=$1) ORDER BY u.id',
 managementGrants:'SELECT id,organization_id,unit_id,expires_at FROM management_grants WHERE owner_id=$1 ORDER BY id',
 mediaMetadata:'SELECT id,listing_id,mime,size::text,rights,visibility,status,width,height,purpose,duration::text,created_at FROM media_assets WHERE owner_id=$1 ORDER BY id',
 listingViewActivity:'SELECT id,listing_id,listing_version,recorded_at,view_day FROM listing_view_events WHERE user_id=$1 ORDER BY id',
 tenantProfiles:'SELECT id,name,email FROM tenants WHERE user_id=$1 ORDER BY id',
 tenantAllocations:'SELECT a.id,a.payment_id,a.charge_id,a.amount::text,a.reversed_at,a.created_at FROM allocations a JOIN payments p ON p.id=a.payment_id JOIN leases l ON l.id=p.lease_id JOIN tenants t ON t.id=l.tenant_id WHERE t.user_id=$1 ORDER BY a.id',
 favorites:'SELECT listing_id,saved,version,created_at FROM favorites WHERE user_id=$1 ORDER BY listing_id',
 savedSearches:'SELECT id,name,filters,cadence,paused,version,criteria_version,deleted_at,created_at,updated_at FROM saved_searches WHERE user_id=$1 ORDER BY id',
 browsingHistory:'SELECT listing_id,viewed_at FROM browsing_history WHERE user_id=$1 ORDER BY listing_id',
 browsingPreferences:'SELECT enabled,version FROM browsing_history_settings WHERE user_id=$1',
 recentSearches:'SELECT id,city,query,version,updated_at FROM recent_searches WHERE user_id=$1 ORDER BY id',
 notificationPreferences:'SELECT email_enabled,in_app_enabled,version FROM notification_preferences WHERE user_id=$1',
 notifications:'SELECT id,title,body,read_at,version,created_at FROM notifications WHERE user_id=$1 ORDER BY id',
 alertDeliveries:'SELECT id,search_id,cadence,period_start,due_at,status,version,attempts,acceptance_recorded_at,error_code,created_at FROM alert_digests WHERE user_id=$1 ORDER BY id',
 ownerGrants:'SELECT id,unit_id,status,version,source,expires_at,created_at FROM owner_unit_grants WHERE owner_id=$1 ORDER BY id',
 ownerContacts:'SELECT listing_id,contact,audience,version FROM listing_owner_contacts WHERE owner_id=$1 ORDER BY listing_id',
 inquiries:'SELECT id,resource_id,resource_type,name,email,phone,message,status,version,resource_version,commercial_context,created_at FROM leads WHERE user_id=$1 ORDER BY id',
 viewings:'SELECT id,listing_id,start_at,end_at,status,version FROM viewings WHERE user_id=$1 ORDER BY id',
 conversations:'SELECT id,resource_id,created_at FROM conversations WHERE user_id=$1 ORDER BY id',
 sentMessages:'SELECT m.id,m.conversation_id,m.client_id,m.sequence::text,m.body,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.sender_id=$1 AND c.user_id=$1 ORDER BY m.id',
 quotes:'SELECT id,description,budget::text,status,version,created_at FROM quotes WHERE user_id=$1 ORDER BY id',
 supportRequests:'SELECT id,subject,description,category,status,public_reply,version,created_at FROM support_cases WHERE user_id=$1 ORDER BY id',
 maintenanceRequests:'SELECT id,lease_id,title,description,category,urgency,status,public_note,version,created_at FROM maintenance WHERE user_id=$1 ORDER BY id',
 tenantLeases:'SELECT l.id,l.start_date,l.end_date,l.rent::text,l.currency,l.status,l.version FROM leases l JOIN tenants t ON t.id=l.tenant_id WHERE t.user_id=$1 ORDER BY l.id',
 tenantCharges:'SELECT c.id,c.lease_id,c.period,c.due_date,c.amount::text,c.currency,c.kind,c.status,c.reverses_id,c.created_at FROM charges c JOIN leases l ON l.id=c.lease_id JOIN tenants t ON t.id=l.tenant_id WHERE t.user_id=$1 ORDER BY c.id',
 tenantPayments:'SELECT p.id,p.lease_id,p.amount::text,p.currency,p.source,p.reference,p.status,p.reverses_id,p.created_at FROM payments p JOIN leases l ON l.id=p.lease_id JOIN tenants t ON t.id=l.tenant_id WHERE t.user_id=$1 ORDER BY p.id',
 tenantDeposits:'SELECT d.id,d.lease_id,d.kind,d.amount::text,d.currency,d.reason,d.created_at FROM deposits d JOIN leases l ON l.id=d.lease_id JOIN tenants t ON t.id=l.tenant_id WHERE t.user_id=$1 ORDER BY d.id'
};
@Controller('api/v1')
export class PrivacyController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('me/privacy') async policy(@Req() req:FastifyRequest){await this.identity.actor(req);return data(accountRetention);}
 @Get('me/export') async export(@Req() req:FastifyRequest){const actor=await this.identity.actor(req);return transaction(actor,async c=>{
  // A single SQL statement supplies one consistent snapshot; over-limit exports fail in full.
  const projections=Object.entries(datasets).map(([name,query])=>`(SELECT coalesce(jsonb_agg(to_jsonb(record)),'[]'::jsonb) FROM (${query} LIMIT 2001) record) AS "${name}"`);
  const row=(await c.query(`SELECT (SELECT jsonb_build_object('id',id,'displayName',display_name,'email',email,'locale',locale,'version',version,'emailVerified',email_verified) FROM profiles WHERE id=$1 AND state='active') profile,${projections.join(',')}`,[actor.id])).rows[0];if(!row.profile)fail(401,'Your account is no longer active.','SESSION_EXPIRED');const {profile,...records}=row;if(Object.values(records).some(value=>(value as unknown[]).length>accountRetention.exportRecordLimit))fail(413,'Your personal export exceeds the online record limit. Contact support for a complete export.','EXPORT_LIMIT_EXCEEDED');return data({schemaVersion:1,generatedAt:new Date().toISOString(),profile,records,retention:accountRetention});
 });}
 @Post('me/deletion-requests') async requestDeletion(@Req() req:FastifyRequest,@Body() body:unknown){const actor=await this.identity.actor(req),input=deletionRequest.parse(body);return transaction(actor,c=>idempotent(c,actor,req,input,async()=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['optional-alerts:'+actor.id]);const profile=(await c.query("SELECT version FROM profiles WHERE id=$1 AND state='active' FOR UPDATE",[actor.id])).rows[0];if(!profile)fail(401,'Your account is no longer active.','SESSION_EXPIRED');if(profile.version!==input.version)fail(409,'Your profile changed. Reload before requesting deletion.','PROFILE_CHANGED');const row=(await c.query('SELECT * FROM request_own_account_deletion($1,$2)',[input.version,input.reason])).rows[0];if(!row)fail(409,'Your profile changed. Reload before requesting deletion.','PROFILE_CHANGED');await event(c,actor,actor.id,'account.deletion_requested',{requestId:row.id,version:row.version,retentionPolicyVersion:row.retention_policy_version,accessRevoked:true});return data({requestId:row.id,status:'requested' as const,version:1 as const,accessRevoked:true as const,retentionPolicyVersion:1 as const});
 }));}
}
