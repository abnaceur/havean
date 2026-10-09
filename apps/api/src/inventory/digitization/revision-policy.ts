import {createHash} from 'node:crypto';
import type {DigitizationRun} from '@haven/contracts';
export type RevisionSource={assetId:string;assetVersion:number;purpose:string;sha256:string;bytes:string;detectedMime:string;decoderState:string};
type Stage=DigitizationRun['stages'][number]['type'];
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function selected(sources:readonly RevisionSource[],purposes:readonly string[]){return sources.filter(s=>purposes.includes(s.purpose)).map(s=>({assetId:s.assetId,assetVersion:s.assetVersion,purpose:s.purpose,sha256:s.sha256,bytes:s.bytes,detectedMime:s.detectedMime,decoderState:s.decoderState})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
export function revisionDomains(sources:readonly RevisionSource[]){return {documents:hash(selected(sources,['document'])),plans:hash(selected(sources,['plan'])),media:hash(selected(sources,['photo','panorama']))};}
export function revisionChange(before:readonly RevisionSource[]|null,after:readonly RevisionSource[]){const old=before?revisionDomains(before):null,next=revisionDomains(after);return {documentsChanged:!old||old.documents!==next.documents,plansChanged:!old||old.plans!==next.plans,mediaChanged:!old||old.media!==next.media,domains:next};}
/** Pure dependency policy, not an artifact grant or a publication approval.
 * Model/profile/config/geometry compatibility is checked by the reuse port. */
export function reusableStageInputs(stage:Stage,before:readonly RevisionSource[],after:readonly RevisionSource[]){const change=revisionChange(before,after);
 if(['document_classify','document_ocr','fact_extract'].includes(stage))return !change.documentsChanged;
 if(stage==='document_rasterize')return !change.documentsChanged&&!change.plansChanged;
 if(['plan_trace','geometry_render'].includes(stage))return !change.plansChanged&&!change.documentsChanged;
 if(['media_probe','frame_select','panorama_optimize','camera_solve','splat_train','scene_export'].includes(stage))return !change.mediaChanged&&!change.plansChanged;
 return !change.documentsChanged&&!change.plansChanged&&!change.mediaChanged;
}
