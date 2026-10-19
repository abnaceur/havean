import {expect,it} from 'vitest';
import {digitizationUnitPatch,digitizationUnitFactsChange} from '../../packages/contracts/src/digitization-inventory';
it('malformed or unsupported unit facts return validation errors without throwing decimal conversion exceptions',()=>{
 for(const area of ['abc','NaN','1e3','-1','0.00','100000.00','1.001',''])expect(digitizationUnitPatch.safeParse({area,areaBasis:'document_unit_area'}).success).toBe(false);
 expect(digitizationUnitPatch.parse({area:'99999.99',areaBasis:'document_unit_area'}).area).toBe('99999.99');
 expect(digitizationUnitPatch.safeParse({beds:21}).success).toBe(false);expect(digitizationUnitPatch.safeParse({baths:11}).success).toBe(false);
 expect(digitizationUnitPatch.safeParse({areaBasis:'document_unit_area'}).success).toBe(false);
});
it('canonical geography labels must bind the explicitly selected community',()=>{
 const id='10000000-0000-4000-8000-000000000001';
 expect(digitizationUnitFactsChange.safeParse({unitVersion:1,patch:{communityId:id}}).success).toBe(false);
 expect(digitizationUnitFactsChange.safeParse({unitVersion:1,patch:{communityId:id},location:{communityId:id,communityName:'Explicit community',districtName:'Explicit district',cityName:'Explicit city'}}).success).toBe(true);
});
