import {expect,it} from 'vitest';
import {revisionDomains,revisionChange,reusableStageInputs,type RevisionSource} from '../../apps/api/src/inventory/digitization/revision-policy';
const document:RevisionSource={assetId:'10000000-0000-4000-8000-000000000001',assetVersion:1,purpose:'document',sha256:'a'.repeat(64),bytes:'1234',detectedMime:'application/pdf',decoderState:'requires_isolated_pdf_decoder'},photo:RevisionSource={...document,assetId:'10000000-0000-4000-8000-000000000002',purpose:'photo',sha256:'b'.repeat(64),detectedMime:'image/png',decoderState:'requires_isolated_image_decoder'};
it('HE-C10 media change preserves OCR/fact dependency identity and invalidates scene inputs without inventing OCR output',()=>{
 const before=[document,photo],after=[document,{...photo,sha256:'c'.repeat(64)}],change=revisionChange(before,after);expect(change).toMatchObject({documentsChanged:false,plansChanged:false,mediaChanged:true});expect(revisionDomains(before).documents).toBe(change.domains.documents);
 for(const stage of ['document_ocr','document_classify','fact_extract','geometry_render'] as const)expect(reusableStageInputs(stage,before,after)).toBe(true);
 for(const stage of ['media_probe','frame_select','camera_solve','splat_train','scene_export','assemble'] as const)expect(reusableStageInputs(stage,before,after)).toBe(false);
});
it('ordering is stable; source identity/version/content/purpose changes and inaccessible history cannot retain a dependent approval',()=>{
 expect(revisionDomains([document,photo])).toEqual(revisionDomains([photo,document]));for(const changed of [{...document,assetVersion:2},{...document,sha256:'d'.repeat(64)},{...document,purpose:'plan'}])expect(reusableStageInputs('document_ocr',[document],[changed])).toBe(false);
 expect(revisionChange(null,[document])).toMatchObject({documentsChanged:true,plansChanged:true,mediaChanged:true});expect(reusableStageInputs('document_rasterize',[document],[{...document,assetId:photo.assetId}])).toBe(false);
});
