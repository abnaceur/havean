import {fail} from '../../platform/core.js';
/** Declaration only. Actual codec/rotation/duration acceptance belongs to the confined worker. */
export function smallVideoContainerMime(body:Buffer){
 if(body.length<16)fail(422,'Video has no supported container declaration.','SOURCE_MIME_INVALID');
 if(body.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))){
  const header=body.subarray(0,4096);if(!header.includes(Buffer.from('webm')))fail(422,'Select a supported WebM container.','SOURCE_MIME_INVALID');return 'video/webm';
 }
 if(!body.subarray(4,8).equals(Buffer.from('ftyp')))fail(422,'Video has no supported container declaration.','SOURCE_MIME_INVALID');
 const length=body.readUInt32BE(0);if(length<16||length>Math.min(body.length,4096)||length%4!==0)fail(422,'Video container declaration is invalid.','SOURCE_MIME_INVALID');
 const brands=[body.subarray(8,12).toString('latin1')];for(let offset=16;offset<length;offset+=4)brands.push(body.subarray(offset,offset+4).toString('latin1'));
 if(brands.includes('qt  '))return 'video/quicktime';if(brands.some(brand=>['isom','iso2','mp41','mp42','avc1'].includes(brand)))return 'video/mp4';
 fail(422,'Video container requires an unsupported profile.','SOURCE_MIME_INVALID');
}
