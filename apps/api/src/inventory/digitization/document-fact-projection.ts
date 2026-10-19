import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {digitizationEvidence,digitizationFactCandidate,digitizationTarget} from '@haven/contracts';
import {assertAnchoredDocumentFactValue} from './document-fact-values.js';

const checksum=z.string().regex(/^[a-f0-9]{64}$/);
const point=z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]);
const token=z.strictObject({text:z.string().min(1).max(2000),score:z.number().finite().min(0).max(1),polygon:z.array(point).length(4)});
const page=z.object({page:z.number().int().min(1).max(50),sha256:checksum,requiresOcr:z.boolean(),nativeLines:z.array(z.object({text:z.string().min(1).max(2000),page:z.number().int().min(1).max(50),bbox:z.tuple([z.number(),z.number(),z.number(),z.number()])})).max(10000)});
const ocrPage=z.strictObject({page:z.number().int().min(1).max(50),sourceDocumentSha256:checksum,pageRasterSha256:checksum,tokens:z.array(token).max(5000),scoreMethod:z.literal('native_model_score_uncalibrated'),isolation:z.strictObject({profile:z.literal('linux-landlock-seccomp-ocr-v1'),landlockAbi:z.number().int().min(6)})});
const proposal=z.strictObject({field:digitizationFactCandidate.shape.field,rawText:z.string().min(1).max(2000),normalizedValue:digitizationFactCandidate.shape.normalizedValue,origin:z.literal('document'),extractionScore:z.null(),scoreMethod:z.enum(['generic-anchored-v2-uncalibrated','generic-anchored-v3-uncalibrated']),evidence:z.array(digitizationEvidence).length(1),extractorVersion:z.enum(['generic-anchored-v2','generic-anchored-v3'])});
const result=z.strictObject({schemaVersion:z.literal(1),sourceSha256:checksum,locale:z.enum(['en','fr','ar']),pages:z.array(page).min(1).max(50),ocrPages:z.array(ocrPage).max(50),candidates:z.array(proposal).max(1000),extractionMethod:z.enum(['generic-native-then-ocr-investigation-v1','generic-native-then-ocr-v1']),reviewRequired:z.literal(true),countryProfile:z.null(),productionOcrEnabled:z.boolean(),isolation:z.strictObject({profile:z.literal('linux-landlock-seccomp-decoder-v1'),landlockAbi:z.number().int().min(6)})});
const context=z.strictObject({organizationId:z.uuid(),inputRevision:z.number().int().positive(),target:digitizationTarget,assetId:z.uuid(),sourceSha256:checksum,locale:z.enum(['en','fr','ar'])});
const legacyNativeProposal=proposal.extend({field:z.enum(['unitId','landArea','unitArea','builtUpArea','terraceArea']),scoreMethod:z.literal('generic-anchored-v1-uncalibrated'),extractorVersion:z.literal('generic-anchored-v1')});
const nativeProposal=z.union([legacyNativeProposal,proposal.extend({scoreMethod:z.literal('generic-anchored-v3-uncalibrated'),extractorVersion:z.literal('generic-anchored-v3')})]);
const nativeResult=z.strictObject({sourceSha256:checksum,locale:z.enum(['en','fr','ar']),pages:z.array(page).min(1).max(50),candidates:z.array(nativeProposal).max(1000),requiresOcrPages:z.array(z.number().int().min(1).max(50)).max(50),extractionMethod:z.enum(['generic-native-glyphs-v1','generic-native-glyphs-v3']),reviewRequired:z.literal(true),countryProfile:z.null(),ocrAvailable:z.literal(false),isolation:result.shape.isolation});

/** Already supported native-glyph profiles share the API evidence boundary.
 * Scanned pages remain explicitly unresolved; this never substitutes OCR,
 * promotes extractor versions or invents a room count from a native v1 result. */
