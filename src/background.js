// Decorative circuit-trace background in the BUV Tech Club style:
// horizontal runs with a 45° jog, hollow / filled pads at the ends, light pulses travelling along.

const NS = 'http://www.w3.org/2000/svg';

// Each trace: polyline points, then start/end pad: 'hollow' | 'dot' | null (runs off the edge).
const TRACES = [
  { pts: [[-10, 206], [170, 206], [230, 146], [296, 146]], start: null, end: 'dot', w: 3 },
  { pts: [[34, 178], [158, 178], [208, 128], [386, 128]], start: 'hollow', end: 'hollow', w: 3 },
  { pts: [[-10, 152], [118, 152], [163, 107], [330, 107]], start: null, end: 'hollow', w: 3 },
  { pts: [[74, 124], [104, 124], [146, 82], [252, 82]], start: 'dot', end: 'dot', w: 2.5 },
  { pts: [[-10, 64], [52, 64], [88, 28], [176, 28]], start: null, end: 'hollow', w: 2 },
  { pts: [[-10, 96], [30, 96], [56, 70], [62, 70]], start: null, end: 'dot', w: 1.6, faint: true },
  { pts: [[262, 206], [330, 206], [356, 180], [440, 180]], start: 'hollow', end: null, w: 1.6, faint: true },
];

function el(name, attrs) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function buildCircuit(id) {
  const svg = el('svg', { viewBox: '0 0 440 220', preserveAspectRatio: 'xMinYMax meet' });
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: `${id}-g`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 420, y2: 0 });
  grad.append(el('stop', { offset: '0', 'stop-color': '#5b2cff' }), el('stop', { offset: '0.55', 'stop-color': '#3d7bff' }), el('stop', { offset: '1', 'stop-color': '#19c8ff' }));
  defs.append(grad);
  svg.append(defs);

  const traces = el('g', { class: 'traces', stroke: `url(#${id}-g)`, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const pulses = el('g', { class: 'pulses', fill: 'none', 'stroke-linecap': 'round' });

  TRACES.forEach((t, i) => {
    const d = 'M' + t.pts.map((p) => p.join(' ')).join(' L');
    traces.append(el('path', { d, 'stroke-width': t.w, opacity: t.faint ? 0.45 : 1 }));
    for (const [where, kind] of [[t.pts[0], t.start], [t.pts[t.pts.length - 1], t.end]]) {
      if (!kind) continue;
      const r = kind === 'hollow' ? 6.5 : 5.5;
      traces.append(el('circle', {
        cx: where[0], cy: where[1], r,
        class: kind === 'dot' ? 'pad pad-dot' : 'pad',
        'stroke-width': kind === 'hollow' ? t.w : 0,
        fill: kind === 'dot' ? `url(#${id}-g)` : '#0a0f36',
        opacity: t.faint ? 0.45 : 1,
      }));
    }
    if (!t.faint) {
      const p = el('path', { d, pathLength: 100, class: 'pulse', 'stroke-width': t.w + 1.5 });
      p.style.animationDuration = `${3.2 + i * 0.9}s`;
      p.style.animationDelay = `${-i * 1.3}s`;
      pulses.append(p);
    }
  });

  svg.append(traces, pulses);
  return svg;
}

export function mountBackground(root) {
  const bl = buildCircuit('cbl');
  bl.classList.add('circuit', 'circuit-bl');
  const tr = buildCircuit('ctr');
  tr.classList.add('circuit', 'circuit-tr');
  root.append(bl, tr);
}
