import {marketAdmin,marketRequest,saveMarketPatch} from '../support/market-admin';
import '../support/env';
import {it,expect,afterAll} from 'vitest';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {workerActor} from '../../apps/worker/src/processor';
import {MediaController} from '../../apps/api/src/inventory/media';
import {InventoryController} from '../../apps/api/src/inventory/controller';
import {validateOwnerEvidencePolicy} from '../../apps/api/src/inventory/owner-wizard';
import {grantReviewEvidence} from '../../apps/api/src/inventory/moderation-evidence';
import {encrypt,type Identity} from '../../apps/api/src/platform/core';
const owner:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['owner']},reviewer:Actor={id:'00000000-0000-4000-8000-000000000008',orgId:null,roles:['moderator']},buyer:Actor={id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['consumer']};
const identity=(actor:Actor)=>({actor:async()=>actor} as unknown as Identity),request=(query={})=>({method:'POST',url:'/api/v1/owner-submissions/evidence',headers:{'idempotency-key':crypto.randomUUID()},query} as unknown as FastifyRequest),submissions:string[]=[],assets:string[]=[];
afterAll(async()=>{try{await transaction(reviewer,c=>c.query('DELETE FROM moderation_evidence_grants WHERE submission_id=ANY($1::uuid[])',[submissions]));await transaction(workerActor,async c=>{await c.query('DELETE FROM owner_submissions WHERE id=ANY($1::uuid[])',[submissions]);await c.query('DELETE FROM media_assets WHERE id=ANY($1::uuid[])',[assets]);});}finally{await pool.end();}});
it('O03 actual approved PDF attachment is versioned, scoped and labelled; authorized downloads are audited and expired/foreign tickets fail',async()=>{
 const media=new MediaController(identity(owner)),row=(await new InventoryController(identity(owner)).createOwnerDraft(request(),{version:0,city:'bj'})).data;submissions.push(row.id);
 const bytes=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
 const upload=(await media.intent(request(),{mime:'application/pdf',size:bytes.length,rights:'Synthetic PDF evidence supplied for integration verification',visibility:'private'})).data;assets.push(upload.id);
 await media.content({...request({signature:new URL(upload.uploadUrl,'http://localhost').searchParams.get('signature')}),headers:{'content-type':'application/pdf'}} as FastifyRequest,upload.id,bytes);
 const attach=request();await media.attach(attach,row.id,{mediaId:upload.id,version:1,documentType:'ownership'});expect((await media.attach(attach,row.id,{mediaId:upload.id,version:1,documentType:'ownership'})).data.attached).toBe(true);
 await expect(media.attach(request(),row.id,{mediaId:upload.id,version:1})).rejects.toMatchObject({status:409});await expect(new MediaController(identity(buyer)).attach(request(),row.id,{mediaId:upload.id,version:2})).rejects.toMatchObject({status:404});
 const saved=(await new InventoryController(identity(owner)).ownerDraft(request(),row.id)).data;expect(saved.data.documentTypes[upload.id]).toBe('ownership');
 await transaction(workerActor,c=>c.query("UPDATE owner_submissions SET status='submitted' WHERE id=$1",[row.id]));await transaction(reviewer,c=>grantReviewEvidence(c,reviewer,row.id));
 const reviewing=new MediaController(identity(reviewer)),link=(await reviewing.downloadLink(request(),upload.id)).data;expect(link.expiresIn).toBe(60);
 const headers:Record<string,string>={};let downloaded:Buffer|undefined;const reply={header:(key:string,value:string)=>{headers[key]=value;return reply;},send:(value:Buffer)=>{downloaded=value;return value;}} as unknown as FastifyReply;
 await reviewing.download(request({signature:new URL(link.url,'http://localhost').searchParams.get('signature')}),upload.id,reply);expect(downloaded?.subarray(0,5).toString()).toBe('%PDF-');expect(headers['Cache-Control']).toBe('no-store');
 expect((await transaction(workerActor,c=>c.query("SELECT count(*)::int n FROM audit_events WHERE resource_id=$1 AND actor_id=$2 AND action='document.downloaded'",[upload.id,reviewer.id]))).rows[0].n).toBe(1);
 await expect(new MediaController(identity(buyer)).downloadLink(request(),upload.id)).rejects.toMatchObject({status:404});await expect(new MediaController(identity(buyer)).download(request(),upload.id,reply)).rejects.toMatchObject({status:404});
 await expect(reviewing.download(request({signature:encrypt({assetId:upload.id,actorId:reviewer.id,expires:Date.now()-1000})}),upload.id,reply)).rejects.toMatchObject({status:403});await expect(media.download(request({signature:new URL(link.url,'http://localhost').searchParams.get('signature')}),upload.id,reply)).rejects.toMatchObject({status:403});
});
it('O03 configured required categories are checked without trusting unattached classification metadata',async()=>{
 const original=(await marketAdmin.marketRead(marketRequest('GET'),'bj')).data.data.requiredOwnerEvidenceTypes;
 try{await saveMarketPatch({requiredOwnerEvidenceTypes:['ownership','authorization']});const id=crypto.randomUUID(),other=crypto.randomUUID();await transaction(workerActor,async c=>{await expect(validateOwnerEvidencePolicy(c,{city:'bj',documents:[id],documentTypes:{[id]:'ownership',[other]:'authorization'}})).rejects.toMatchObject({status:409});await validateOwnerEvidencePolicy(c,{city:'bj',documents:[id,other],documentTypes:{[id]:'ownership',[other]:'authorization'}});});await saveMarketPatch({requiredOwnerEvidenceTypes:[]});await transaction(workerActor,c=>validateOwnerEvidencePolicy(c,{city:'bj',documents:[]}));}finally{await saveMarketPatch({requiredOwnerEvidenceTypes:original});}

});
