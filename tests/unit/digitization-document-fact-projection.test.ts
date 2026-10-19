import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {projectPrivateDocumentFactCandidates} from '../../apps/api/src/inventory/digitization/document-fact-projection.js';

function fixture(){
 const context={organizationId:randomUUID(),inputRevision:2,target:{type:'intake',id:randomUUID()},assetId:randomUUID(),sourceSha256:'a'.repeat(64),locale:'en'};
 const result={schemaVersion:1,sourceSha256:context.sourceSha256,locale:'en',pages:[{page:1,sha256:'b'.repeat(64),requiresOcr:true,nativeLines:[]}],ocrPages:[{page:1,sourceDocumentSha256:context.sourceSha256,pageRasterSha256:'b'.repeat(64),tokens:[{text:'Bedrooms: 3',score:0.99,polygon:[[0.1,0.2],[0.7,0.2],[0.7,0.4],[0.1,0.4]]}],scoreMethod:'native_model_score_uncalibrated',isolation:{profile:'linux-landlock-seccomp-ocr-v1',landlockAbi:8}}],candidates:[{field:'bedrooms',rawText:'Bedrooms: 3',normalizedValue:3,origin:'document',extractionScore:null,scoreMethod:'generic-anchored-v2-uncalibrated',evidence:[{assetId:context.assetId,page:1,bbox:[0.1,0.2,0.7,0.4],coordinateSpace:'upright-page-normalized-top-left',quotedText:'Bedrooms: 3'}],extractorVersion:'generic-anchored-v2'}],extractionMethod:'generic-native-then-ocr-investigation-v1',reviewRequired:true,countryProfile:null,productionOcrEnabled:false,isolation:{profile:'linux-landlock-seccomp-decoder-v1',landlockAbi:8}};
 return {context,result};
}

