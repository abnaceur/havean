import {it,expect} from 'vitest';
import {digitizationTenantDeletionCreate,digitizationTenantDeletionReceipt} from '../../packages/contracts/src/digitization-tenant-deletion';
it('tenant erasure requires an explicit confirmation and opaque current scope without accepting object keys',()=>{
 const input={scopeVersion:'a'.repeat(64),deletionConfirmed:true,reason:'Remove engine files from the requested tenant'};
 expect(digitizationTenantDeletionCreate.parse(input)).toEqual(input);
 for(const change of [{deletionConfirmed:false},{scopeVersion:'1'},{objectKey:'other-tenant/file'},{reason:'short'}])expect(digitizationTenantDeletionCreate.safeParse({...input,...change}).success).toBe(false);
});
it('an accepted tenant request cannot claim that asynchronous online cleanup has already completed',()=>{
 const receipt={id:crypto.randomUUID(),organizationId:crypto.randomUUID(),version:1,state:'requested',accessRevoked:true,onlineCleanupComplete:false,retainedBusinessRecords:true};
 expect(digitizationTenantDeletionReceipt.parse(receipt)).toEqual(receipt);
 expect(digitizationTenantDeletionReceipt.safeParse({...receipt,onlineCleanupComplete:true}).success).toBe(false);
});
