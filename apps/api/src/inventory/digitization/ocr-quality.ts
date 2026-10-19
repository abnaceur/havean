import {z} from 'zod';

const source={sourceAssetId:z.uuid(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/)};
const page=z.number().int().min(1).max(50);
const receipt=z.discriminatedUnion('kind',[
 z.object({...source,kind:z.literal('native_fact_candidates'),requiresOcrPages:z.array(page).max(50)}),
 z.object({...source,kind:z.literal('document_ocr_page'),page}),
]);
/** Count distinct unresolved original pages. OCR completion resolves only the
 * same asset, exact source bytes and page; it never approves extracted facts. */
export function countUnresolvedOcrPages(values:unknown[]){
 const required=new Set<string>(),completed=new Set<string>();
 for(const value of values){
  const record=receipt.parse(value),prefix=record.sourceAssetId+':'+record.sourceSha256+':';
  if(record.kind==='document_ocr_page')completed.add(prefix+record.page);
  else for(const number of record.requiresOcrPages)required.add(prefix+number);
 }
 return [...required].filter(key=>!completed.has(key)).length;
}
