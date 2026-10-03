# CLAUDE.md — Tower Stack

Hyper-casual 3D stacking game (three.js + Web Audio, Vite). Talk to the user in Vietnamese.
Unrelated to any other project in `d:\tech\code`.

## Reference

Target: https://gameslop.vercel.app/?game=tower-stack. On 2026-10-03 it could not be opened
from this machine (`*.vercel.app` times out, other sites fine) and no source repo was found
on GitHub, so the build follows the written spec + the classic "Stack" mechanic.
**Not yet compared side by side with the reference** — do that when it is reachable.

## Run

```
pnpm dev        # http://localhost:5199
pnpm build      # -> dist/ (static, base './')
node tools/shoot.mjs <name>   # scripted play-through, screenshots at 1440x900 + 390x844
node tools/check-audio.mjs    # audio unlock / per-sound signal / mute check
```
`?debug` exposes `window.__game` (`tap()`, `dropAt(offset)`, `state`, `score`, `combo`, `sfx`).
Package manager: pnpm (esbuild build approval in `pnpm-workspace.yaml`).

## Files

```
index.html        canvas + HUD + start / game-over panels + mute button
src/main.js       scene, camera, game state, placing/cutting, effects, loop
src/audio.js      Sfx class, all sounds synthesised
src/style.css     HUD, background gradient (hue via @property --h)
tools/            playwright scripts (dev only)
```

## Mechanics

- Orthographic isometric camera, direction (1, 0.82, 1). Visible height
  `max(14, 10.5 / aspect)` world units so the slide path fits on portrait phones.
- Layer 0 is a tall pillar (`BASE_H` 40, so its bottom never shows, even on the zoomed-out game-over view). Odd layers slide on X, even on Z, starting
  `RANGE` before the slab below, ping-ponging at constant speed.
- Drop (pointerdown / Space / Enter): `delta` = offset from slab below.
  `|delta| <= TOLERANCE` → perfect snap. `overlap <= 0` → miss / game over.
  Otherwise kept part = overlap centred at `below + delta/2`; rest becomes a falling piece.
- Perfect streak ≥ `GROW_AFTER` → each further perfect grows the narrower side by
  `GROW_STEP`, capped at the starting `SIZE`.
- Score = slabs placed. Best in `localStorage['tower-stack:best']`, mute in `tower-stack:muted`
  (all storage access wrapped in try/catch).

## Tuning values (top of `src/main.js`)

| Constant | Value | Meaning |
|---|---|---|
| `SIZE` / `H` | 3 / 0.5 | slab footprint / thickness |
| `RANGE` | 4.8 | slide distance each side |
| `SPEED_BASE` / `SPEED_GAIN` / `SPEED_MAX` | 5.8 / 0.075 per point / 11 | units per second |
| `TOLERANCE` | 0.12 | perfect window (4% of size) |
| `GROW_AFTER` / `GROW_STEP` | 5 / 0.18 | combo regrowth |
| `HUE_MID` / `HUE_SWING` / `HUE_RATE` | 225 / 31 / 0.13 | slab hue swing in club colours (see Branding) |
| `GRAVITY` | 28 | falling pieces |
| `CAM_ABOVE` | 1.6 | camera target above the top slab |
| `RESTART_DELAY` | 650 ms | ignore taps right after game over |

Background: `linear-gradient(hsl(h+25 42% 70%), hsl(h+5 38% 54%))` (darkened from 78/62 so
white text stays legible on yellow/green hues), `--h` follows the top
slab hue, 1.2 s transition.

## Branding — BUV Tech Club (2026-10-03)

User asked for the club's logo + colours and the circuit-trace motif from their reference.
- Palette sampled from the logo: navy `#0a0d30` / `#050821`, purple `#5b2cff`,
  blue `#3d7bff`, cyan `#19c8ff` (CSS vars `--club-*` in `style.css`).
- `public/brand/buv-logo-original.png` = file as supplied (kept untouched).
  `public/brand/buv-logo.png` = cropped, transparent, half size, made by
  `node tools/make-logo.mjs` (un-screens the flat navy background). Re-run it if the logo changes.
  `public/brand/circuit-reference.png` = the motif reference, not used by the page.
- Background (same vertical-gradient form as before): navy gradient + neon glows (top glow
  follows the tower hue via `--h`) + (dot grid removed on user request, 2026-10-03) +
  two SVG circuit groups from `src/background.js` (bottom-left, and rotated top-right),
  gradient strokes purple→cyan, light pulses running along traces (hidden under reduced motion).
- Favicon / home-screen icons: `public/brand/favicon-32|64.png`, `apple-touch-icon.png`,
  `icon-192|512.png`, built by `node tools/make-favicon.mjs` from the original logo. Duck mark
  only on a rounded navy square (wordmark unreadable at tab size); <=64px uses a tuft-to-bill crop.
- **Current favicon (2026-10-04): duck illustration**, user-supplied `duck-original.png`, full
  square frame kept on purpose (user: "do not crop the frame"), teal keyed to transparent by
  `node tools/make-favicon-duck.mjs` -> `duck-32|64|192|512.png`, `duck-transparent.png` (2048).
  `duck-apple-180.png` keeps the teal because iOS paints transparency black. The earlier
  logo-based `favicon-*` / `icon-*` files are kept on disk but no longer linked.
- Logo: big on the start screen, badge top-left during play/game over (92px tall, 58px under 480px).
- "Best N" is hidden on the start screen (it collided with the big logo); it shows once play starts.
- Slab colours now swing inside the club range instead of the full hue wheel:
  hue = `HUE_MID 225 ± HUE_SWING 31` (cyan 194 … purple 256), `HUE_RATE 0.13` rad per layer,
  HSL saturation 0.9, lightness 0.6. This replaces `HUE_STEP` and the light-pastel background below.
- Start screen camera sits `CAM_ABOVE + 1.6` so the tower clears the logo + title.

## Juice

- Cut: falling piece gets outward velocity + upward pop, tumbles around the axis
  perpendicular to the cut, removed when far below the view. Kept slab squashes
  (damped cosine, pivot at its bottom).
- Perfect: white square ring(s) expand from the slab edge (1 ring per combo step, max 4,
  staggered 90 ms), slab emissive flash 0.3 s.
- Game over: missed slab falls, camera zooms out (≤ 0.8) to frame the whole tower.

## Sound (Web Audio, created on first gesture)

- `tock`: triangle 2f→f (f≈200 Hz) in 40 ms + 30 ms band-passed noise click.
- `perfect(combo)`: C5 major scale, one step per consecutive perfect (cap 2 octaves),
  sine + harmonics, 0.7 s decay. Resets when a cut breaks the combo.
- `grow`: two high sine pings. `gameOver`: triangle+sine 330→82 Hz through closing lowpass.
- Mute: button top-right or `M` key.

## Verified (2026-10-03)

Scripted play at 1440×900 and 390×844 (headless Chromium, SwiftShader): start, cut + falling
piece, perfect ripples + growth, miss, game-over zoom-out, restart, best saved, no console errors.
Audio: no context before gesture; every sound produces signal; mute silences; mute click
does not drop a slab. **Not verified:** real-device 60 fps and how it sounds to a human ear.
