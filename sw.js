// Equals Imaginarium service worker: cache-first app shell + pinned CDN modules, versioned cache.
// Bump VERSION whenever any shell file changes; old caches are deleted on activate.
const VERSION = 'ei-3d-v1';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.169.0/';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/layers.js', 'js/input.js', 'js/quality.js', 'js/physics-worker.js',
  'assets/poster.svg', 'assets/favicon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/icon-maskable-192.png', 'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png',
];
const MODULES = [
  'build/three.module.min.js',
  'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/ShaderPass.js', 'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/Pass.js', 'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js', 'examples/jsm/shaders/OutputShader.js',
].map((p) => CDN + p);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(MODULES.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin, cdn = req.url.startsWith(CDN);
  if (!same && !cdn) return;
  if (req.mode === 'navigate') { // network-first for the page so new deploys show up, cache when offline
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); return r; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: same }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  })));
});
