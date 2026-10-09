// Development uses real password authentication without a second factor.
// All other modes keep staff MFA enforcement; no client parameter can opt out.
export function requestedAcr(mode:string){return mode==='development'?'1':'2';}
export function requiresStaffMfa(mode:string,roles:string[],acr:unknown){
 return mode!=='development'&&roles.some(role=>!['consumer','owner','tenant'].includes(role))&&!(Number(acr)>=2);
}
