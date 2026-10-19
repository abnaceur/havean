import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
import {pickDateField} from '../support/viewing-calendar';
test('calendar recovers invalid URL filters and supports keyboard month navigation and date ranges',async({page},info)=>{
 test.setTimeout(120000);await login(page,'buyer','http://localhost:8088','/account/viewings?from=not-a-date');
 await expect(page.locator('main').getByRole('alert')).toBeVisible();const calendar=page.getByRole('group',{name:'Viewing dates',exact:true});await expect(calendar).toBeVisible();
 await page.getByRole('button',{name:'From property-local date',exact:true}).click();await page.getByRole('button',{name:'Clear date',exact:true}).click();await page.getByRole('button',{name:'Apply calendar filters',exact:true}).click();await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
 const first=calendar.locator('[data-date]').first(),initial=(await first.getAttribute('data-date'))!;const next=new Date(initial+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const date=next.toISOString().slice(0,10);
 await first.focus();await first.press('PageDown');await expect(calendar.locator('[data-date="'+date+'"]')).toBeFocused();await expect(page).toHaveURL(new RegExp('from='+date));
 await pickDateField(page,'From property-local date',date);await pickDateField(page,'Through property-local date',date.slice(0,8)+'03');await page.getByRole('button',{name:'Apply calendar filters',exact:true}).click();await expect(page).toHaveURL(new RegExp('from='+date+'&to='+date.slice(0,8)+'03'));
 await page.getByRole('button',{name:'From property-local date',exact:true}).click();const picker=page.getByRole('group',{name:'From property-local date calendar',exact:true});await picker.locator('[data-date="'+date+'"]').focus();await page.keyboard.press('Escape');await expect(picker).toHaveCount(0);await expect(page.getByRole('button',{name:'From property-local date',exact:true})).toBeFocused();
 if(info.project.name==='mobile')await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('main').analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
 await calendar.scrollIntoViewIfNeeded();await page.screenshot({path:'evidence/viewing-calendar-experience/controls-'+info.project.name+'.png',scale:'css'});
});
