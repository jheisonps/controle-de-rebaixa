// Ao editar qualquer arquivo do app, aumente o número da versão (v1 -> v2 ...)
const CACHE = "controle-rebaixa-v13";
const ARQ = ["./index.html","./style.css","./app.js","./firebase-config.js","./manifest.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQ))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(n => Promise.all(n.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin) || e.request.url.includes("/cosmos")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
