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

## GitHub / distribution (2026-10-04)

- Repo: https://github.com/tminhks/tower-stack (public, user's choice). gh logged in as `tminhks`.
- Play online: https://tminhks.github.io/tower-stack/ — GitHub Pages from `main` `/docs`.
- Download: release asset `TowerStack.html`, linked via `/releases/latest/download/TowerStack.html`
  so the README link never needs updating.
- `pnpm build:single` -> `docs/index.html` + `release/TowerStack.html`: one self-contained HTML
  (JS, CSS, images inlined; inline module script works from file://). Verified opening from disk.
- To ship an update: `pnpm build:single`, commit `docs/index.html`, push (Pages redeploys), then
  `gh release create vX.Y release/TowerStack.html`. Pushing only with the user's go-ahead.
- README is written for young children: two big SVG buttons (`docs/button-*.svg`), 3 one-line steps.

## Game-over popup (2026-10-04)

Replaced the old "Best N / Tap to restart" panel at the user's request.
- `#over.modal` opens `POPUP_DELAY` (900 ms) after a miss so the falling slab + zoom-out show first.
  Card pops in (scale .86 -> 1, overshoot easing), backdrop blur. Club-gradient border, HUD corner
  brackets (purple top-left, cyan bottom-right).
- Copy (user's exact words): "Thua mất rồi" / "mời bạn đăng ký workshop Hacking Human 🥰"
  ("Hacking Human 🥰" kept on one line with `.nowrap`).
- Poster: `assets-src/hacking-humans-original.png` (1920x1080, 2.4 MB, not shipped) ->
  `public/brand/hacking-humans.webp` (1280px, 92 KB) via `node tools/make-poster.mjs`.
- Checkbox "Đã đăng ký rồi" (custom drawn, real input stays focusable). Retry ("Chơi lại") is
  `disabled` and grey until ticked. **The box starts unticked on every loss** — user asked for this
  (2026-10-04) after an earlier version remembered the tick in localStorage. Nothing is stored now.
- Retry look: chamfered HUD frame (clip-path, 2px cyan edge, navy fill, uppercase tracked
  label, small pads in the square corners), echoing the poster frame. User rejected the earlier
  gradient glowing pill as "too AI". Disabled = grey edge + dim text; pressed = cyan fill, navy text.
- In the `over` state taps and Space/Enter on the scene do nothing; only Retry restarts.
- Never scrolls: card is absolutely centred and `fitPopup()` sets `--fit` = min(1, available
  height / card height, available width / card width), applied as `scale()` (user saw a scrollbar
  on a short window, 2026-10-04).
- Test: `node tools/check-popup.mjs` (1440x900, 390x844, 360x640, 1536x700, 1280x560; asserts no scrollbar).

## Hand control via webcam (2026-10-05)

User asked: instead of click/Space, track the hand from the camera; their two reference photos
(`assets-src/gestures/fist.jpg`, `open.jpg`) are the two states, and every change of state = one tap.
- `src/hand.js`: `classifyHand(lm)` — per finger (index..pinky) ratio tip-to-wrist / mcp-to-wrist;
  >1.5 = extended, <1.25 = curled; >=3 extended = open, >=3 curled = fist, else null (ignored).
  On the user's photos: fist 0.71-0.84, open 1.76-1.94. No hold time (`STABLE_MS` 0): the gap
  between the classes is wide and in-between hands are ignored. The first state after the hand appears is a baseline (no tap); hand lost 600 ms resets it.
  The flip calls the same `onTap()` as a click, so all game rules (popup etc.) still apply.
  The status line shows the raw state at once; only the confirmed change counts as a tap.
- `src/hand-worker.js`: MediaPipe Hand Landmarker (tasks-vision 1.0.1 from jsDelivr, model from
  Google storage, mirror at `docs/models/hand_landmarker.task` on Pages) runs in a **classic** worker
  started from a blob URL (`?raw` import), so the single-file build still works from file://.
  Classic, not module: MediaPipe uses importScripts(). **CPU delegate first**, GPU fallback
  (`?hand=gpu` forces GPU first). Frames go as 320x240 ImageBitmaps, one in flight at a time,
  sent from requestVideoFrameCallback the moment a camera frame arrives (not on the game tick);
  a frame that arrives while busy is sent as soon as the result comes back.
  Loaded only when the camera button is pressed; the base game is unchanged and works offline.
- Latency work (2026-10-05, user said lag was too high). `tools/check-hand-latency.mjs` measures
  camera-frame-change -> tap, headed Chrome, this machine (12 cores, game ~38 fps camera off):
  | config | median | p90 | game fps |
  |---|---|---|---|
  | GPU worker + 70 ms hold (before) | 418 ms | 1011 ms, 1/10 missed | 26 |
  | GPU worker, no hold | 251 | 314 | 25 |
  | **CPU worker, no hold (shipped)** | **~104** | **~160** | **28-29** |
  | main thread, no hold | 66 | 110 | 14 (rejected) |
  Frame size (192-320) and throttling the detection rate made no useful difference.
  GPU delegate is slow in a worker because it competes with the game's WebGL for the GPU.
- Known: a few 0.1-0.3 s hitches in the first seconds after the hand first appears. Traced to
  MediaPipe's internal GL ReadPixels + Finish in the worker (it uses WebGL to convert input images
  even on the CPU delegate) while shaders warm up; steady state has no frame >100 ms. Warming up on
  a blank frame did not help (the landmark model only runs once a real hand is seen), so it was
  removed. `tools/check-hand-stall.mjs` breaks the fps cost down step by step.
- UI: camera button left of mute (label hidden < 480px), preview bottom-right in the chamfered HUD
  frame, mirrored video + skeleton, status line (Vietnamese), frame flashes white on each flip,
  error text for denied / missing / busy camera or failed model download.
- Tests: `tools/check-hand-photos.mjs` (classifier on the photos); `tools/check-hand.mjs [url]`
  (fake webcam alternating the photos every 1.5 s — `screenshots/hand/fake-cam.mjpeg` is 45 copies
  of fist.jpg, then 45 of open.jpg, x3, concatenated); `tools/check-hand-speed.mjs`;
  `tools/check-hand-fps.mjs [url]` (HEADED=1 for a real window). Use the d3d11 GPU flags:
  swiftshader only manages ~1 detection/s and misses flips.
