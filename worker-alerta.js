// Alertas de vencimento — roda de graça na Cloudflare (Workers + Cron).
// A cada 5 minutos ele vê se chegou a hora de um alerta; se chegou e ainda há produto
// vencendo, manda um aviso (push) para os celulares ativados no app.

const PADRAO = { horarios: ["09:00", "12:30", "18:00"], dias: 3 };
const JANELA_MIN = 10; // tolerância depois do horário marcado

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(rodar(env, { forcar: false })); },
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === "/teste") return json(await rodar(env, { forcar: true }));
    return new Response("Alertas de vencimento: ativo. Para testar, abra /teste", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};

const json = (o) => new Response(JSON.stringify(o, null, 2), { headers: { "content-type": "application/json; charset=utf-8" } });

// ---------- Firestore (API REST, mesmo banco do app) ----------
const base = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents`;
const kq = (env) => `key=${env.FIREBASE_API_KEY}`;
function dec(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
async function lerDoc(env, caminho) {
  const r = await fetch(`${base(env)}/${caminho}?${kq(env)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${caminho}: ${r.status}`);
  const d = await r.json(), o = {};
  Object.entries(d.fields || {}).forEach(([k, v]) => { o[k] = dec(v); });
  return o;
}
async function gravarEstado(env, chave) {
  await fetch(`${base(env)}/config/alertas_estado?${kq(env)}&updateMask.fieldPaths=ultimo`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields: { ultimo: { stringValue: chave } } })
  });
}
async function vencendo(env, limite) {
  const r = await fetch(`${base(env)}:runQuery?${kq(env)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "lancamentos" }], where: { fieldFilter: { field: { fieldPath: "validade" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: limite } } } } })
  });
  if (!r.ok) throw new Error(`Consulta de produtos: ${r.status}`);
  return (await r.json()).filter((x) => x.document);
}
async function inscricoes(env) {
  const r = await fetch(`${base(env)}/inscricoes?${kq(env)}&pageSize=100`);
  if (!r.ok) throw new Error(`Inscrições: ${r.status}`);
  const d = await r.json();
  return (d.documents || []).map((x) => ({ id: x.name.split("/").pop(), endpoint: dec((x.fields || {}).endpoint) })).filter((x) => x.endpoint);
}
const apagarInscricao = (env, id) => fetch(`${base(env)}/inscricoes/${id}?${kq(env)}`, { method: "DELETE" });

// ---------- Hora e data no Brasil ----------
export function horaBrasil(agora = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const g = (t) => p.find((x) => x.type === t).value;
  return { data: `${g("year")}-${g("month")}-${g("day")}`, minutos: Number(g("hour")) * 60 + Number(g("minute")) };
}
const paraMin = (h) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function somarDias(data, n) {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---------- Push (VAPID, sem texto: o app monta a mensagem ao receber) ----------
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function chaveVapid(env) {
  const pub = deb64u(env.VAPID_PUBLICA);
  return crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env.VAPID_PRIVADA, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
export async function assinar(env, aud, chave, agoraMs = Date.now()) {
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const corpo = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud, exp: Math.floor(agoraMs / 1000) + 12 * 3600, sub: env.VAPID_CONTATO || "mailto:alertas@example.com" });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo));
  return corpo + "." + b64u(sig);
}
async function enviar(env, chave, sub) {
  const aud = new URL(sub.endpoint).origin;
  const t = await assinar(env, aud, chave);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { TTL: "7200", Urgency: "high", Topic: "vencimento", Authorization: `vapid t=${t}, k=${env.VAPID_PUBLICA}` } });
  if (r.status === 404 || r.status === 410) { await apagarInscricao(env, sub.id); return "removida (celular não recebe mais)"; }
  return r.status >= 200 && r.status < 300 ? "enviado" : `erro ${r.status}`;
}

// ---------- Rotina principal ----------
export async function rodar(env, { forcar, agora = new Date() }) {
  const cfg = { ...PADRAO, ...((await lerDoc(env, "config/alertas")) || {}) };
  const hb = horaBrasil(agora);
  let chave = null;
  if (!forcar) {
    const horarios = (Array.isArray(cfg.horarios) ? cfg.horarios : []).filter((h) => paraMin(h) !== null);
    const slot = horarios.find((h) => { const d = hb.minutos - paraMin(h); return d >= 0 && d < JANELA_MIN; });
    if (!slot) return { ok: true, acao: "fora do horário" };
    chave = `${hb.data} ${slot}`;
    const est = await lerDoc(env, "config/alertas_estado");
    if (est && est.ultimo === chave) return { ok: true, acao: "já enviado neste horário" };
    await gravarEstado(env, chave); // marca antes, para não repetir mesmo se algo falhar depois
  }
  const dias = Number.isFinite(Number(cfg.dias)) ? Number(cfg.dias) : 3;
  const itens = await vencendo(env, somarDias(hb.data, dias));
  if (!itens.length) return { ok: true, acao: "nada vencendo", dias };
  const subs = await inscricoes(env);
  if (!subs.length) return { ok: true, acao: "nenhum celular ativado", produtos: itens.length };
  const k = await chaveVapid(env);
  const res = [];
  for (const s of subs) { try { res.push(await enviar(env, k, s)); } catch (e) { res.push("falhou: " + e.message); } }
  return { ok: true, acao: "alerta enviado", produtos: itens.length, celulares: res };
}
