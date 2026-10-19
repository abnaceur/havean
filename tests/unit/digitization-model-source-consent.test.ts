import {it,expect} from 'vitest';
import {digitizationModelSourceConsent,modelSourceConsentValid} from '../../packages/contracts/src/digitization-model-source-consent';
it('source preview and processing permissions do not silently grant model review or publication consent',()=>{
 expect(modelSourceConsentValid({purposes:['preview','document_processing']})).toBe(true);
 expect(modelSourceConsentValid({purposes:['preview','document_processing','model_review']})).toBe(false);
 expect(modelSourceConsentValid({purposes:['model_review'],modelReviewConsentConfirmed:true})).toBe(false);
 expect(modelSourceConsentValid({purposes:['preview','document_processing','model_review'],modelReviewConsentConfirmed:true})).toBe(true);
 expect(modelSourceConsentValid({purposes:['preview','document_processing','model_review','model_publication'],modelReviewConsentConfirmed:true})).toBe(false);
 expect(modelSourceConsentValid({purposes:['preview','document_processing','model_review','model_publication'],modelReviewConsentConfirmed:true,modelPublicationConsentConfirmed:true})).toBe(true);
 expect(digitizationModelSourceConsent.safeParse({modelPublicationConsentConfirmed:false}).success).toBe(false);
});
