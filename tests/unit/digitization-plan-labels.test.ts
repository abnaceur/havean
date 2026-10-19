import {expect,it} from 'vitest';
import {proposePlanLabels} from '../../apps/api/src/inventory/digitization/plan-labels';
const selection={digitizationId:'00000000-0000-4000-8000-000000000001',workspaceVersion:1,inputRevision:1,artifactId:'00000000-0000-4000-8000-000000000002',source:{kind:'asset' as const,assetId:'00000000-0000-4000-8000-000000000003',page:1,originalToModel:[0,-1,100,-1,0,200,0,0,1]},width:100,height:200,uprightWidth:200,uprightHeight:100,modelToOriginal:[0,-1,200,-1,0,100,0,0,1],uprightToModel:[0,-1,100,-1,0,200,0,0,1],unit:'px' as const,scaleStatus:'unscaled' as const};
const token={text:'Kitchen',score:0,polygon:[[.1,.2],[.3,.2],[.3,.4],[.1,.4]]};
it('literal English/Arabic text maps from normalized upright pixels into rotated Y-up model coordinates without approval or inferred room types',()=>{
 const labels=proposePlanLabels([token,{...token,text:'مطبخ'}],selection);
 expect(labels).toEqual([{id:'label-0',text:'Kitchen',polygon:[{x:80,y:180},{x:80,y:140},{x:60,y:140},{x:60,y:180}],confirmed:false},{id:'label-1',text:'مطبخ',polygon:[{x:80,y:180},{x:80,y:140},{x:60,y:140},{x:60,y:180}],confirmed:false}]);
 expect(labels[0]).not.toHaveProperty('roomType');expect(labels[0]).not.toHaveProperty('confidence');
});
it('abstains on missing, overlong, control-bearing or degenerate text and caps proposals while rejecting malformed token receipts',()=>{
 expect(proposePlanLabels([],selection)).toEqual([]);
 expect(proposePlanLabels([{...token,text:' '},{...token,text:'a'.repeat(81)},{...token,text:'bad\u202etext'},{...token,polygon:[[.1,.2],[.1,.2],[.1,.2],[.1,.2]]}],selection)).toEqual([]);
 expect(proposePlanLabels(Array.from({length:201},()=>token),selection)).toHaveLength(200);
 expect(()=>proposePlanLabels([{...token,polygon:[[2,.2],[.3,.2],[.3,.4],[.1,.4]]}],selection)).toThrow();
 expect(()=>proposePlanLabels(Array.from({length:5001},()=>token),selection)).toThrow();
});
