// Automated play-through + screenshots at desktop and phone sizes.
// Usage: node tools/shoot.mjs [stage-name]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const stage = process.argv[2] || 'run';
const outDir = `screenshots/${stage}`;
mkdirSync(outDir, { recursive: true });
const URL = 'http://localhost:5199/?debug';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const sizes = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: s.viewport, isMobile: s.isMobile, hasTouch: !!s.hasTouch, deviceScaleFactor: s.deviceScaleFactor || 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  const shot = (n) => page.screenshot({ path: `${outDir}/${s.name}-${n}.png` });
  await shot('0-start');

  await page.evaluate(() => window.__game.tap());
  await page.waitForTimeout(400);
  await shot('1-sliding');

  // Mix of cuts and perfects.
  const plan = [0.6, 0, 0, -0.4, 0.3, 0, 0, 0, 0, 0, 0.5, -0.2, 0, 0.35];
  for (let i = 0; i < plan.length; i++) {
    await page.evaluate((o) => window.__game.dropAt(o), plan[i]);
    if (i === 0) { await page.waitForTimeout(140); await shot('2-cut-falling'); }
    if (i === 9) { await page.waitForTimeout(110); await shot('3-perfect-combo'); }
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(500);
  await shot('4-tower');

  // Miss on purpose.
  await page.evaluate(() => window.__game.dropAt(4.5));
  await page.waitForTimeout(250);
  await shot('5-miss');
  await page.waitForTimeout(2200);
  await shot('6-gameover');

  await page.evaluate(() => window.__game.tap());
  await page.waitForTimeout(1500);
  await shot('7-restart');

  const st = await page.evaluate(() => ({ state: window.__game.state, score: window.__game.score, best: localStorage.getItem('tower-stack:best') }));
  console.log(s.name, JSON.stringify(st), errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
  await ctx.close();
}
await browser.close();
