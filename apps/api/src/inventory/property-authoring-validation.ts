import {z} from 'zod';
import {draftFacts,draftUnit,type PropertyAuthoringData} from '@haven/contracts';

// Canonical inventory constraints stay authoritative. Keep raw, unfinished input
// saveable; only advancing a step, preparing media or submitting invokes these.
export function authoringFacts(d:PropertyAuthoringData){const v=d.values;return {...v,price:v.price||null,availableFrom:v.availableFrom||null,rentPeriod:v.transaction==='rent'?v.rentPeriod:null,features:v.features.split(',').map(x=>x.trim()).filter(Boolean),...(v.segment==='commercial'?{commercial:{...d.commercial,floor:d.commercial.floor===''?null:integer(d.commercial.floor),parkingSpaces:d.commercial.parkingSpaces===''?null:integer(d.commercial.parkingSpaces),permittedUses:d.commercial.permittedUses.split(',').map(x=>x.trim()).filter(Boolean)}}:{})};}
function integer(value:string){return /^-?\d+$/.test(value)?Number(value):NaN;}
export function authoringUnit(d:PropertyAuthoringData){return {...d.unit,beds:d.values.segment==='commercial'?0:integer(d.unit.beds),livingRooms:d.values.segment==='commercial'?0:integer(d.unit.livingRooms),baths:integer(d.unit.baths),floor:integer(d.unit.floor)};}
export function validateAuthoringFields(d:PropertyAuthoringData,through:0|1){
 const issues:z.core.$ZodIssue[]=[];
 const collect=(result:z.ZodSafeParseResult<unknown>,prefix:string)=>{if(!result.success)for(const issue of result.error.issues)issues.push({...issue,path:[prefix+'.'+issue.path.join('.')]});};
 collect(z.object({title:draftFacts.shape.title,transaction:draftFacts.shape.transaction,segment:draftFacts.shape.segment}).safeParse(d.values),'values');
 if(d.newUnit)collect(draftUnit.safeParse(authoringUnit(d)),'unit');
 else if(!z.uuid().safeParse(d.unitId).success)issues.push({code:'custom',path:['unitId'],message:'Select an existing property unit.'});
 if(through===1){
  const parsed=draftFacts.safeParse(authoringFacts(d));
  if(!parsed.success)for(const issue of parsed.error.issues){const path=issue.path.map(String);if(path[0]==='title')continue;issues.push({...issue,path:[path[0]==='commercial'?path.slice(0,2).join('.'):'values.'+path[0]]});}
  if(!d.values.price||/^0+(\.0+)?$/.test(d.values.price))issues.push({code:'custom',path:['values.price'],message:'Enter a positive asking price.'});
 }
 if(issues.length)throw new z.ZodError(issues);
}
