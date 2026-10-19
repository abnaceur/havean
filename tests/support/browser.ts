import {expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {completeOtp} from './totp';
const env=Object.fromEntries(fs.readFileSync(process.env.HAVEN_ENV_FILE||'.env','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
/** Preserve the actual gateway limit when many isolated journeys share one IP.
 * Retry only the idempotent logout/login navigation, never a password submit. */
async function rateAware<T extends {status():number;headers():Record<string,string>}>(request:()=>Promise<T>){
 const deadline=Date.now()+90000;
 for(;;){const response=await request();if(response.status()!==429)return response;
  const seconds=Number(response.headers()['retry-after']),delay=Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,30000):5000;
  if(Date.now()+delay>deadline)throw Error('The configured gateway rate limit did not clear within 90 seconds.');
  await new Promise(resolve=>setTimeout(resolve,delay));
 }
}
export async function login(page:Page,persona:string,origin=(process.env.PUBLIC_WEB_URL||'http://localhost:8088'),returnTo='/account'){await rateAware(()=>page.request.post(origin+'/api/v1/auth/logout',{headers:{Origin:origin}}));await rateAware(async()=>{const response=await page.goto(origin+'/api/v1/auth/login?prompt=login&returnTo='+encodeURIComponent(returnTo));if(!response)throw Error('Login navigation returned no response.');return response;});await expect(page.getByRole('heading',{name:'Sign in to your account'})).toBeVisible();if(await page.getByRole('button',{name:'Restart login'}).isVisible())await page.getByRole('button',{name:'Restart login'}).click();await page.getByRole('textbox',{name:'Username or email'}).fill(persona);await page.getByLabel('Password',{exact:true}).fill(env.DEV_PASSWORD);await page.getByRole('button',{name:'Sign In',exact:true}).click();await completeOtp(page,persona);await expect(page).toHaveURL(origin+returnTo);}
export async function apiRequest(page:Page,path:string,body:any,method='POST'){return page.request.fetch((process.env.PUBLIC_OPS_URL||'http://localhost:8089')+'/api/v1'+path,{method,headers:{Origin:(process.env.PUBLIC_OPS_URL||'http://localhost:8089'),'idempotency-key':crypto.randomUUID()},data:body});}
