import '../support/env';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {login} from '../support/browser';
const evidence='evidence/haven-design/auth';
const viewports=[{width:320,height:740},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080},{width:844,height:390}];
async function assertLayout(page:import('@playwright/test').Page){
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const form=page.locator('main');await expect(form).toBeVisible();
 const box=await form.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
 if(page.viewportSize()!.width>=1024)expect(box!.width).toBeGreaterThanOrEqual(400);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
}
test('Haven sign-in, registration and recovery fit phone, tablet, desktop and landscape',async({page},testInfo)=>{
 fs.mkdirSync(evidence,{recursive:true});
 for(const viewport of viewports){
  await page.setViewportSize(viewport);
  await page.goto('/api/v1/auth/login?prompt=login&returnTo=%2Faccount%2Fprofile');
  await expect(page.getByRole('heading',{name:'Sign in to your account'})).toBeVisible();
  await expect(page.locator('.haven-auth-intro')).toHaveText('Welcome back. Pick up where you left off.');
  await assertLayout(page);
  if([390,1440].includes(viewport.width))await page.screenshot({path:`${evidence}/login-${testInfo.project.name}-${viewport.width}.png`,fullPage:true});
  await page.getByRole('link',{name:'Register',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible();
  await assertLayout(page);
  if([390,1440].includes(viewport.width))await page.screenshot({path:`${evidence}/register-${testInfo.project.name}-${viewport.width}.png`,fullPage:true});
  await page.getByRole('link',{name:/Back to Login/i}).click();
  await page.getByRole('link',{name:'Forgot Password?'}).click();
  await expect(page.getByRole('heading',{name:'Forgot your password?'})).toBeVisible();
  await assertLayout(page);
  if([390,1440].includes(viewport.width))await page.screenshot({path:`${evidence}/forgot-${testInfo.project.name}-${viewport.width}.png`,fullPage:true});
 }
});
test('Native password visibility and credential validation remain usable',async({page})=>{
 await page.goto('/api/v1/auth/login?prompt=login');
 const password=page.getByLabel('Password',{exact:true});
 await password.fill('invalid-fixture-password');
 await page.getByRole('button',{name:'Show password',exact:true}).click();
 await expect(password).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Hide password',exact:true}).click();
 await expect(password).toHaveAttribute('type','password');
 await page.getByRole('textbox',{name:'Username or email'}).fill('haven-missing-auth-fixture');
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await expect(page.getByText(/Invalid username or password/i)).toBeVisible();
 await assertLayout(page);
 await page.getByRole('link',{name:'Register',exact:true}).click();
 await page.locator('#username').fill('haven-validation-'+Date.now());
 await page.locator('#email').fill('haven-validation@example.test');
 await page.locator('#firstName').fill('Haven');await page.locator('#lastName').fill('Validation');
 await page.locator('#password').fill('fixture-password-one');await page.locator('#password-confirm').fill('fixture-password-two');
 await page.getByRole('button',{name:'Register',exact:true}).click();
 await expect(page.locator('#input-error-password-confirm')).toBeVisible();
 await assertLayout(page);
});
test('Password recovery keeps its neutral confirmation and return path',async({page})=>{
 await page.goto('/api/v1/auth/login?prompt=login&returnTo=%2Faccount%2Fprofile');
 await page.getByRole('link',{name:'Forgot Password?'}).click();
 await page.getByRole('textbox',{name:'Username or email'}).fill('haven-missing-reset-fixture@example.test');
 await page.getByRole('button',{name:'Submit',exact:true}).click();
 await expect(page.getByText(/You should receive an email shortly/i)).toBeVisible();
 await assertLayout(page);
});

test('Styled password sign-in preserves the server session and requested destination',async({page})=>{
 await login(page,'buyer','http://localhost:8088','/account/profile');
 const me=await page.request.get('/api/v1/me');expect(me.ok()).toBe(true);expect((await me.json()).data.email).toBe('buyer@example.test');
});
