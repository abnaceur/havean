import {test,expect} from '@playwright/test';
import {login} from '../support/browser';

test('retained CPU camera result is visible in frame review and the property quality summary',async({page})=>{
 const workspace=process.env.HAVEN_CAMERA_REVIEW_WORKSPACE;
 test.skip(!workspace,'Requires an existing authorized CPU camera workflow fixture.');
 const origin=process.env.PUBLIC_OPS_URL||'http://localhost:8089';
 await login(page,'agent',origin,'/ops');
 const response=await page.request.get(`${origin}/api/v1/ops/digitizations/${workspace}/camera-processing/latest`);
 expect(response.status()).toBe(200);const report=(await response.json()).data;
 expect(report.registeredCameraCount).toBeGreaterThan(0);expect(report.reviewRequired).toBe(true);expect(report.publiclyServed).toBe(false);
 await page.goto(`${origin}/ops/digitization?workspace=${workspace}`);
 const text=`Largest model: ${report.registeredCameraCount} of ${report.selectedFrameCount} views registered, with ${report.pointCount} sparse points. Connected components across all models: ${report.connectedComponentCount}.`;
 await expect(page.getByLabel('Private camera report').getByText(text,{exact:true})).toBeVisible();
 const quality=page.getByRole('region',{name:'Private property quality summary'});
 await quality.getByRole('button',{name:'Reload quality summary',exact:true}).click();
 await expect(quality.getByText(text,{exact:true})).toBeVisible();
 await expect(quality.getByText('This is a sparse camera reconstruction. Scale and room coverage remain unverified.',{exact:true})).toBeVisible();
 if(report.trainingArchiveAvailable)await expect(page.getByRole('link',{name:'Download private calibrated training inputs'})).toBeVisible();
});
