import {expect,it} from 'vitest';
import {prepareUnitForm} from '../../apps/api/src/inventory/digitization/unit-form';
import type {DigitizationFactCandidate} from '@haven/contracts';

it('only confirmed document facts populate fields and manual corrections retain user provenance',()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const candidate:DigitizationFactCandidate={schemaVersion:1,id,organizationId:id,target:{type:'listing',id,unitId:id},version:1,field:'bedrooms',rawText:'Self-authored fixture',normalizedValue:0,origin:'document',extractionScore:null,scoreMethod:'synthetic-policy-test',evidence:[{assetId:id,page:1,bbox:[0.1,0.1,0.9,0.2],coordinateSpace:'upright-page-normalized-top-left',quotedText:'Self-authored zero-bedroom fixture'}],review:{status:'accepted',actorId:id,reviewedAt:'2026-10-09T10:00:00.000Z'},extractorVersion:'synthetic-policy-test',inputRevision:1};
 expect(prepareUnitForm([candidate]).values.beds).toBe(0);
 expect(prepareUnitForm([candidate]).provenance.beds).toBe('confirmed_document');
 expect(prepareUnitForm([candidate],{beds:2}).provenance.beds).toBe('user');
 expect(prepareUnitForm([{...candidate,review:{status:'pending',actorId:null,reviewedAt:null}}]).values.beds).toBeNull();
});

it('missing document values remain empty without invented defaults',()=>{
 const form=prepareUnitForm([]);
 expect(Object.values(form.values)).toEqual(Array(8).fill(null));
 expect(form.missing).toHaveLength(8);expect(form.provenance).toEqual({});expect(form.ready).toBe(false);
});
it('explicit user completion validates the fixed inventory fields and preserves zero counts',()=>{
 const form=prepareUnitForm([],{communityId:'10000000-0000-4000-8000-000000000001',area:'96.00',beds:0,livingRooms:0,baths:1,orientation:'South',floor:0,privateAddress:'User supplied address'});
 expect(form.ready).toBe(true);expect(form.missing).toEqual([]);expect(Object.values(form.provenance)).toEqual(Array(8).fill('user'));
 expect(form.values.area).toBe('96.00');expect(form.values.beds).toBe(0);
});
it('blank or invalid manual values block submission instead of generating substitute values',()=>{
 const form=prepareUnitForm([],{area:'  ',beds:21,floor:201,privateAddress:'x'});
 expect(form.values.area).toBeNull();expect(form.provenance.area).toBeUndefined();expect(form.missing).toContain('area');
 expect(form.invalid).toEqual(expect.arrayContaining(['beds','floor','privateAddress']));expect(form.ready).toBe(false);
});
