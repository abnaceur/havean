import fs from 'node:fs';
import {URLSearchParams} from 'node:url';
import {mfaFlows,mfaConfigs,staffRole} from './identity-policy.mjs';
const generated=process.env.HAVEN_GENERATED_DIR||'infra/generated';
const realm=JSON.parse(fs.readFileSync(generated+'/haven-realm.json','utf8'));
const base=process.env.OIDC_INTERNAL_URL.replace(/\/realms\/[^/]+$/,'');
const response=await fetch(base+'/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({client_id:'admin-cli',grant_type:'password',username:'local-admin',password:process.env.KEYCLOAK_ADMIN_PASSWORD})});
if(!response.ok)throw new Error('Identity bootstrap authorization failed: '+response.status);
const {access_token:token}=await response.json();
async function admin(path,method='GET',body){
 const r=await fetch(base+'/admin/realms/'+realm.realm+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw new Error('Identity policy update failed: '+method+' '+path+' '+r.status);
 return r.status===204||r.headers.get('content-length')==='0'?null:r.json();
}
const roles=await admin('/roles');
if(!roles.some(r=>r.name===staffRole))await admin('/roles','POST',{name:staffRole});
for(const flow of mfaFlows){
 const flows=await admin('/authentication/flows');
 const nested=flow.topLevel?[]:await admin('/authentication/flows/haven-browser/executions');
 if(!flows.some(f=>f.alias===flow.alias)&&!nested.some(e=>e.displayName===flow.alias)){
  if(flow.topLevel)await admin('/authentication/flows','POST',{...flow,authenticationExecutions:undefined});
  else await admin('/authentication/flows/haven-browser/executions/flow','POST',{alias:flow.alias,type:'basic-flow',provider:'basic-flow',description:'Role-scoped mandatory staff OTP'});
 }
}
for(const flow of mfaFlows){
 for(const item of flow.authenticationExecutions){
  let executions=await admin('/authentication/flows/'+flow.alias+'/executions');
  let execution=executions.find(e=>item.authenticator?e.providerId===item.authenticator:e.displayName===item.flowAlias);
  if(!execution){await admin('/authentication/flows/'+flow.alias+'/executions/execution','POST',{provider:item.authenticator});executions=await admin('/authentication/flows/'+flow.alias+'/executions');execution=executions.find(e=>e.providerId===item.authenticator);}
  await admin('/authentication/flows/'+flow.alias+'/executions','PUT',{...execution,requirement:item.requirement});
  if(item.authenticatorConfig){const config=mfaConfigs.find(c=>c.alias===item.authenticatorConfig);if(execution.authenticationConfig)await admin('/authentication/config/'+execution.authenticationConfig,'PUT',config);else await admin('/authentication/executions/'+execution.id+'/config','POST',config);}
 }
}
await admin('','PUT',{browserFlow:'haven-browser'});
if(process.env.DEV_PASSWORD){
 // Only generated local personas receive test credentials. Production users enroll themselves.
 const staff=realm.users.filter(u=>u.realmRoles.includes(staffRole));
 const marker=generated+'/mfa-provisioned.json';
 const prior=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')):[];
 const users=staff.filter(u=>!prior.includes(u.id));
 if(users.length){await admin('/partialImport','POST',{ifResourceExists:'OVERWRITE',users});fs.writeFileSync(marker,JSON.stringify([...prior,...users.map(u=>u.id)]),{mode:0o600});}
}
console.log('Identity staff OTP and verified level-2 policy configured.');
