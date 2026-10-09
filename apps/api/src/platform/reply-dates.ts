/** Normalize PostgreSQL dates at the JSON response boundary without changing
 * decimal strings or mutating the controller/cache result. Copy only branches
 * that contain a Date; response schemas still strip private fields afterwards. */
export function replyDates(value:unknown):unknown{
 if(!value||typeof value!=='object')return value;
 if(value instanceof Date)return value.toJSON();
 if(Array.isArray(value)){
  let copy:unknown[]|undefined;
  for(let index=0;index<value.length;index++){const child=replyDates(value[index]);if(child!==value[index]){copy??=value.slice();copy[index]=child;}}
  return copy||value;
 }
 const row=value as Record<string,unknown>;let copy:Record<string,unknown>|undefined;
 for(const key in row){if(!Object.hasOwn(row,key))continue;const child=replyDates(row[key]);if(child!==row[key]){copy??={...row};copy[key]=child;}}
 return copy||value;
}
