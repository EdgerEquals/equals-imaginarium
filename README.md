# Equals Imaginarium — 3D

A wordless, first-person space you float inside. One full-screen WebGL canvas, plain ES modules, **no build step**.
Live: https://edgerequals.github.io/equals-imaginarium/ (GitHub Pages, `main` / root, HTTPS enforced).

## How it works
- **Three.js r169** is loaded from jsDelivr through an import map in `index.html` (version pinned: `three@0.169.0`).
- Everything renders into **one canvas** (`#world`) with **three layers**:
  1. **Back — nebula** (`createNebula` in `js/layers.js`): a full-screen GLSL shader. Domain-warped fBm over deterministic
     hash value-noise, evaluated on the camera's view ray, so the nebula turns with you. Restrained palette from the site's
     identity (navy `#0f1220`/`#1a1e33`, sky `#7cc4ff`, amber `#ffb547`, coral `#ff6b4a`, cream `#f4f1ea` stars).
  2. **Middle — swarm** (`createSwarm`): up to 24,000 GPU-driven points. Every orbit is computed in the vertex shader from a
     single time uniform. Periods are `base × φⁿ` (base 6 s, n from a Kepler-like radius rule), phases are spread by the
     golden angle (137.5°), and orbits circle five centres placed off-screen and far away, so streams sweep through the
     viewer's space with no bound. Depth fade near and far.
  3. **Front — hero bodies** (`createHeroes`): a polished steel sphere (the 150 mm sphere, scaled up), an amber ring, a sky
     ring, an `=` form (cream + amber bars) and a coral bead. They are rigidly bounded inside an invisible 7.5-unit sphere
     ahead of the start point: they collide with each other elastically and reflect off the bound.
- **Physics worker** (`js/physics-worker.js`): hero-body dynamics and the camera's drift integration run off the main thread
  at a fixed 120 Hz step. The main thread sends input each frame and gets state back in transferable `Float32Array`s
  (ping-pong buffers; no SharedArrayBuffer since GitHub Pages can't send COOP/COEP headers). The camera can bump and nudge
  the bodies.
- **Glow and depth**: `UnrealBloomPass` + `OutputPass` (ACES tone mapping) are lazy-loaded after the first frame. Depth comes
  from exponential fog on the hero bodies and distance fade on the swarm.
- Rendering **pauses when the tab is hidden**.

## Controls (one Pointer Events system)
| | Look | Drift | Float forward / back |
|---|---|---|---|
| Mouse / trackpad | drag | right-drag | wheel / two-finger scroll |
| Touch / thumb | drag on right half | invisible thumb stick: drag on left half | pinch |
| Keyboard | ← → | W A S D, ↑ ↓, Q / E (or Space) down / up | W / S |

Look has inertia, drift has damping, and after 6 s idle the camera sways gently on its own.

## Quality tiers (`js/quality.js`)
| Tier | Pixel ratio (max) | Particles | Bloom | Nebula octaves |
|---|---|---|---|---|
| 0 | 2.0 | 24,000 | on | 5 |
| 1 | 1.5 | 16,800 | on | 5 |
| 2 | 1.25 | 12,000 | on | 4 |
| 3 | 1.0 | 8,160 | on | 3 |
| 4 | 0.8 | 4,800 | off | 3 |
| 5 | 0.6 | 2,880 | off | 2 |

Desktops start at tier 1; phones/tablets (coarse pointer), ≤4 GB `deviceMemory` or ≤4 cores start at tier 3; ≤2 GB or ≤2 cores
start at tier 4. Frame time is averaged over 60-frame windows: above 24 ms steps down one tier; four windows under 17.8 ms
step back up (never above a tier it has had to leave; mobile never above tier 2). Add `?q=0`…`?q=5` to lock a tier for testing.

## Fallbacks
- **Reduced motion** (`prefers-reduced-motion: reduce`): the world runs at 4% speed (near-still), ~30 fps cap, no idle sway,
  softer constant bloom, no fade-in. Your own input still moves you, gently.
- **No WebGL 2 / old browsers / no import maps / init failure / lost context**: the canvas is hidden and a wordless poster
  (`assets/poster.svg` over a CSS gradient) is shown.
- No words on the page. Screen readers get the `<title>`, the canvas `aria-label` and a visually-hidden description.
  No WebXR or headset code.

## Installable web app
`manifest.webmanifest` (fullscreen, navy theme, 192/512 icons + maskable) and `sw.js`. The service worker registers only on
https. It precaches the app shell and the pinned CDN modules, serves them cache-first from a versioned cache
(`ei-3d-v1`), fetches the page network-first so new deploys show up, and deletes old caches on activate.
**When you change any file, bump `VERSION` in `sw.js`.**

## Files
```
index.html               import map, canvas, screen-reader text
css/app.css              full-screen shell + poster fallback
js/app.js                renderer, loop, worker client, lazy post-processing, tier application
js/layers.js             nebula, swarm and hero-body layers (shaders live here)
js/input.js              Pointer Events / wheel / keyboard input
js/quality.js            adaptive quality tiers
js/physics-worker.js     hero-body + camera-drift physics (classic worker)
sw.js, manifest.webmanifest
assets/                  logo, favicon, icons (192/512/maskable), apple-touch-icon, poster.svg, og-image
```

## Preview locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000 (service worker only registers on https)
```

## Restore the old static site
The previous HTML/CSS site is tagged **`static-v1`**.
```bash
git rm -r -q . && git checkout static-v1 -- .   # replace the tree with the tagged static site
git commit -m "Restore static-v1 site" && git push
```
Or browse it at https://github.com/EdgerEquals/equals-imaginarium/tree/static-v1. Visitors who already loaded the 3D site still have its
service worker; pages are fetched network-first so they see the restored site online, and you can add a one-line `sw.js`
that calls `self.registration.unregister()` to remove it completely.
