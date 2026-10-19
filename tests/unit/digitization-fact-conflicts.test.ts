import {expect,it} from 'vitest';
import type {DigitizationFactCandidate} from '@haven/contracts';
import {conflictingFactFields,factValueKey} from '../../apps/api/src/inventory/digitization/fact-conflicts';
function fact(amount:string,status:DigitizationFactCandidate['review']['status']='pending'):DigitizationFactCandidate{
 return {field:'unitArea',normalizedValue:{amount,unit:'m2',basis:'document_unit_area'},review:{status,actorId:null,reviewedAt:null}} as DigitizationFactCandidate;
}
it('compares decimal quantities exactly without floating point and preserves basis and units',()=>{
 expect(factValueKey(fact('96.2500').normalizedValue)).toBe(factValueKey(fact('096.25').normalizedValue));
 expect(conflictingFactFields([fact('96.25','accepted'),fact('96.250')])).toEqual([]);
 expect(conflictingFactFields([fact('96.25','accepted'),fact('96.26')])).toEqual(['unitArea']);
 const other=fact('96.25');other.normalizedValue={amount:'96.25',unit:'m2',basis:'plot_area'};
 expect(conflictingFactFields([fact('96.25'),other])).toEqual(['unitArea']);
});
it('rejecting or abstaining resolves competing values; explicit conflict blocks even equal values',()=>{
 expect(conflictingFactFields([fact('96.25','accepted'),fact('100','rejected'),fact('120','unknown')])).toEqual([]);
 expect(conflictingFactFields([fact('96.25','accepted'),fact('96.25','conflict')])).toEqual(['unitArea']);
});
