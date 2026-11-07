// Ao editar qualquer arquivo do app, aumente o número da versão (v1 -> v2 ...)
const CACHE = "controle-rebaixa-v16";
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

// ---------- Alertas de vencimento (push) ----------
// A Cloudflare manda um "toque" sem texto; aqui o app consulta o banco e monta a mensagem na hora.
const TAG_AL = "vencimento";
async function cfgFB() {
  let txt = "";
  try { txt = await (await fetch("firebase-config.js", { cache: "no-store" })).text(); }
  catch (e) { const c = await caches.match("./firebase-config.js"); txt = c ? await c.text() : ""; }
  const pid = (txt.match(/projectId:\s*"([^"]+)"/) || [])[1], key = (txt.match(/apiKey:\s*"([^"]+)"/) || [])[1];
  return pid && key ? { pid, key } : null;
}
const ymdLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
async function lerVencendo() {
  const c = await cfgFB(); if (!c) throw new Error("sem configuração");
  const base = `https://firestore.googleapis.com/v1/projects/${c.pid}/databases/(default)/documents`;
  let dias = 3;
  try {
    const r = await fetch(`${base}/config/alertas?key=${c.key}`);
    if (r.ok) { const d = await r.json(), v = d.fields && d.fields.dias; if (v) dias = Number(v.integerValue ?? v.doubleValue ?? 3); }
  } catch (e) {}
  const lim = new Date(); lim.setDate(lim.getDate() + dias);
  const r = await fetch(`${base}:runQuery?key=${c.key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "lancamentos" }], where: { fieldFilter: { field: { fieldPath: "validade" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: ymdLocal(lim) } } } } })
  });
  if (!r.ok) throw new Error("consulta " + r.status);
  const itens = (await r.json()).filter((x) => x.document).map((x) => {
    const f = x.document.fields || {}, q = f.quantidade || {};
    return { nome: (f.nome || {}).stringValue || "Produto", validade: (f.validade || {}).stringValue || "", quantidade: Number(q.integerValue ?? q.doubleValue ?? 0) };
  }).sort((a, b) => a.validade.localeCompare(b.validade));
  return { dias, itens };
}
function montarAlerta(itens, dias) {
  const h0 = new Date(); h0.setHours(0, 0, 0, 0);
  const dp = (v) => Math.round((new Date(v + "T00:00:00") - h0) / 864e5);
  const n = itens.length;
  const titulo = "⚠️ " + n + (n > 1 ? " produtos vencem" : " produto vence") + (dias === 0 ? " hoje" : ` em até ${dias} dia${dias > 1 ? "s" : ""}`);
  const linha = (i) => { const d = dp(i.validade); return (d < 0 ? `Venceu há ${-d}d` : d === 0 ? "HOJE" : d === 1 ? "AMANHÃ" : `Em ${d} dias`) + " · " + i.nome + ` (${i.quantidade} un)`; };
  const corpo = itens.slice(0, 5).map(linha).join("\n") + (n > 5 ? `\n+ ${n - 5} outro(s)` : "");
  return { titulo, corpo };
}
async function mostrarAlerta() {
  let r = null;
  try { r = await lerVencendo(); } catch (e) {}
  const opc = { tag: TAG_AL, renotify: true, requireInteraction: true, vibrate: [500, 200, 500, 200, 900], icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" }, actions: [{ action: "abrir", title: "Abrir o app" }] };
  if (!r) return self.registration.showNotification("⚠️ Produto perto de vencer", { ...opc, body: "Abra o app para ver a lista." });
  if (!r.itens.length) {
    await self.registration.showNotification("Controle de Rebaixa", { tag: TAG_AL, body: "Tudo certo: nenhum produto perto de vencer.", silent: true });
    await new Promise((x) => setTimeout(x, 5000));
    (await self.registration.getNotifications({ tag: TAG_AL })).forEach((n) => n.close());
    return;
  }
  const m = montarAlerta(r.itens, r.dias);
  return self.registration.showNotification(m.titulo, { ...opc, body: m.corpo });
}
self.addEventListener("push", (e) => e.waitUntil(mostrarAlerta()));
self.addEventListener("message", (e) => { if (e.data && e.data.tipo === "teste") e.waitUntil(mostrarAlerta()); });
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => (l.length ? l[0].focus() : self.clients.openWindow("./"))));
});
