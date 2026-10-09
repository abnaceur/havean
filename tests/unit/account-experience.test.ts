import {describe,it,expect} from 'vitest';
import {accountExperience,accountSectionVisible} from '../../packages/ui/src/account-experience';

describe('account presentation',()=>{
 it('keeps administration ahead of secondary finance and agency roles',()=>{
  expect(accountExperience(['finance','agency_manager','admin']).workspacePath).toBe('/ops/admin');
  expect(accountExperience(['finance','property_manager']).kind).toBe('manager');
 });
 it('distinguishes owner and tenant accounts from the shared consumer role',()=>{
  expect(accountExperience(['consumer','owner']).kind).toBe('owner');
  expect(accountExperience(['consumer','tenant']).webPath).toBe('/tenant/leases');
  expect(accountExperience(['consumer']).workspacePath).toBeNull();
 });
 it('does not create professional destinations from unknown role labels',()=>{
  expect(accountExperience(['admin/../../elsewhere']).workspacePath).toBeNull();
  expect(accountExperience([]).webPath).toBe('/account');
 });
 it('shows owner sections only to their intended roles and never accepts unknown sections',()=>{
  for(const section of ['properties','statements','management']){
   expect(accountSectionVisible(section,['consumer'])).toBe(false);
   expect(accountSectionVisible(section,['tenant'])).toBe(false);
   expect(accountSectionVisible(section,['owner','consumer'])).toBe(true);
  }
  expect(accountSectionVisible('privacy',['tenant'])).toBe(true);
  expect(accountSectionVisible('https://outside.invalid',['admin'])).toBe(false);
 });
});
