import '../support/env';
import {test,expect} from '@playwright/test';

test('development buttons sign in as buyer and preserve the return route',async({page})=>{
 await page.goto('/api/v1/auth/login?prompt=login&returnTo=%2Faccount%2Fprofile');
 const panel=page.getByRole('region',{name:'Development test accounts'});
 await expect(panel).toBeVisible();
 for(const name of ['buyer','owner','agent','manager','tenant','developer','vendor','moderator','support','admin','outsider'])await expect(panel.getByRole('button',{name:'Sign in as '+name,exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Sign in as buyer',exact:true}).click();
 await expect(page).toHaveURL('http://localhost:8088/account/profile');
 const me=await page.request.get('/api/v1/me');expect(me.ok()).toBe(true);expect((await me.json()).data.roles).toContain('consumer');
});

test('development staff buttons sign in without OTP',async({page})=>{
 await page.goto('http://localhost:8089/api/v1/auth/login?prompt=login&returnTo=%2Fops');
 await page.getByRole('button',{name:'Sign in as developer',exact:true}).click();
 await expect(page).toHaveURL('http://localhost:8089/ops');
 await expect(page.getByLabel('One-time code',{exact:true})).toHaveCount(0);
 const me=await page.request.get('http://localhost:8089/api/v1/me');expect(me.ok()).toBe(true);expect((await me.json()).data.roles).toContain('developer');
});

test('development accounts can switch in the same browser session across applications',async({page})=>{
 let previousSession:string|undefined;
 for(const [origin,account,returnTo] of [
  ['http://localhost:8089','manager','/ops'],
  ['http://localhost:8089','agent','/ops'],
  ['http://localhost:8088','buyer','/account/profile']
 ]){
  await page.goto(origin+'/api/v1/auth/login?prompt=login&returnTo='+encodeURIComponent(returnTo));
  await page.getByRole('button',{name:'Sign in as '+account,exact:true}).click();
  await expect(page).toHaveURL(origin+returnTo);
  const me=await page.request.get(origin+'/api/v1/me');expect(me.ok()).toBe(true);
  expect((await me.json()).data.email).toBe(account+'@example.test');
  if(previousSession)expect((await page.request.get(origin+'/api/v1/me',{headers:{Cookie:'haven_session='+previousSession}})).status()).toBe(401);
  previousSession=(await page.context().cookies()).find(cookie=>cookie.name==='haven_session')?.value;
  expect(previousSession).toBeTruthy();
 }
});

test('development account switching clears provider state after losing the application cookie',async({page})=>{
 const origin='http://localhost:8089';
 await page.goto(origin+'/api/v1/auth/login?returnTo=%2Fops');
 await page.getByRole('button',{name:'Sign in as manager',exact:true}).click();
 await expect(page).toHaveURL(origin+'/ops');
 await page.context().clearCookies({name:'haven_session'});
 await page.goto(origin+'/api/v1/auth/login?returnTo=%2Fops');
 await page.getByRole('button',{name:'Sign in as agent',exact:true}).click();
 await expect(page).toHaveURL(origin+'/ops');
 const me=await page.request.get(origin+'/api/v1/me');expect(me.ok()).toBe(true);
 expect((await me.json()).data.email).toBe('agent@example.test');
});
