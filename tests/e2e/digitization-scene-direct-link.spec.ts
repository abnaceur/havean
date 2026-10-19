import {test,expect} from '@playwright/test';
import {login} from '../support/browser';

test('saved private scene opens directly after agent login',async({page})=>{
 test.setTimeout(120000);
 const origin='http://localhost:8089';
 const target='/ops/digitization?workspace=9acf2520-a922-4b23-830e-0a55aa0b97a6&view=scene';
 await login(page,'agent',origin,target);
 await expect(page.getByRole('link',{name:'Back to property workspace'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Digitization workflow',exact:true})).toHaveCount(0);
 const scene=page.getByRole('region',{name:'Private reconstructed property',exact:true});
 await expect(scene.getByRole('button',{name:'Close scene preview',exact:true})).toBeVisible();
 await expect(scene.locator('canvas[aria-label="Private reconstructed scene"]')).toBeVisible();
 await expect(scene.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled();
 const evidence=scene.getByRole('region',{name:'Captured scene evidence'});
 await expect(evidence).toContainText('500 training steps');
 await expect(evidence.getByRole('img')).toHaveCount(2);
 await expect.poll(()=>evidence.getByRole('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
 await expect(evidence).toContainText('PSNR 18.17 dB');
 await expect(evidence).toContainText('PSNR 20.98 dB');
 const imageUrl=await evidence.getByRole('img').first().getAttribute('src');
 const wrongScope=await page.request.get(origin+imageUrl!.replace('9acf2520-a922-4b23-830e-0a55aa0b97a6','0b594196-51ce-4aac-83ff-87f539506f49'));
 expect(wrongScope.status()).toBe(404);
 const anonymous=await page.context().browser()!.newContext();
 expect((await anonymous.request.get(origin+imageUrl!)).status()).toBe(401);await anonymous.close();
 await page.screenshot({path:'evidence/digitization/gsplat-direct-link.png',fullPage:true});
 console.log(JSON.stringify({label:'O/P',url:origin+target,sceneOpenedAutomatically:true,trainingSubmitted:false}));
});
