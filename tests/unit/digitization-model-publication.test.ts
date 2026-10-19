import {it,expect} from 'vitest';
import {digitizationModelPublicationCreate,digitizationPublicModel} from '../../packages/contracts/src/digitization-model-publication';
const id='00000000-0000-4000-8000-000000000008';
it('model publication needs exact review, listing version and separate explicit publication consent',()=>{
 const input={workspaceVersion:4,inputRevision:1,listingVersion:2,reviewRequestId:id,approvalId:id,approvalVersion:1,publicationConsent:true,reason:'Independently reviewed exact candidate publication'};
 expect(digitizationModelPublicationCreate.safeParse(input).success).toBe(true);
 for(const patch of [{publicationConsent:false},{listingVersion:0},{approvalVersion:2},{geometrySnapshot:{}},{objectKey:'private'},{publiclyServed:true}])expect(digitizationModelPublicationCreate.safeParse({...input,...patch}).success).toBe(false);
});
it('public model projection excludes private fields and never upgrades visualization scale to metric approval',()=>{
 const model={schemaVersion:1,packageId:id,version:1,publicationNumber:2,viewerType:'structural',candidateChecksum:'a'.repeat(64),scaleStatus:'estimated',metricMeasurementsAvailable:false,limitations:['Supplied dimensions are unverified.'],contentUrl:`/api/v1/listings/${id}/digitization-packages/${id}/model`};
 expect(digitizationPublicModel.safeParse(model).success).toBe(true);
 expect(digitizationPublicModel.safeParse({...model,viewerType:'splat',scaleStatus:'unscaled'}).success).toBe(true);
 for(const patch of [{metricMeasurementsAvailable:true},{scaleStatus:'measured'},{scaleStatus:'unscaled'},{geometrySnapshot:{}},{sourceSet:[]},{object_key:'private'},{contentUrl:'https://private-storage/model.glb'}])expect(digitizationPublicModel.safeParse({...model,...patch}).success).toBe(false);
});
