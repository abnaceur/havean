import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
function fontAsset(name:string){
 let root=dirname(fileURLToPath(import.meta.url));
 for(let depth=0;depth<12;depth++){
  const path=join(root,'assets','digitization-fonts',name);if(existsSync(path))return path;
  const parent=dirname(root);if(parent===root)break;root=parent;
 }
 throw new Error('PLAN_FONT_ASSET_UNAVAILABLE');
}
export const planFontSha256='abdc775b21b1bc470d50c97e790d276f2054b7504e56e5bd3e64f48d68582322';
export function planFontNotice(){
 const bytes=readFileSync(fontAsset('LICENSE.txt'));
 if(createHash('sha256').update(bytes).digest('hex')!=='63d3ba759d12804c5b31a9d5940d855c1820d1f5999e6b0872eb1c7ff045fbc9')throw new Error('PLAN_FONT_NOTICE_INVALID');
 return bytes.toString('utf8');
}
let cached:string|undefined;
export function embeddedPlanFont(){
 if(cached)return cached;
 const bytes=readFileSync(fontAsset('DejaVuSans.ttf'));
 if(createHash('sha256').update(bytes).digest('hex')!==planFontSha256)throw new Error('PLAN_FONT_PROFILE_INVALID');
 cached=bytes.toString('base64');return cached;
}
/** Native librsvg/Pango uses the installed face; browsers use the embedded face.
 * Refuse an unavailable or different native font instead of substitution. */
export function requireNativePlanFont(){
 const bytes=readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
 if(createHash('sha256').update(bytes).digest('hex')!==planFontSha256)throw new Error('PLAN_FONT_PROFILE_INVALID');
}
