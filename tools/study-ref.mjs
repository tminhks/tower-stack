import { chromium } from 'playwright';
const out = 'screenshots/ref';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const reqs = [];
page.on('request', r => reqs.push(r.url()));
page.on('console', m => console.log('console:', m.text()));
await page.addInitScript(() => {
  // log audio node creation to learn the sound design
  window.__audio = [];
  const AC = window.AudioContext;
  const P = AC.prototype;
  for (const fn of ['createOscillator','createGain','createBiquadFilter','createBufferSource','createBuffer']) {
    const orig = P[fn];
    P[fn] = function (...a) {
      const node = orig.apply(this, a);
      const t = this.currentTime.toFixed(2);
      window.__audio.push(`${t} ${fn}(${a.join(',')})`);
      if (fn === 'createOscillator') {
        const s = node.start.bind(node);
        node.start = (w) => { window.__audio.push(`${t} osc start type=${node.type} f=${node.frequency.value.toFixed(1)}`); return s(w); };
        for (const m of ['setValueAtTime','exponentialRampToValueAtTime','linearRampToValueAtTime']) {
          const o = node.frequency[m].bind(node.frequency);
          node.frequency[m] = (v, tt) => { window.__audio.push(`  freq.${m}(${v.toFixed?.(1)}, +${(tt-this.currentTime).toFixed(3)})`); return o(v, tt); };
        }
      }
      if (fn === 'createGain') {
        for (const m of ['setValueAtTime','exponentialRampToValueAtTime','linearRampToValueAtTime']) {
          const o = node.gain[m].bind(node.gain);
          node.gain[m] = (v, tt) => { window.__audio.push(`  gain.${m}(${v.toFixed?.(3)}, +${(tt-this.currentTime).toFixed(3)})`); return o(v, tt); };
        }
      }
      if (fn === 'createBiquadFilter') {
        setTimeout(() => window.__audio.push(`  filter type=${node.type} f=${node.frequency.value}`), 0);
      }
      return node;
    };
  }
});
await page.goto('https://gameslop.vercel.app/?game=tower-stack', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/00-load.png` });
const frames = page.frames().map(f => f.url());
console.log('frames', frames);
const html = await page.content();
console.log('HTML len', html.length);
console.log(html.slice(0, 3000));
// play: click several times at intervals
const target = page.frames().find(f => /tower/i.test(f.url()) && f !== page.mainFrame()) || page.mainFrame();
await page.mouse.click(640, 400);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/01-started.png` });
for (let i = 0; i < 8; i++) {
  await page.mouse.click(640, 400);
  await page.waitForTimeout(i === 2 ? 120 : 900 + i * 37);
  await page.screenshot({ path: `${out}/02-drop-${i}.png` });
}
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/03-later.png` });
for (const f of page.frames()) {
  try { const a = await f.evaluate(() => window.__audio); if (a?.length) console.log('AUDIO', f.url(), '\n' + a.slice(0, 200).join('\n')); } catch {}
}
console.log('REQS\n' + [...new Set(reqs)].join('\n'));
await browser.close();
