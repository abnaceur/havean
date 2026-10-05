import {expect,type Browser,type Page} from '@playwright/test';
import {login,apiRequest} from './browser';
export async function publishDevelopmentBrowser(browser:Browser,owner:Page,id:string,status:'coming_soon'|'on_sale'='on_sale'){
 const state=(await (await owner.request.get('http://localhost:8089/api/v1/ops/developments/'+id+'/publication')).json()).data,submitted=await apiRequest(owner,'/ops/developments/'+id+'/submit',{version:state.project.version,requestedStatus:status,confirm:true});expect(submitted.status()).toBe(201);const source=(await submitted.json()).data;
 const context=await browser.newContext({viewport:owner.viewportSize()!});try{const moderator=await context.newPage();await login(moderator,'moderator','http://localhost:8089','/ops/reviews');const decided=await apiRequest(moderator,'/ops/development-reviews/'+id+'/decision',{version:source.project.version,reviewVersion:source.review.version,decision:'approved',reason:'Independently reviewed synthetic browser fixture and type inventory',verified:true});expect(decided.status()).toBe(201);return (await decided.json()).data.project;}finally{await context.close();}
}
