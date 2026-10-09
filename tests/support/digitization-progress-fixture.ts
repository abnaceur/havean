import './env';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {appendInputRevision} from '../../apps/api/src/inventory/digitization/inputs';
import {createRunGraph} from '../../apps/api/src/inventory/digitization/workflow';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const engine=process.argv[2],runId=crypto.randomUUID();
try{
 await transaction(actor,c=>appendInputRevision(c,actor,engine,1,[]));
 await transaction(actor,c=>createRunGraph(c,actor,engine,2,{schemaVersion:1,id:runId,organizationId:actor.orgId!,creatorId:actor.id,target:{type:'intake',id:engine},inputRevision:1,state:'draft',version:1,stages:[{id:crypto.randomUUID(),type:'document_rasterize',state:'pending',dependencies:[],profileId:'pdfium-150dpi-v1',inputFingerprint:'a'.repeat(64),inputRevision:1,attempt:0,fencingToken:null,executionId:null,progress:null}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:30,maxScratchBytes:'67108864'}},['facts']));
 console.log(JSON.stringify({runId}));
}finally{await pool.end();}
