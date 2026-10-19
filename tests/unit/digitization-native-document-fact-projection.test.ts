import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {projectPrivateNativeDocumentFactCandidates} from '../../apps/api/src/inventory/digitization/document-fact-projection.js';

// Synthetic decoder records exercise the boundary; real confined source/hash
// checks run separately in the Python native-profile execution tests.
function fixture(){
 const context={organizationId:randomUUID(),target:{type:'intake',id:randomUUID()},inputRevision:1,assetId:randomUUID(),sourceSha256:'a'.repeat(64),locale:'en'};
 const text='Unit number: 00123',bbox=[0.1,0.2,0.7,0.4];
 const result={sourceSha256:context.sourceSha256,locale:'en',pages:[{page:1,sha256:'b'.repeat(64),requiresOcr:false,nativeLines:[{text,page:1,bbox}]}],candidates:[{field:'unitId',rawText:text,normalizedValue:'00123',origin:'document',extractionScore:null,scoreMethod:'generic-anchored-v1-uncalibrated',evidence:[{assetId:context.assetId,page:1,bbox,coordinateSpace:'upright-page-normalized-top-left',quotedText:text}],extractorVersion:'generic-anchored-v1'}],requiresOcrPages:[] as number[],extractionMethod:'generic-native-glyphs-v1',reviewRequired:true,countryProfile:null,ocrAvailable:false,isolation:{profile:'linux-landlock-seccomp-decoder-v1',landlockAbi:8}};
 return {context,result};
}
it('projects actual confined native-worker receipts and preserves the unresolved scanned page',()=>{
 const report=JSON.parse(readFileSync(new URL('../../evidence/digitization/native-document-real-worker-report.json',import.meta.url),'utf8'));
 const prepared=report.cases.map((item:{locale:string;assetId:string;sourceSha256:string;result:unknown})=>projectPrivateNativeDocumentFactCandidates(item.result,{organizationId:randomUUID(),target:{type:'intake',id:randomUUID()},inputRevision:1,assetId:item.assetId,sourceSha256:item.sourceSha256,locale:item.locale}));
 expect(prepared[0].candidates[0].normalizedValue).toBe('00123');
 expect(prepared[1].candidates[0].normalizedValue).toEqual({amount:'184.20',unit:'m2',basis:'document_unit_area'});
 expect(prepared[2]).toEqual({candidates:[],requiresOcrPages:[1],reviewRequired:true});
 expect(prepared.every((item:{candidates:Array<{review:{status:string}}>})=>item.candidates.every(candidate=>candidate.review.status==='pending'))).toBe(true);
});
it('keeps native identity and leading zeros with server-owned pending scope',()=>{
 const {context,result}=fixture(),prepared=projectPrivateNativeDocumentFactCandidates(result,context);
 expect(prepared.requiresOcrPages).toEqual([]);expect(prepared.reviewRequired).toBe(true);
 expect(prepared.candidates[0]).toMatchObject({organizationId:context.organizationId,target:context.target,normalizedValue:'00123',extractorVersion:'generic-anchored-v1',extractionScore:null,review:{status:'pending',actorId:null,reviewedAt:null}});
});
it('keeps unresolved scanned pages empty rather than fabricating OCR or counts',()=>{
 const {context,result}=fixture();result.pages.push({page:2,sha256:'c'.repeat(64),requiresOcr:true,nativeLines:[]});result.requiresOcrPages=[2];
 expect(projectPrivateNativeDocumentFactCandidates(result,context).requiresOcrPages).toEqual([2]);
 result.candidates=[];expect(projectPrivateNativeDocumentFactCandidates(result,context).candidates).toEqual([]);
 result.requiresOcrPages=[];expect(()=>projectPrivateNativeDocumentFactCandidates(result,context)).toThrow();
});
it('rejects stale hash/locale, substituted native page/crop/value and scanned-page evidence',()=>{
 for(const mutate of [
  (r:ReturnType<typeof fixture>['result'])=>{r.sourceSha256='d'.repeat(64);},
  (r:ReturnType<typeof fixture>['result'])=>{r.locale='fr';},
  (r:ReturnType<typeof fixture>['result'])=>{r.pages[0].nativeLines[0].page=2;},
  (r:ReturnType<typeof fixture>['result'])=>{r.pages[0].nativeLines[0].text='Unit number: 00999';},
  (r:ReturnType<typeof fixture>['result'])=>{r.candidates[0].evidence[0].bbox=[0.1,0.2,0.7,0.5];},
  (r:ReturnType<typeof fixture>['result'])=>{r.candidates[0].normalizedValue='123';},
  (r:ReturnType<typeof fixture>['result'])=>{r.candidates[0].evidence[0].assetId=randomUUID();},
  (r:ReturnType<typeof fixture>['result'])=>{r.pages[0].requiresOcr=true;r.requiresOcrPages=[1];}
 ]){const {context,result}=fixture();mutate(result);expect(()=>projectPrivateNativeDocumentFactCandidates(result,context)).toThrow();}
});
it('cannot relabel native v1 as a new count extractor or approved fact',()=>{
 for(const patch of [{field:'bedrooms',normalizedValue:0},{extractorVersion:'generic-anchored-v2'},{review:{status:'accepted'}},{extractionScore:0.99},{id:randomUUID()}]){
  const {context,result}=fixture();Object.assign(result.candidates[0],patch);expect(()=>projectPrivateNativeDocumentFactCandidates(result,context)).toThrow();
 }
});

it('native v3 keeps anchored metadata and counts pending and rejects profile relabeling',()=>{
 const {context,result}=fixture();const modern:any=structuredClone(result);
 modern.extractionMethod='generic-native-glyphs-v3';
 modern.pages[0].nativeLines[0].text='City: Dubai; Plot number: 00123; 2 bedrooms';
 modern.candidates=['city','plotId','bedrooms'].map((field,index)=>({...modern.candidates[0],field,normalizedValue:['Dubai','00123',2][index],rawText:modern.pages[0].nativeLines[0].text,scoreMethod:'generic-anchored-v3-uncalibrated',extractorVersion:'generic-anchored-v3',evidence:[{...modern.candidates[0].evidence[0],quotedText:modern.pages[0].nativeLines[0].text}]}));
 expect(projectPrivateNativeDocumentFactCandidates(modern,context).candidates.map(item=>item.normalizedValue)).toEqual(['Dubai','00123',2]);
 modern.candidates[0].normalizedValue='Abu Dhabi';expect(()=>projectPrivateNativeDocumentFactCandidates(modern,context)).toThrow();
 modern.candidates[0].normalizedValue='Dubai';modern.extractionMethod='generic-native-glyphs-v1';expect(()=>projectPrivateNativeDocumentFactCandidates(modern,context)).toThrow();
});
