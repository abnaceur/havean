import {config,notificationWorkerHeaders} from '@haven/config';
export async function alertServiceCall(path:string,method='GET',body?:unknown){const env=config(),route='/api/v1/internal/alerts'+path;const response=await fetch(env.API_INTERNAL_URL+route,{method,headers:{Origin:env.PUBLIC_WEB_URL,...notificationWorkerHeaders(method,route,body,env.SESSION_KEY),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('ALERT_SERVICE_'+response.status);return(await response.json()).data;}
export async function planPublicationAlerts(eventId:string,version:number){return alertServiceCall('/plan/'+eventId,'POST',{version:0,listingVersion:version});}
export async function deliverAlertDigest(id:string){const current=await alertServiceCall('/'+id);return alertServiceCall('/'+id+'/deliver','POST',{version:current.version});}
export async function dueAlertDigests(){return alertServiceCall('/due') as Promise<{id:string;version:number}[]>;}

export async function confirmInquiry(eventId:string){return alertServiceCall('/transactional/'+eventId,'POST',{version:0});}
