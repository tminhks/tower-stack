// Verifies audio unlock on a real gesture, that each sound produces signal, and that mute silences it.
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?debug');
await page.waitForTimeout(500);

console.log('before gesture ctx:', await page.evaluate(() => String(window.__game.sfx.ctx)));
await page.mouse.click(640, 500); // real pointer gesture -> unlock + start
await page.waitForTimeout(200);
console.log('after click: state', await page.evaluate(() => window.__game.state), 'ctx', await page.evaluate(() => window.__game.sfx.ctx.state));

const peak = (fn) => page.evaluate(async (fn) => {
  const s = window.__game.sfx;
  const an = s.ctx.createAnalyser();
  an.fftSize = 2048;
  s.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  let p = 0;
  const end = performance.now() + 400;
  // eslint-disable-next-line no-new-func
  new Function('s', fn)(s);
  while (performance.now() < end) {
    an.getFloatTimeDomainData(buf);
    for (const v of buf) p = Math.max(p, Math.abs(v));
    await new Promise((r) => setTimeout(r, 15));
  }
  s.master.disconnect(an);
  return p.toFixed(3);
}, fn);

for (const fn of ['s.tock()', 's.perfect(1)', 's.perfect(5)', 's.grow()', 's.gameOver()']) console.log(fn.padEnd(14), 'peak', await peak(fn));

await page.keyboard.press('Space'); // drop via keyboard
await page.waitForTimeout(100);
console.log('space -> score', await page.evaluate(() => window.__game.score), 'state', await page.evaluate(() => window.__game.state));

await page.click('#mute');
await page.waitForTimeout(150);
console.log('muted:', await page.getAttribute('#mute', 'aria-pressed'), 'tock peak', await peak('s.tock()'), 'state still', await page.evaluate(() => window.__game.state));
await page.click('#mute');
console.log('unmuted:', await page.getAttribute('#mute', 'aria-pressed'));
console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors');
await browser.close();
