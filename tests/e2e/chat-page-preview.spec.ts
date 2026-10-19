import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {login} from '../support/browser';
test('inspect requested conversation without sending messages',async({page},info)=>{
 const id=process.env.CHAT_PREVIEW_CONVERSATION;test.skip(!id,'Set CHAT_PREVIEW_CONVERSATION to inspect an existing closed conversation.');
 test.setTimeout(120000);await login(page,'agent','http://localhost:8089','/ops/messages?conversation='+id+'&inboxPage=1');await expect(page.locator('.chat-readonly')).toContainText('Conversation closed');await expect(page.getByRole('log',{name:'Saved messages'})).toBeVisible();await expect(page.getByRole('textbox',{name:'Reply to client',exact:true})).toHaveCount(0);
 const inbox=page.locator('.chat-inbox');expect((await inbox.boundingBox())!.height).toBeLessThan(page.viewportSize()!.height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const back=page.getByRole('button',{name:'Back to conversations',exact:true});if(info.project.name==='mobile')await back.click();
 await page.getByRole('searchbox',{name:'Search conversations on this page'}).fill('no-conversation-matches-this');await expect(page.locator('.conversation-item')).toHaveCount(0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.getByRole('button',{name:'Unread',exact:true}).click();expect(await page.locator('.conversation-item').count()).toBe(await page.locator('.conversation-item .conversation-unread').count());await page.getByRole('button',{name:'All',exact:true}).click();
 expect(await page.locator('.conversation-list').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await page.locator('[data-conversation-id="'+id+'"]').click();
 await page.getByLabel('Conversation details',{exact:true}).click();await expect(page.getByLabel('Conversation participants',{exact:true})).toBeVisible();await page.getByLabel('Conversation details',{exact:true}).click();
 await page.screenshot({path:'evidence/chat-experience/after-'+info.project.name+'.png',scale:'css',fullPage:true});
 if(info.project.name==='mobile'){await page.setViewportSize({width:320,height:740});await expect(back).toBeVisible();const log=page.getByRole('log',{name:'Saved messages'});await log.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});await page.getByRole('button',{name:'Jump to latest',exact:true}).click();await expect(log).toBeFocused();await expect(page.getByRole('button',{name:'Jump to latest',exact:true})).toHaveCount(0);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('main').analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
 await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();expect((await new AxeBuilder({page}).include('main').analyze()).violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);await page.screenshot({path:'evidence/chat-experience/dark-'+info.project.name+'.png',scale:'css',fullPage:true});
});
