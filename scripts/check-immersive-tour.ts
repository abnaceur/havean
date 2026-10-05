import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const origin=process.env.SPATIAL_DEMO_ORIGIN||'http://localhost:8088';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results:any[]=[];
try{
 for(const width of [320,390,768,1440]){
  const height=width<768?844:900;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<768});const page=await context.newPage();
  const rows=(await (await context.request.get(origin+'/api/v1/listings/home-1/media')).json()).data;
  const plan=rows.find((row:any)=>row.spatial?.rooms.length&&row.spatial.level===0);
  if(!plan)throw new Error('Approved mapped demo floor required');
  await page.goto(origin+'/bj/buy/home-1?media=vr&floor='+plan.id);
  const dialog=page.getByRole('dialog',{name:'Interactive property tour'}),canvas=dialog.locator('canvas');
  await expect(canvas).toBeVisible();
  const bounds=await dialog.boundingBox(),scene=await canvas.boundingBox();
  expect(bounds!.width).toBe(width);expect(bounds!.height).toBe(height);
  expect(scene!.width).toBe(width);expect(scene!.height).toBe(height);
  await expect(dialog.getByRole('group',{name:'Tour scenes',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Hide plan',exact:true}).click();await dialog.getByRole('button',{name:'Show plan',exact:true}).click();
  await dialog.getByRole('button',{name:'Hide rooms',exact:true}).click();await dialog.getByRole('button',{name:'Show rooms',exact:true}).click();
  await dialog.getByRole('button',{name:'Tour information',exact:true}).click();await expect(dialog.getByText('About this tour',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Tour information',exact:true}).click();
  if(width<768){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2-30,y:400,id:1},{x:width/2+30,y:400,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2-60,y:400,id:1},{x:width/2+60,y:400,id:2}]});
   await expect.poll(async()=>Number(await canvas.getAttribute('data-fov'))).toBeLessThan(70);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{await canvas.hover({position:{x:width/2,y:350}});await page.mouse.wheel(0,-200);await expect.poll(async()=>Number(await canvas.getAttribute('data-fov'))).toBeLessThan(70);}
  await dialog.getByRole('button',{name:'Tour controls',exact:true}).click();await dialog.getByRole('button',{name:'Reset view',exact:true}).click();await dialog.getByRole('button',{name:'Turn right',exact:true}).click();await expect(dialog.locator('.plan-camera')).toHaveAttribute('data-heading',/15/);await dialog.getByRole('button',{name:'Tour controls',exact:true}).click();
  for(const [mode,button] of [['tour','Tour'],['plan','Floor plan'],['model','3D model']] as const){
   await dialog.getByRole('button',{name:button,exact:true}).click();
   if(mode==='model'){await expect(dialog.getByRole('status').filter({hasText:'3D model ready'})).toHaveText(/3D model ready/);for(const room of await dialog.locator('.model-room').all()){const box=await room.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);}}
   const axe=await new AxeBuilder({page}).include('.tour-viewer').analyze();
   expect(axe.violations.filter(issue=>issue.impact==='serious'||issue.impact==='critical')).toEqual([]);
   await page.screenshot({path:`evidence/immersive-${mode}-${width}.png`});
   results.push({width,height,mode,seriousCriticalViolations:0});
  }
  await dialog.getByRole('button',{name:'Floor plan',exact:true}).click();
  await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(dialog.getByText('125%',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Enter '+plan.spatial.rooms[0].label,exact:true}).press('Enter');await expect(dialog.locator('canvas')).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await context.close();
 }
 fs.writeFileSync('evidence/immersive-browser.json',JSON.stringify({evidenceLabel:'P',referenceParityVerified:false,results,checks:['Viewport-filling dialog and scene','Mobile two-finger pinch and desktop wheel zoom','Overlay controls and room/map toggles','Camera direction','All viewing modes accessibility','Floor-plan zoom and keyboard room entry','Escape dismissal']},null,2)+'\n');
 console.log('Immersive tour verified at 320, 390, 768 and 1440 pixels across all three modes.');
}finally{await browser.close();}