export function projectPrivateNativeDocumentFactCandidates(value:unknown,current:unknown){
 const scope=context.parse(current),decoded=nativeResult.parse(value);
 if(decoded.sourceSha256!==scope.sourceSha256||decoded.locale!==scope.locale)throw Error('Document fact source mismatch');
 const pages=new Map(decoded.pages.map(item=>[item.page,item]));
 if(pages.size!==decoded.pages.length||decoded.pages.some((item,index)=>item.page!==index+1||item.nativeLines.some(line=>line.page!==item.page)))throw Error('Document fact page mismatch');
 const missing=decoded.pages.filter(item=>item.requiresOcr).map(item=>item.page);
 if(JSON.stringify(missing)!==JSON.stringify(decoded.requiresOcrPages))throw Error('Document OCR requirements mismatch');
 const candidates=decoded.candidates.map(candidate=>{
  if(candidate.extractorVersion!==(decoded.extractionMethod==='generic-native-glyphs-v3'?'generic-anchored-v3':'generic-anchored-v1'))throw Error('Unsupported native document extractor profile');
  const evidence=candidate.evidence[0],source=pages.get(evidence.page);
  if(evidence.assetId!==scope.assetId||!source||source.requiresOcr||candidate.rawText!==evidence.quotedText||!source.nativeLines.some(line=>line.text===evidence.quotedText&&line.bbox.every((v,index)=>v===evidence.bbox[index])))throw Error('Document fact evidence mismatch');
  assertAnchoredDocumentFactValue(candidate.field,candidate.rawText,candidate.normalizedValue,scope.locale);
  return digitizationFactCandidate.parse({schemaVersion:1,id:randomUUID(),organizationId:scope.organizationId,target:scope.target,version:1,...candidate,inputRevision:scope.inputRevision,review:{status:'pending',actorId:null,reviewedAt:null}});
 });
 return {candidates,requiresOcrPages:missing,reviewRequired:true as const};
}

/** Private preparation only. The eventual commit must check current actor,
 * lease, source bytes/grants and revision under transaction. Worker metadata
 * cannot supply identity, approval or public visibility. */
export function projectPrivateDocumentFactCandidates(value:unknown,current:unknown){
 const scope=context.parse(current),decoded=result.parse(value);
 if(decoded.productionOcrEnabled!==(decoded.extractionMethod==='generic-native-then-ocr-v1'))throw Error('OCR admission metadata mismatch');
 if(decoded.sourceSha256!==scope.sourceSha256||decoded.locale!==scope.locale)throw Error('Document fact source mismatch');
 const pages=new Map(decoded.pages.map(item=>[item.page,item]));
 if(pages.size!==decoded.pages.length||decoded.pages.some((item,index)=>item.page!==index+1))throw Error('Document fact page mismatch');
 const ocrPages=new Map(decoded.ocrPages.map(item=>[item.page,item]));
 if(ocrPages.size!==decoded.ocrPages.length)throw Error('Document OCR page mismatch');
 for(const item of decoded.ocrPages){
  const source=pages.get(item.page);
  if(!source?.requiresOcr||source.sha256!==item.pageRasterSha256||item.sourceDocumentSha256!==scope.sourceSha256)throw Error('Document OCR lineage mismatch');
 }
 if(decoded.pages.some(item=>item.requiresOcr&&!ocrPages.has(item.page)||!item.requiresOcr&&item.nativeLines.some(line=>line.page!==item.page)))throw Error('Document fact page evidence incomplete');
 return decoded.candidates.map(candidate=>{
  if(candidate.scoreMethod!==candidate.extractorVersion+'-uncalibrated'||candidate.extractorVersion==='generic-anchored-v2'&&!['unitId','landArea','unitArea','builtUpArea','terraceArea','bedrooms','livingRooms','bathrooms','parkingSpaces'].includes(candidate.field))throw Error('Unsupported document extractor profile');
  const evidence=candidate.evidence[0],source=pages.get(evidence.page);
  if(evidence.assetId!==scope.assetId||!source||candidate.rawText!==evidence.quotedText)throw Error('Document fact evidence mismatch');
  const lines=source.requiresOcr?ocrPages.get(source.page)!.tokens.map(item=>({text:item.text,bbox:[Math.min(...item.polygon.map(p=>p[0])),Math.min(...item.polygon.map(p=>p[1])),Math.max(...item.polygon.map(p=>p[0])),Math.max(...item.polygon.map(p=>p[1]))]})):source.nativeLines;
  if(!lines.some(line=>line.text===evidence.quotedText&&line.bbox.every((v,index)=>v===evidence.bbox[index])))throw Error('Document fact evidence is absent from source tokens');
  assertAnchoredDocumentFactValue(candidate.field,candidate.rawText,candidate.normalizedValue,scope.locale);
  return digitizationFactCandidate.parse({schemaVersion:1,id:randomUUID(),organizationId:scope.organizationId,target:scope.target,version:1,...candidate,inputRevision:scope.inputRevision,review:{status:'pending',actorId:null,reviewedAt:null}});
 });
}
