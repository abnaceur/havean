import {describe,it,expect} from 'vitest';
import {digitizationScenePrivacyCreate} from '../../packages/contracts/src/digitization-scene-privacy';
import {validateSceneCoverage} from '../../apps/api/src/inventory/digitization/scene-privacy';
const input=()=>digitizationScenePrivacyCreate.parse({workspaceVersion:1,inputRevision:1,artifactId:crypto.randomUUID(),geometryRevisionId:crypto.randomUUID(),coverage:[{roomId:'living',status:'partial'},{roomId:'bedroom',status:'unknown'}],inspection:'issues_found',note:'Sensitive objects remain in the living room.'});
describe('private scene coverage declarations',()=>{
 it('requires explicit incomplete and unknown room coverage instead of implying completeness',()=>{expect(validateSceneCoverage(input(),['bedroom','living']).coverage.map(room=>room.status)).toEqual(['partial','unknown']);for(const ids of [['living'],['living','bedroom','hall']])expect(()=>validateSceneCoverage(input(),ids)).toThrow();});
 it('rejects duplicate and foreign rooms, absent plans and caller-supplied approval/publication',()=>{const x=input();expect(()=>validateSceneCoverage({...x,coverage:[{roomId:'foreign',status:'covered'},{roomId:'bedroom',status:'unknown'}]},['living','bedroom'])).toThrow();for(const value of [{...x,coverage:[x.coverage[0],x.coverage[0]]},{...x,geometryRevisionId:null},{...x,reviewStatus:'approved'},{...x,publiclyServed:true}])expect(digitizationScenePrivacyCreate.safeParse(value).success).toBe(false);});
 it('keeps no-plan coverage unknown and allows recording unresolved privacy issues',()=>{expect(validateSceneCoverage({...input(),geometryRevisionId:null,coverage:[]},[]).inspection).toBe('issues_found');});
});
