import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {productionDocumentOcrAvailable,documentOcrProfileAllowed} from '../../apps/api/src/inventory/digitization/ocr-configuration';
import {buildCpuExecutionRequest,cpuSourceFingerprint} from '../../apps/api/src/inventory/digitization/execution-scope';

afterEach(()=>vi.unstubAllEnvs());
it('admits only the exact packaged release and refuses missing/substituted pins',()=>{
 vi.stubEnv('PROCESSING_DEPLOYMENT','production');vi.stubEnv('PROCESSING_ENABLE_OCR','true');vi.stubEnv('PROCESSING_ENABLE_OCR_INVESTIGATION','true');
 for(const value of ['','0'.repeat(64)]){vi.stubEnv('PROCESSING_OCR_RELEASE_SHA256',value);expect(productionDocumentOcrAvailable()).toBe(false);expect(documentOcrProfileAllowed('private-ocr-image-en-v1')).toBe(false);}
 const sha=createHash('sha256').update(readFileSync('services/property-processing/ocr-production-release.json')).digest('hex');vi.stubEnv('PROCESSING_OCR_RELEASE_SHA256',sha);
 expect(productionDocumentOcrAvailable()).toBe(true);expect(documentOcrProfileAllowed('private-ocr-image-en-investigation-v1')).toBe(false);
 const actor={id:randomUUID(),orgId:randomUUID(),roles:['agent']},engine=randomUUID(),source={assetId:randomUUID(),assetVersion:1,purpose:'document',sha256:'a'.repeat(64),bytes:'100',detectedMime:'image/png',decoderState:'requires_isolated_image_decoder'};
 const stage={profile_id:'private-ocr-image-en-v1',stage_type:'document_ocr',run_id:randomUUID(),input_revision:1,run_budget:{maxSeconds:15,maxScratchBytes:'67108864'},deadline:new Date(Date.now()+60000)};
 const request=buildCpuExecutionRequest(actor,engine,randomUUID(),randomUUID(),'1',{...stage,input_fingerprint:cpuSourceFingerprint(engine,actor.orgId,1,stage.profile_id,source)},source);
 expect(request.profileId).toBe(stage.profile_id);expect(request.artifacts[0].checksum).toBe(source.sha256);
});
