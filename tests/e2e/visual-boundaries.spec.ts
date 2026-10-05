import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {compareBoxes} from '../../scripts/visual-policy.mjs';
test('U06 actual twelve-pixel card shift fails the geometry comparison',async({page},info)=>{
 await page.goto('/bj/buy');const card=page.locator('.listing-card').first();await expect(card).toBeVisible();const original=await card.boundingBox();
 await page.addStyleTag({content:'.listing-card{transform:translateY(12px)!important;transition:none!important}'});const changed=await card.boundingBox();expect(()=>compareBoxes({card:original},{card:changed})).toThrow('Visual layout shift');
 await page.screenshot({path:`evidence/layout-shift-negative-${info.project.name}.png`,fullPage:true});
});
test('U07 filter keyboard focus and axe scan, with missing-label/hidden-focus negative fixtures',async({page},info)=>{
 await page.goto('/bj/buy');const trigger=page.getByRole('button',{name:'All filters',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await page.getByRole('combobox',{name:'Bedrooms',exact:true}).focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('dialog'))).toBe(true);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 const positive=await new AxeBuilder({page}).analyze();expect(positive.violations.filter(row=>['serious','critical'].includes(row.impact||''))).toEqual([]);
 await page.evaluate(()=>{const fixture=document.createElement('aside');fixture.id='a11y-negative-fixture';fixture.setAttribute('aria-hidden','true');fixture.style.cssText='position:absolute;left:-1000px;top:0';const button=document.createElement('button');button.type='button';button.style.cssText='width:44px;height:44px';fixture.append(button);document.body.append(fixture);const missing=document.createElement('button');missing.id='missing-label-negative';document.body.append(missing);});
 const negative=await new AxeBuilder({page}).analyze();expect(negative.violations.map(row=>row.id)).toContain('button-name');expect(negative.violations.map(row=>row.id)).toContain('aria-hidden-focus');await page.evaluate(()=>{document.getElementById('a11y-negative-fixture')?.remove();document.getElementById('missing-label-negative')?.remove();});
 await page.screenshot({path:`evidence/accessibility-shared-${info.project.name}.png`,fullPage:true});
});
