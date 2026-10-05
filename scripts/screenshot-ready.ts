import {expect,type Page} from '@playwright/test';
export async function screenshotReady(page:Page,home=false){
 if(home)await expect(page.locator('.home-section .directory-card')).toHaveCount(3);
 await page.evaluate(async()=>{
  await document.fonts.ready;
  // Full-page capture includes off-screen images. Decode those images before
  // Chromium measures the capture bounds; lazy loading can otherwise reflow
  // the document during capture on a cold runner.
  await Promise.all(Array.from(document.images).map(async image=>{image.loading='eager';try{await image.decode();}catch{/* Failed image placeholders remain visible evidence. */}}));
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 });
}
