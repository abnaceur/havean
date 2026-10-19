const digits='٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const translate=(value:string)=>value.replace(/[٠-٩۰-۹]/g,char=>String(digits.indexOf(char)%10));
const areas:Record<string,[string,string]>={unitArea:['(?:unit area|surface de l.unité|مساحة الوحدة)','document_unit_area'],landArea:['(?:land area|superficie du terrain|مساحة الأرض)','document_land_area'],builtUpArea:['(?:built.up area|surface bâtie|المساحة المبنية)','document_built_up_area'],terraceArea:['(?:terrace area|surface de la terrasse|مساحة الشرفة)','document_terrace_area']};
const counts:Record<string,string>={bedrooms:'(?:bedrooms|bedroom count|nombre de chambres|عدد غرف النوم)',livingRooms:'(?:living rooms|living room count|nombre de salons|عدد غرف المعيشة)',bathrooms:'(?:bathrooms|bathroom count|nombre de salles de bains|عدد الحمامات)',parkingSpaces:'(?:parking spaces|parking space count|nombre de places de parking|عدد مواقف السيارات)'};
const textLabels:Record<string,string>={country:'(?:country|pays|البلد|الدولة)',region:'(?:region|emirate|wilaya|région|ولاية|إمارة)',city:'(?:city|ville|المدينة)',district:'(?:district|quartier|الحي)',address:'(?:property address|address|adresse|عنوان العقار|العنوان)',propertyType:'(?:property type|type de bien|نوع العقار)',tenure:'(?:tenure|type de tenure|نوع الحيازة)',ownerName:'(?:owner name|nom du propriétaire|اسم المالك)',boundary:'(?:boundary|boundaries|limites|الحدود)'};
const identifierLabels:Record<string,string>={plotId:'(?:plot (?:number|id)|numéro de parcelle|رقم القطعة)',buildingId:'(?:building (?:number|id)|numéro du bâtiment|رقم المبنى)',floorId:'(?:floor (?:number|id)|numéro de l.étage|رقم الطابق)',registryId:'(?:registry (?:number|id)|numéro du registre|رقم السجل)',ownerId:'(?:owner (?:number|id)|identifiant du propriétaire|رقم المالك)'};


function decimal(raw:string,locale:string){
 const value=translate(raw).trim().replace(/[\u00a0\u202f]/g,' ');
 let separator=locale==='fr'?',':'.',group=locale==='fr'?' ':',';
 if(/[٫٬]/.test(value)){if(/[.,]/.test(value))throw Error('Ambiguous document quantity');separator='٫';group='٬';}
 const parts=value.split(separator);if(parts.length>2||parts.length===2&&!/^[0-9]{1,8}$/.test(parts[1]))throw Error('Invalid document quantity');
 let whole=parts[0];
 if(whole.includes(group)){const groups=whole.split(group);if(!/^[0-9]{1,3}$/.test(groups[0])||groups.slice(1).some(part=>!/^[0-9]{3}$/.test(part)))throw Error('Ambiguous document quantity');whole=groups.join('');}
 if(!/^[0-9]{1,13}$/.test(whole))throw Error('Invalid document quantity');
 return whole.replace(/^0+(?=\d)/,'')+(parts.length===2?'.'+parts[1]:'');
}

/** Recheck a worker proposal against its actual quote. Decimal strings remain
 * strings; inference scores and source labels never approve inventory facts. */
export function assertAnchoredDocumentFactValue(field:string,text:string,value:unknown,locale:string){
 if(areas[field]){
  const [label,basis]=areas[field],match=text.match(new RegExp(label+'\\s*[:：]?\\s*([0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٫٬ \\u00a0\\u202f]{0,63}?)\\s*(m²|m2|m\\^2|م²|م2|متر مربع|ft²|ft2|ha)(?![\\p{L}\\p{N}_²])','iu'));
  if(!match||!value||typeof value!=='object')throw Error('Unsupported document fact value');
  const quantity=value as {amount?:unknown;unit?:unknown;basis?:unknown},raw=match[2].toLowerCase(),unit=raw.startsWith('ft')?'ft2':raw==='ha'?'ha':'m2';
  if(quantity.amount!==decimal(match[1],locale)||quantity.unit!==unit||quantity.basis!==basis)throw Error('Unsupported document fact value');
  return;
 }
 if(field==='unitId'){
  const match=text.match(/(?:unit (?:number|no\.?|id)|numéro de l.unité|رقم الوحدة)\s*[:：]\s*([\p{L}\p{N}_/-]{1,200})(?!\S)/iu);
  if(!match||value!==translate(match[1])||['unknown','n/a','inconnu'].includes(match[1].toLowerCase()))throw Error('Unsupported document fact value');return;
 }
 if(counts[field]){
  const matches=text.matchAll(new RegExp('(?:^|[;\\n])\\s*'+counts[field]+'\\s*[:：]\\s*([0-9٠-٩۰-۹]{1,5})\\s*(?=$|[;\\n])','giu'));
  const suffixes:Record<string,string>={bedrooms:'(?:bedrooms?|chambres?|غرف نوم)',livingRooms:'(?:living rooms?|salons?|غرف معيشة)',bathrooms:'(?:bathrooms?|salles? de bains?|حمامات)',parkingSpaces:'(?:parking spaces?|places? de parking|مواقف سيارات)'};
  const suffix=text.matchAll(new RegExp('(?:^|[;\\n])\\s*(?:[-•]\\s*)?([0-9٠-٩۰-۹]{1,5})\\s+'+suffixes[field]+'\\s*(?=$|[;\\n])','giu'));
  if(![...matches,...suffix].some(match=>Number(translate(match[1]))===value))throw Error('Unsupported document fact value');return;
 }
 if(textLabels[field]){
  const matches=text.matchAll(new RegExp('(?:^|[;\\n])\\s*'+textLabels[field]+'\\s*[:：]\\s*([^;\\n]{1,500})\\s*(?=$|[;\\n])','giu'));
  if(![...matches].some(match=>match[1].trim()===value&&!['unknown','not available','n/a','inconnu','non disponible','غير معروف','غير متوفر'].includes(match[1].trim().toLowerCase())))throw Error('Unsupported document text fact');return;
 }
 if(identifierLabels[field]){
  const matches=text.matchAll(new RegExp('(?:^|[;\\n])\\s*'+identifierLabels[field]+'\\s*[:：]\\s*([\\p{L}\\p{N}_/-]{1,200})\\s*(?=$|[;\\n])','giu'));
  if(![...matches].some(match=>translate(match[1])===value&&!['unknown','n/a','inconnu'].includes(match[1].toLowerCase())))throw Error('Unsupported document identifier');return;
 }
 throw Error('Unsupported document fact field');
}
