// Game-over popup: opens after a miss, Retry is disabled until the checkbox is ticked,
// taps/Space on the scene do not restart, ticking enables Retry, Retry restarts, every new loss starts unticked again.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = 'screenshots/popup';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['small', { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  // short desktop windows (e.g. 1080p laptop at 125% zoom, or a half-height window)
  ['short', { viewport: { width: 1536, height: 700 } }],
  ['shorter', { viewport: { width: 1280, height: 560 } }],
];
const fail = [];
const expect = (name, cond, msg) => { if (!cond) fail.push(`${name}: ${msg}`); };

for (const [name, opts] of sizes) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5199/?debug');
  await page.waitForTimeout(600);
  const g = (expr) => page.evaluate(expr);

  await g(() => window.__game.tap());
  await page.waitForTimeout(300);
  await g(() => window.__game.dropAt(0.4));
  await page.waitForTimeout(300);
  await g(() => window.__game.dropAt(4.9)); // miss
  await page.waitForTimeout(300);
  expect(name, !(await g(() => document.getElementById('over').classList.contains('is-open'))), 'popup should wait before opening');
  await page.waitForTimeout(1300);
  expect(name, await g(() => document.getElementById('over').classList.contains('is-open')), 'popup not open');
  await page.screenshot({ path: `${out}/${name}-1-open.png` });

  expect(name, await page.isDisabled('#retry'), 'retry should start disabled');
  await page.click('#retry', { force: true });
  await page.mouse.click(10, 10);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  expect(name, (await g(() => window.__game.state)) === 'over', 'restarted without tick');

  await page.click('.check-text');
  await page.waitForTimeout(500);
  expect(name, await page.isEnabled('#retry'), 'retry not enabled after tick');
  await page.screenshot({ path: `${out}/${name}-2-ticked.png` });

  // Popup must fit (scrolls inside on very small screens, never off-screen).
  const box = await page.locator('.modal-card').boundingBox();
  expect(name, box.y >= 0 && box.y + box.height <= opts.viewport.height + 1, `card off-screen ${JSON.stringify(box)}`);
  const scroll = await g(() => { const c = document.querySelector('.modal-card'); return c.scrollHeight > c.clientHeight + 1 || document.documentElement.scrollHeight > innerHeight + 1; });
  expect(name, !scroll, 'scrollbar present');
  console.log(name, 'card', Math.round(box.width) + 'x' + Math.round(box.height), 'fit', await g(() => document.querySelector('.modal-card').style.getPropertyValue('--fit')));

  await page.click('#retry');
  await page.waitForTimeout(500);
  expect(name, (await g(() => window.__game.state)) === 'playing', 'retry did not restart');
  expect(name, !(await g(() => document.getElementById('over').classList.contains('is-open'))), 'popup still open after retry');

  // Second game over: box must be unticked again and Retry disabled.
  await g(() => window.__game.dropAt(4.9));
  await page.waitForTimeout(1500);
  expect(name, !(await page.isChecked('#registered')) && (await page.isDisabled('#retry')), 'box not reset to unticked on second loss');

  console.log(name, errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors');
  await ctx.close();
}
await browser.close();
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'ALL CHECKS PASSED');
