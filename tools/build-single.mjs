// Packs the Vite build into ONE self-contained HTML file (JS, CSS and images inlined),
// so it plays by double-clicking — no server, no unzip. Output:
//   docs/index.html     -> served by GitHub Pages ("Chơi ngay")
//   release/TowerStack.html -> attached to the GitHub release ("Tải game")
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
let html = readFileSync(join(DIST, 'index.html'), 'utf8');

const dataUri = (file) => {
  const ext = file.split('.').pop().toLowerCase();
  const mime = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp' }[ext];
  return `data:${mime};base64,${readFileSync(join(DIST, file)).toString('base64')}`;
};

// CSS
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"[^>]*>/g, (_, f) => `<style>${readFileSync(join(DIST, f), 'utf8')}</style>`);

// JS (module script inline works from file://; a module *src* would be blocked there)
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+\.js)"[^>]*><\/script>/g, (_, f) => {
  const js = readFileSync(join(DIST, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});

// Images referenced from HTML (logo, favicons)
const missing = [];
html = html.replace(/(src|href)="\.\/(brand\/[^"]+\.(?:png|svg|jpg|webp))"/g, (m, attr, f) => {
  if (!existsSync(join(DIST, f))) { missing.push(f); return m; }
  return `${attr}="${dataUri(f)}"`;
});
if (missing.length) throw new Error('missing assets: ' + missing.join(', '));
if (/(src|href)="\.\//.test(html)) throw new Error('unresolved relative reference left in HTML');

mkdirSync('docs', { recursive: true });
mkdirSync('release', { recursive: true });
writeFileSync('docs/index.html', html);
writeFileSync('release/TowerStack.html', html);
console.log(`single file: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB -> docs/index.html, release/TowerStack.html`);
