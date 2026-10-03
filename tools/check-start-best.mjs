// Start screen with a saved best score: "Best N" must stay hidden until play begins.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots/fix-best', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, vp] of [['desktop', { width: 1880, height: 830 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: name === 'mobile' ? 2 : 1 });
  await page.goto('http://localhost:5199/?debug');
  await page.evaluate(() => localStorage.setItem('tower-stack:best', '22'));
  await page.reload();
  await page.waitForTimeout(800);
  const vis = () => page.evaluate(() => getComputedStyle(document.getElementById('best')).visibility + ' "' + document.getElementById('best').textContent + '"');
  console.log(name, 'start best:', await vis());
  await page.screenshot({ path: `screenshots/fix-best/${name}-start.png` });
  await page.evaluate(() => window.__game.tap());
  await page.waitForTimeout(600);
  console.log(name, 'playing best:', await vis());
  await page.screenshot({ path: `screenshots/fix-best/${name}-playing.png` });
  await page.close();
}
await browser.close();
