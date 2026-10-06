// This flow grants level 2 only after a successful OTP challenge for staff.
export const staffRole='haven-staff-mfa';
export const mfaFlows=[
 {alias:'haven-browser',providerId:'basic-flow',topLevel:true,builtIn:false,authenticationExecutions:[
  {authenticator:'auth-username-password-form',requirement:'REQUIRED',priority:10,authenticatorFlow:false},
  {flowAlias:'haven-staff-factor',requirement:'CONDITIONAL',priority:20,authenticatorFlow:true},
  {flowAlias:'haven-enrolled-factor',requirement:'CONDITIONAL',priority:30,authenticatorFlow:true}
 ]},
 {alias:'haven-staff-factor',providerId:'basic-flow',topLevel:false,builtIn:false,authenticationExecutions:[
  {authenticator:'conditional-user-role',authenticatorConfig:'haven-staff-role',requirement:'REQUIRED',priority:10,authenticatorFlow:false},
  {authenticator:'conditional-level-of-authentication',authenticatorConfig:'haven-level-two',requirement:'REQUIRED',priority:20,authenticatorFlow:false},
  {authenticator:'auth-otp-form',requirement:'REQUIRED',priority:30,authenticatorFlow:false}
 ]},
 {alias:'haven-enrolled-factor',providerId:'basic-flow',topLevel:false,builtIn:false,authenticationExecutions:[
  {authenticator:'conditional-user-role',authenticatorConfig:'haven-nonstaff-role',requirement:'REQUIRED',priority:10,authenticatorFlow:false},
  {authenticator:'conditional-user-configured',requirement:'REQUIRED',priority:20,authenticatorFlow:false},
  {authenticator:'conditional-level-of-authentication',authenticatorConfig:'haven-enrolled-level-one',requirement:'REQUIRED',priority:30,authenticatorFlow:false},
  {authenticator:'auth-otp-form',requirement:'REQUIRED',priority:40,authenticatorFlow:false}
 ]}
];
export const mfaConfigs=[
 {alias:'haven-nonstaff-role',config:{condUserRole:staffRole,negate:'true'}},
 {alias:'haven-staff-role',config:{condUserRole:staffRole,negate:'false'}},
 {alias:'haven-enrolled-level-one',config:{'loa-condition-level':'1','loa-max-age':'0'}},
 {alias:'haven-level-two',config:{'loa-condition-level':'2','loa-max-age':'0'}}
];
