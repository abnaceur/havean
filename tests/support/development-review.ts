import type {FastifyRequest} from 'fastify';
import type {Actor} from '../../packages/database/src/index';
import type {Identity} from '../../apps/api/src/platform/core';
import {DevelopmentReviewController} from '../../apps/api/src/inventory/development-review';
// Use the actual independent workflow for public fixtures; never fake an
// approval row or bypass the publication constraint.
export async function publishDevelopmentFixture(actor:Actor,id:string,version:number,status:'coming_soon'|'on_sale'='on_sale'){
 const req=()=>({method:'POST',url:'/api/v1/ops/development-reviews/'+id+'/decision',headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest),owner=new DevelopmentReviewController({actor:async()=>actor} as unknown as Identity),moderator=new DevelopmentReviewController({actor:async()=>({id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']})} as unknown as Identity);
 const submitted=(await owner.submit(req(),id,{version,requestedStatus:status,confirm:true})).data;
 return (await moderator.decision(req(),id,{version:submitted.project.version,reviewVersion:submitted.review.version,decision:'approved',reason:'Independently reviewed synthetic test project and declared inventory',verified:true})).data.project;
}
