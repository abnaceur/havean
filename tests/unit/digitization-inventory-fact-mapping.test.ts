import {expect,it} from 'vitest';
import type {DigitizationFactCandidate} from '@haven/contracts';
import {mapConfirmedUnitFacts} from '../../apps/api/src/inventory/digitization/inventory-fact-mapping';
const id='10000000-0000-4000-8000-000000000001';
function confirmed(field:DigitizationFactCandidate['field'],value:DigitizationFactCandidate['normalizedValue']):DigitizationFactCandidate{return {schemaVersion:1,id,organizationId:id,target:{type:'listing',id,unitId:id},version:1,field,rawText:'Self-authored test evidence; no country benchmark',normalizedValue:value,origin:'document',extractionScore:null,scoreMethod:'synthetic-manual-policy-test',evidence:[{assetId:id,page:1,bbox:[0.1,0.1,0.9,0.2],coordinateSpace:'upright-page-normalized-top-left',quotedText:'Self-authored fixture quote'}],review:{status:'accepted',actorId:id,reviewedAt:'2026-10-09T10:00:00.000Z'},extractorVersion:'synthetic-manual-policy-test-v1',inputRevision:1};}
it('confirmed unit-area decimal strings and explicit counts map without defaults or source text',()=>{
 const area=confirmed('unitArea',{amount:'12345678.91',unit:'m2',basis:'document_unit_area'});
 expect(mapConfirmedUnitFacts([area,confirmed('bedrooms',0),confirmed('bathrooms',2)])).toEqual({area:'12345678.91',areaBasis:'document_unit_area',beds:0,baths:2});
 expect(mapConfirmedUnitFacts([confirmed('livingRooms',1)])).toEqual({livingRooms:1});
});
it('ambiguous basis, other area types/units, unconfirmed facts and excess precision cannot change inventory',()=>{
 for(const value of [{amount:'96.00',unit:'m2',basis:'unknown'},{amount:'96.00',unit:'m2',basis:'geometry_room_net'},{amount:'1000',unit:'ft2',basis:'document_unit_area'},{amount:'96.001',unit:'m2',basis:'document_unit_area'},{amount:'0.00',unit:'m2',basis:'document_unit_area'}] as const)expect(()=>mapConfirmedUnitFacts([confirmed('unitArea',value)])).toThrow();
 expect(()=>mapConfirmedUnitFacts([confirmed('landArea',{amount:'96.00',unit:'m2',basis:'document_land_area'})])).toThrow();
 const pending=confirmed('bedrooms',2);pending.review={status:'pending',actorId:null,reviewedAt:null};expect(()=>mapConfirmedUnitFacts([pending])).toThrow();
});
it('competing confirmations, ownership identifiers and unsupported counts require separate review',()=>{
 expect(()=>mapConfirmedUnitFacts([confirmed('bedrooms',2),confirmed('bedrooms',3)])).toThrow();
 expect(()=>mapConfirmedUnitFacts([confirmed('ownerName','PRIVATE_OWNER_SENTINEL')])).toThrow();
 expect(()=>mapConfirmedUnitFacts([confirmed('unitId','0001')])).toThrow();
 expect(()=>mapConfirmedUnitFacts([confirmed('bedrooms',101)])).toThrow();
});
