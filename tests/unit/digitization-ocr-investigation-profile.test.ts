import {env} from '../../apps/api/src/platform/core';
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {buildCpuExecutionRequest,cpuSourceFingerprint} from '../../apps/api/src/inventory/digitization/execution-scope';
import {collectInvestigationDocumentOcr} from '../../apps/api/src/inventory/digitization/native-fact-results';
const actor={id:randomUUID(),orgId:randomUUID(),roles:['agent']};
function fixture(){const engine=randomUUID(),source={assetId:randomUUID(),assetVersion:1,purpose:'document',sha256:'a'.repeat(64),bytes:'100',detectedMime:'application/pdf',decoderState:'requires_isolated_pdf_decoder'},stage={profile_id:'private-ocr-document-en-investigation-v1',stage_type:'document_ocr',run_id:randomUUID(),input_revision:1,run_budget:{maxSeconds:15,maxScratchBytes:'67108864'},deadline:new Date(Date.now()+60000)};return {engine,source,stage:{...stage,input_fingerprint:cpuSourceFingerprint(engine,actor.orgId,1,stage.profile_id,source)}};}
afterEach(()=>vi.unstubAllEnvs());
it('only explicit local development or isolated test configuration can prepare investigation OCR; production refuses it',()=>{
 for(const deployment of ['production','development','test']){vi.stubEnv('PROCESSING_DEPLOYMENT',deployment);vi.stubEnv('PROCESSING_ENABLE_OCR_INVESTIGATION','true');vi.stubEnv('HAVEN_CONTAINER_TESTS','true');const {engine,source,stage}=fixture();const prepare=()=>buildCpuExecutionRequest(actor,engine,randomUUID(),randomUUID(),'1',stage,source);if(deployment==='test'||deployment==='development'&&env.NODE_ENV==='development')expect(prepare().profileId).toBe(stage.profile_id);else expect(prepare).toThrow();}
});
it('missing container marker or explicit flag never admits the private OCR profile',()=>{
 for(const [container,enabled] of [['false','true'],['true','false'],['','true']]){vi.stubEnv('PROCESSING_DEPLOYMENT','test');vi.stubEnv('HAVEN_CONTAINER_TESTS',container);vi.stubEnv('PROCESSING_ENABLE_OCR_INVESTIGATION',enabled);const {engine,source,stage}=fixture();expect(()=>buildCpuExecutionRequest(actor,engine,randomUUID(),randomUUID(),'1',stage,source)).toThrow();}
});
it('collection refuses production OCR before any database or runner call',async()=>{
 vi.stubEnv('PROCESSING_DEPLOYMENT','production');vi.stubEnv('HAVEN_CONTAINER_TESTS','true');vi.stubEnv('PROCESSING_ENABLE_OCR_INVESTIGATION','true');
 await expect(collectInvestigationDocumentOcr(actor,randomUUID(),randomUUID(),randomUUID(),'1',randomUUID(),null as never)).rejects.toMatchObject({status:422});
});
