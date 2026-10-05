import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Public pages only. Access challenges are recorded without attempting bypasses.
const directory = 'evidence/reference';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: unknown[] = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const [id, url] of [['home', 'https://m.ke.com/bj/'], ['resale-list', 'https://m.ke.com/bj/ershoufang/'], ['new-homes-list', 'https://m.ke.com/bj/loupan/']]) {
      const record: Record<string, unknown> = { id, url, viewport, attemptedAt: new Date().toISOString(), evidenceLabel: 'V' };
      try {
        const response = await page.goto(url!, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1500);
        record.status = response?.status();
        record.finalUrl = page.url();
        record.title = await page.title();
        record.visibleText = (await page.locator('body').innerText()).slice(0, 16000);
        record.links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent?.trim(), url: (node as HTMLAnchorElement).href })).filter(link => link.text).slice(0, 100));
        record.screenshot = `${directory}/${id}-${viewport.width}.png`;
        await page.screenshot({ path: record.screenshot as string, fullPage: true, timeout: 10000 });
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
      }
      results.push(record);
      await writeFile(`${directory}/capture-attempts.json`, `${JSON.stringify(results, null, 2)}\n`);
      console.log(JSON.stringify({ id, viewport, status: record.status, title: record.title, error: record.error }));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
