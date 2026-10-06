import {providerDestination} from '../services/provider-catalog.js';
import type pg from 'pg';
import type {z} from 'zod';
import {inquirySchema} from '@haven/contracts';
import {publicAgentDestination} from '../services/agent-directory.js';
import {fail} from '../platform/core.js';
export async function inquiryDestination(c:pg.PoolClient,x:z.infer<typeof inquirySchema>){let target:any;
 if(x.resourceType==='listing'){target=(await c.query('SELECT * FROM published_listing_destination($1)',[x.resourceId])).rows[0];if(target){const p=(await c.query('SELECT segment,version,city FROM public_listings WHERE id=$1',[x.resourceId])).rows[0];if(!p)fail(404,'This property is no longer available');if(p.segment==='commercial'&&x.resourceVersion===undefined)fail(400,'Choose a current commercial offer before submitting.','OFFER_VERSION_REQUIRED');if(x.resourceVersion!==undefined&&p.version!==x.resourceVersion)fail(409,'Offer changed. Refresh and try again.','OFFER_CHANGED');const eligible=(await c.query('SELECT id FROM public_listing_agents($1)',[x.resourceId])).rows[0];target={...target,agent_id:eligible?.id??null,version:p.version,city:p.city};}}
 else if(x.resourceType==='development'){target=(await c.query('SELECT * FROM published_development_destination($1,$2)',[x.resourceId,x.floorPlanId??null])).rows[0];if(target){if(x.resourceVersion!==undefined&&target.version!==x.resourceVersion)fail(409,'Project changed. Refresh and try again.');if(x.floorPlanId){if(target.floor_plan_version===null)fail(404,'Selected unit type is unavailable');if(target.floor_plan_version!==x.floorPlanVersion)fail(409,'Unit type changed. Refresh and try again.');if(x.intent==='available_unit'&&(target.status!=='on_sale'||target.available<=0))fail(409,'No units are currently available for this type');}}}
 else if(x.resourceType==='agent')target=await publicAgentDestination(c,x.resourceId,x.resourceVersion,x.city);
 else target=await providerDestination(c,x.resourceId,x.resourceVersion,x.city);
 if(!target)fail(404,'This resource is no longer available');let recipient:any;
 if(target.agent_id){recipient=(await c.query("SELECT a.user_id FROM agents a JOIN profiles p ON p.id=a.user_id AND p.state='active' JOIN memberships m ON m.user_id=p.id AND m.organization_id=a.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') WHERE a.id=$1 AND a.organization_id=$2 FOR SHARE OF a,p,m",[target.agent_id,target.organization_id])).rows[0];}
 else recipient=(await c.query("SELECT p.id AS user_id FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=$1 AND m.status='active' AND m.role=CASE o.type WHEN 'agency' THEN 'agency_manager' WHEN 'developer' THEN 'developer' WHEN 'vendor' THEN 'vendor' ELSE 'agency_manager' END ORDER BY m.user_id LIMIT 1 FOR SHARE OF m,p",[target.organization_id])).rows[0];
 if(!recipient)fail(409,'The resource team is currently unavailable. Please try again later.','INQUIRY_TEAM_UNAVAILABLE');return {...target,agent_id:target.agent_id??null,city:target.city??x.city??null,recipient_id:recipient.user_id};
}
