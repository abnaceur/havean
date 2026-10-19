import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
test('agent retains calibrated camera results while GPU training remains explicitly deferred',async({page})=>{
 const workspace=process.env.HAVEN_CAMERA_REVIEW_WORKSPACE;
 test.skip(!workspace,'Requires the retained licensed CPU camera fixture.');
 const origin='http://localhost:8089';
 await login(page,'agent',origin,'/ops');
 await page.goto(`${origin}/ops/digitization?workspace=${workspace}`);
 const status=page.getByLabel('Property reconstruction status',{exact:true});
 await expect(status.getByText('Scene training is disabled pending GPU validation on this deployment.',{exact:true})).toBeVisible();
 await expect(status.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeDisabled();
 await expect(status.getByLabel('Private camera report',{exact:true})).toContainText('16 of');
 const response=await page.request.get(`${origin}/api/v1/ops/digitizations/${workspace}/reconstruction-status`);
 expect(response.status()).toBe(200);const data=(await response.json()).data;
 expect(data.sceneTraining).toEqual({available:false,reason:'GPU_VALIDATION_DEFERRED',job:null});
 expect(data.camera.report.trainingArchiveAvailable).toBe(true);expect(data.publiclyServed).toBe(false);
 console.log(JSON.stringify({label:'P',disabledGpuControl:true,calibratedInputsRetained:true,gpuExecuted:false}));
});
