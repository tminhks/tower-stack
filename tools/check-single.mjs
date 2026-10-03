// Opens the single-file build straight from disk (file://) and plays a few drops.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const url = pathToFileURL(resolve('release/TowerStack.html')).href;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => errors.push('failed ' + r.url().slice(0, 80)));
await page.goto(url);
await page.waitForTimeout(800);
const logoOk = await page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.mouse.click(640, 500);           // start
for (let i = 0; i < 4; i++) { await page.waitForTimeout(700); await page.keyboard.press('Space'); }
await page.waitForTimeout(600);
const score = await page.textContent('#score');
await page.screenshot({ path: 'screenshots/single-file.png' });
console.log('file://', 'images ok:', logoOk, '| score after 4 drops:', score, '|', errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
