import {it,expect} from 'vitest';
import {digitizationModelReviewCreate,digitizationModelReviewDecision,digitizationModelReviewApproval} from '../../packages/contracts/src/digitization-model-review';
it('model delegation requires one exact candidate and explicit independent preview consent',()=>{
 const id='00000000-0000-4000-8000-000000000008',base={workspaceVersion:4,inputRevision:1,reviewerId:id,previewDelegationConfirmed:true};
 expect(digitizationModelReviewCreate.safeParse({...base,modelType:'structural',geometryRevisionId:id}).success).toBe(true);
 expect(digitizationModelReviewCreate.safeParse({...base,modelType:'splat',sceneArtifactId:id}).success).toBe(true);
 for(const patch of [{previewDelegationConfirmed:false},{sceneArtifactId:id},{publiclyServed:true},{metricMeasurementsAvailable:true},{workspaceVersion:0}])expect(digitizationModelReviewCreate.safeParse({...base,modelType:'structural',geometryRevisionId:id,...patch}).success).toBe(false);
});
it('private model review cannot imply metric approval or public serving, and approval requires both attestations',()=>{
 const decision={requestVersion:1,workspaceVersion:4,decision:'approved',privacyConfirmed:true,limitationsConfirmed:true,reason:'Exact synthetic candidate review'};
 for(const patch of [{privacyConfirmed:false},{limitationsConfirmed:false},{requestVersion:2},{publiclyServed:true},{reason:'no'}])expect(digitizationModelReviewDecision.safeParse({...decision,...patch}).success).toBe(false);
 expect(digitizationModelReviewDecision.safeParse({...decision,decision:'rejected',privacyConfirmed:false,limitationsConfirmed:false}).success).toBe(true);
 const id='00000000-0000-4000-8000-000000000008',approval={id,version:1,decision:'approved',reason:decision.reason,reviewerId:id,requestId:id,modelType:'structural',candidateChecksum:'a'.repeat(64),metricMeasurementsAvailable:false,publiclyServed:false};
 expect(digitizationModelReviewApproval.safeParse(approval).success).toBe(true);
 for(const patch of [{publiclyServed:true},{metricMeasurementsAvailable:true},{geometrySnapshot:{}},{candidateChecksum:'invalid'}])expect(digitizationModelReviewApproval.safeParse({...approval,...patch}).success).toBe(false);
});
