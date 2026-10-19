import {expect,it} from 'vitest';
import {countUnresolvedOcrPages} from '../../apps/api/src/inventory/digitization/ocr-quality';
const source={sourceAssetId:'00000000-0000-4000-8000-000000000003',sourceSha256:'a'.repeat(64)};
const native={...source,kind:'native_fact_candidates',requiresOcrPages:[1,2]};
const ocr={...source,kind:'document_ocr_page',page:1};
it('repeated native receipts count distinct pages and completed OCR resolves only its exact page',()=>{
 expect(countUnresolvedOcrPages([native,native])).toBe(2);
 expect(countUnresolvedOcrPages([native,ocr,native,ocr])).toBe(1);
 expect(countUnresolvedOcrPages([ocr,{...ocr,page:2},native])).toBe(0);
});
it('different source bytes or asset identity cannot clear unresolved pages; malformed pages refuse',()=>{
 expect(countUnresolvedOcrPages([native,{...ocr,sourceSha256:'b'.repeat(64)},{...ocr,sourceAssetId:'00000000-0000-4000-8000-000000000004'}])).toBe(2);
 expect(()=>countUnresolvedOcrPages([{...native,requiresOcrPages:[0]}])).toThrow();
 expect(()=>countUnresolvedOcrPages([{...ocr,page:51}])).toThrow();
});
