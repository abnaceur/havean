import {test,expect} from 'vitest';
import {requestedAcr,requiresStaffMfa} from '../../apps/api/src/identity/mfa-policy';
// @ts-expect-error Bootstrap policy is native JavaScript.
import {browserFlowFor,developmentFlow,mfaFlows} from '../../scripts/identity-policy.mjs';

test('only development selects password-only identity flow and staff authorization',()=>{
 expect(browserFlowFor('development')).toBe('haven-development-browser');
 expect(developmentFlow.authenticationExecutions.map((x:any)=>x.authenticator)).toEqual(['auth-username-password-form']);
 expect(requestedAcr('development')).toBe('1');
 expect(requiresStaffMfa('development',['admin'],undefined)).toBe(false);
 for(const mode of ['production','test','', 'staging']){
  expect(browserFlowFor(mode)).toBe('haven-browser');expect(requestedAcr(mode)).toBe('2');
  for(const acr of [undefined,null,0,1,'1','invalid'])expect(requiresStaffMfa(mode,['admin'],acr)).toBe(true);
  expect(requiresStaffMfa(mode,['admin'],'2')).toBe(false);
  expect(requiresStaffMfa(mode,['consumer','owner','tenant'],1)).toBe(false);
 }
 expect(mfaFlows.find((flow:any)=>flow.alias==='haven-staff-factor').authenticationExecutions).toContainEqual(expect.objectContaining({authenticator:'auth-otp-form',requirement:'REQUIRED'}));
});
