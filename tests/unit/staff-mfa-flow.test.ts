import {it,expect} from 'vitest';
import {mfaFlows,mfaConfigs} from '../../scripts/identity-policy.mjs';
it('F06/P09 reachable browser LoA keys are unique for pinned Keycloak discovery and reserve level 2 for required staff OTP',()=>{
 const configs=new Map(mfaConfigs.map((c:any)=>[c.alias,c.config])),flows=new Map(mfaFlows.map((f:any)=>[f.alias,f])),levels:{level:string;flow:string}[]=[];
 function visit(alias:string){const flow=flows.get(alias) as any;expect(flow).toBeDefined();for(const e of flow.authenticationExecutions){if(e.authenticatorFlow)visit(e.flowAlias);else if(e.authenticator==='conditional-level-of-authentication'){const c=configs.get(e.authenticatorConfig) as any;expect(c).toBeDefined();levels.push({level:c['loa-condition-level'],flow:alias});}}}visit('haven-browser');
 expect(new Set(levels.map(l=>l.level)).size).toBe(levels.length);expect(levels.filter(l=>l.level==='2')).toEqual([{level:'2',flow:'haven-staff-factor'}]);const staff=flows.get('haven-staff-factor') as any;expect(staff.authenticationExecutions.some((e:any)=>e.authenticator==='auth-otp-form'&&e.requirement==='REQUIRED')).toBe(true);
});