describe('private document fact preparation',()=>{
 it('projects the retained actual confined two-page PDF result without approving it',()=>{
  const report=JSON.parse(readFileSync(new URL('../../evidence/digitization/ocr-confined-durable-api-projection-document-report.json',import.meta.url),'utf8'));
  const decoded=report.document.privateResult;
  const context={organizationId:randomUUID(),inputRevision:1,target:{type:'intake',id:randomUUID()},assetId:decoded.candidates[0].evidence[0].assetId,sourceSha256:decoded.sourceSha256,locale:'en'};
  const candidates=projectPrivateDocumentFactCandidates(decoded,context);
  expect(candidates).toHaveLength(2);expect(candidates.map(item=>item.evidence[0].page)).toEqual([1,2]);
  expect(candidates.map(item=>item.normalizedValue)).toEqual(Array(2).fill({amount:'123.45',basis:'document_unit_area',unit:'m2'}));
  expect(candidates.every(item=>item.review.status==='pending'&&item.extractionScore===null)).toBe(true);
 });
 it('keeps server identity and pending review; OCR score does not become field accuracy',()=>{
  const {context,result}=fixture(),[candidate]=projectPrivateDocumentFactCandidates(result,context);
  expect(candidate.organizationId).toBe(context.organizationId);expect(candidate.target).toEqual(context.target);
  expect(candidate.inputRevision).toBe(2);expect(candidate.extractionScore).toBeNull();expect(candidate.normalizedValue).toBe(3);
  expect(candidate.review).toEqual({status:'pending',actorId:null,reviewedAt:null});expect(candidate.id).toMatch(/^[a-f0-9-]{36}$/);
  result.candidates=[];expect(projectPrivateDocumentFactCandidates(result,context)).toEqual([]);
 });

 it('rejects substituted source, page, asset, raster and absent quote/crop evidence',()=>{
  for(const mutate of [
   (r:ReturnType<typeof fixture>['result'])=>{r.sourceSha256='c'.repeat(64);},
   (r:ReturnType<typeof fixture>['result'])=>{r.candidates[0].evidence[0].assetId=randomUUID();},
   (r:ReturnType<typeof fixture>['result'])=>{r.candidates[0].evidence[0].page=2;},
   (r:ReturnType<typeof fixture>['result'])=>{r.ocrPages[0].pageRasterSha256='c'.repeat(64);},
   (r:ReturnType<typeof fixture>['result'])=>{r.candidates[0].evidence[0].bbox=[0.1,0.2,0.7,0.5];},
   (r:ReturnType<typeof fixture>['result'])=>{r.ocrPages[0].tokens[0].text='Bedrooms: 8';},
   (r:ReturnType<typeof fixture>['result'])=>{r.ocrPages=[];},
   (r:ReturnType<typeof fixture>['result'])=>{r.pages.push({...r.pages[0]});}
  ]){const {context,result}=fixture();mutate(result);expect(()=>projectPrivateDocumentFactCandidates(result,context)).toThrow();}
 });

 it('rejects worker-supplied review, identity, confidence and unsupported ownership fields',()=>{
  for(const patch of [{review:{status:'accepted'}},{id:randomUUID()},{organizationId:randomUUID()},{extractionScore:0.99},{field:'ownerName',normalizedValue:'owner'},{normalizedValue:4},{field:'unitId',normalizedValue:'00003'}]){
   const {context,result}=fixture();Object.assign(result.candidates[0],patch);
   expect(()=>projectPrivateDocumentFactCandidates(result,context)).toThrow();
  }
 });

 it('preserves contradictory proposals and source pages for human review',()=>{
  const {context,result}=fixture();result.pages.push({...result.pages[0],page:2});result.ocrPages.push({...result.ocrPages[0],page:2,tokens:[{...result.ocrPages[0].tokens[0],text:'Bedrooms: 4'}]});
  result.candidates.push({...result.candidates[0],rawText:'Bedrooms: 4',normalizedValue:4,evidence:[{...result.candidates[0].evidence[0],page:2,quotedText:'Bedrooms: 4'}]});
  const projected=projectPrivateDocumentFactCandidates(result,context);
  expect(projected.map(item=>item.normalizedValue)).toEqual([3,4]);expect(projected.map(item=>item.evidence[0].page)).toEqual([1,2]);
  expect(projected.every(item=>item.review.status==='pending')).toBe(true);
 });

 it('validates exact multilingual decimal strings and area basis against source text',()=>{
  for(const [locale,text] of [['fr','Surface de l’unité: 184,20 m²'],['ar','مساحة الوحدة: ١٨٤٫٢٠ متر مربع']]){
   const {context,result}=fixture();context.locale=locale;result.locale=locale;
   Object.assign(result.candidates[0],{field:'unitArea',rawText:text,normalizedValue:{amount:'184.20',unit:'m2',basis:'document_unit_area'}});
   result.candidates[0].evidence[0].quotedText=text;result.ocrPages[0].tokens[0].text=text;
   expect(projectPrivateDocumentFactCandidates(result,context)[0].normalizedValue).toEqual({amount:'184.20',unit:'m2',basis:'document_unit_area'});
   for(const value of [{amount:'184.21',unit:'m2',basis:'document_unit_area'},{amount:'184.20',unit:'ft2',basis:'document_unit_area'},{amount:'184.20',unit:'m2',basis:'document_built_up_area'}]){
    Object.assign(result.candidates[0],{normalizedValue:value});expect(()=>projectPrivateDocumentFactCandidates(result,context)).toThrow();
   }
  }
 });

 it('rejects an invented zero from missing bedroom text and corrupted Arabic quantity text',()=>{
  for(const text of ['Bedrooms: unknown','مساحة الوحدة ٥٤٣,١مترمريع']){
   const {context,result}=fixture();result.candidates[0].rawText=text;result.candidates[0].evidence[0].quotedText=text;result.ocrPages[0].tokens[0].text=text;result.candidates[0].normalizedValue=0;
   expect(()=>projectPrivateDocumentFactCandidates(result,context)).toThrow();
  }
 });
});
it('format-independent v3 projects only explicit original text, keeps identifiers and missing fields unknown',()=>{
 const {context,result}=fixture();
 const text='City: Dubai; Property type: Apartment; Plot number: 00123';
 result.ocrPages[0].tokens[0].text=text;
 const base=result.candidates[0];
 const candidates=[{field:'city',normalizedValue:'Dubai'},{field:'propertyType',normalizedValue:'Apartment'},{field:'plotId',normalizedValue:'00123'}].map(f=>({...base,...f,rawText:text,scoreMethod:'generic-anchored-v3-uncalibrated',extractorVersion:'generic-anchored-v3',evidence:[{...base.evidence[0],quotedText:text}]}));
 const decoded={...result,candidates};const actual=projectPrivateDocumentFactCandidates(decoded,context);
 expect(actual.map(f=>f.normalizedValue)).toEqual(['Dubai','Apartment','00123']);expect(actual.every(f=>f.review.status==='pending')).toBe(true);
 expect(actual.some(f=>f.field==='bedrooms'||f.field==='bathrooms'||f.field==='country')).toBe(false);
 for(const patch of [{field:'city',normalizedValue:'Abu Dhabi'},{field:'ownerName',normalizedValue:'invented'},{field:'plotId',normalizedValue:'123'},{extractorVersion:'generic-anchored-v2',scoreMethod:'generic-anchored-v2-uncalibrated'}])expect(()=>projectPrivateDocumentFactCandidates({...decoded,candidates:[{...candidates[0],...patch}]},context)).toThrow();
});
