// ===== Controle de Rebaixa =====
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let db = null, itens = [], filtro = "todos", editandoId = null, jaTocou = false;

if (FIREBASE_CONFIG.apiKey === "COLE_AQUI") {
  document.body.insertAdjacentHTML("afterbegin", '<div id="erro-cfg">Falta configurar o Firebase. Abra o arquivo <b>firebase-config.js</b> e cole os dados do seu projeto (veja o LEIA-ME.md, passo 1).</div>');
} else {
  try { firebase.initializeApp(FIREBASE_CONFIG); db = firebase.firestore(); }
  catch (e) { document.body.insertAdjacentHTML("afterbegin", '<div id="erro-cfg">Erro no Firebase: ' + esc(e.message) + "</div>"); }
}

// ---------- Grupos por urgência ----------
const GRUPOS = [
  { k: "hoje",    nome: "Vencidos e vencendo hoje", cor: "var(--hoje)",    curto: "Hoje",     t: (d) => d <= 0 },
  { k: "urgente", nome: "Vencem em 1 a 3 dias",     cor: "var(--urgente)", curto: "1 a 3 dias", t: (d) => d >= 1 && d <= 3 },
  { k: "atencao", nome: "Vencem em 4 a 7 dias",     cor: "var(--atencao)", curto: "4 a 7 dias", t: (d) => d >= 4 && d <= 7 },
  { k: "ok",      nome: "Mais de 7 dias",           cor: "var(--ok)",      curto: "+7 dias",  t: (d) => d > 7 }
];
const grupoDe = (d) => GRUPOS.find((g) => g.t(d));

function diasPara(iso) {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00") - h) / 86400000);
}
const fmt = (iso) => iso.split("-").reverse().join("/");
const curtaData = (iso) => iso.split("-").reverse().slice(0, 2).join("/");

// ---------- Máscara e validação de data ----------
function mascara(el) {
  el.addEventListener("input", () => {
    const d = el.value.replace(/\D/g, "").slice(0, 8);
    el.value = d.length > 4 ? d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4) : d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  });
}
document.querySelectorAll(".data").forEach(mascara);
function paraISO(v) {
  const p = v.split("/");
  if (p.length !== 3 || p[0].length !== 2 || p[1].length !== 2 || p[2].length !== 4) return null;
  const [d, m, a] = p.map(Number), t = new Date(a, m - 1, d);
  if (t.getFullYear() !== a || t.getMonth() !== m - 1 || t.getDate() !== d) return null;
  return `${p[2]}-${p[1]}-${p[0]}`;
}

// ---------- Abas ----------
document.querySelectorAll(".nav").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".nav").forEach((x) => x.classList.toggle("ativo", x === b));
  document.querySelectorAll(".aba").forEach((a) => a.classList.add("oculto"));
  $("#aba-" + b.dataset.aba).classList.remove("oculto");
  if (b.dataset.aba !== "bipar") pararCamera();
}));

// ---------- Lista de produtos ----------
function render() {
  const busca = $("#busca").value.trim().toLowerCase();
  $("#resumo").innerHTML = GRUPOS.map((g) => {
    const n = itens.filter((i) => g.t(diasPara(i.validade))).length;
    return `<button class="tile ${filtro === g.k ? "sel" : ""}" style="--c:${g.cor}" data-f="${g.k}" type="button"><strong>${n}</strong><span>${g.curto}</span></button>`;
  }).join("");
  document.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => {
    filtro = filtro === t.dataset.f ? "todos" : t.dataset.f; render();
  }));

  const vis = itens.filter((i) => (!busca || (i.nome + " " + (i.codigo || "")).toLowerCase().includes(busca)));
  let html = "";
  GRUPOS.filter((g) => filtro === "todos" || filtro === g.k).forEach((g) => {
    const lista = vis.filter((i) => g.t(diasPara(i.validade))).sort((a, b) => a.validade.localeCompare(b.validade));
    if (!lista.length) return;
    html += `<div class="grupo" style="--c:${g.cor}">${g.nome} <small>(${lista.length})</small></div>`;
    lista.forEach((i) => {
      const d = diasPara(i.validade);
      const big = d < 0 ? `<b>${-d}</b><span>${-d === 1 ? "dia vencido" : "dias vencido"}</span>` : d === 0 ? "<b>HOJE</b>" : `<b>${d}</b><span>${d === 1 ? "dia" : "dias"}</span>`;
      html += `<div class="card" style="--c:${g.cor}">
        <div class="dias ${d === 0 ? "txt" : ""}">${big}</div>
        ${i.foto ? `<img class="thumb" src="${esc(i.foto)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
        <div class="info"><strong>${esc(i.nome)}</strong>
          <span>Vence em ${fmt(i.validade)} · ${i.quantidade} un</span>
          <span>${i.codigo ? "Cód. " + esc(i.codigo) : "Sem código"}${i.ncm ? " · NCM " + esc(i.ncm) : ""}</span></div>
        <div class="acoes"><button data-id="${i.id}" data-a="e" type="button" aria-label="Editar">✏️</button><button data-id="${i.id}" data-a="x" type="button" aria-label="Excluir">🗑️</button></div>
      </div>`;
    });
  });
  $("#lista").innerHTML = html || `<div class="vazio">${itens.length ? "Nenhum produto encontrado." : "Nenhum produto lançado ainda.<br>Toque em <b>Lançar</b> para cadastrar o primeiro."}</div>`;
  document.querySelectorAll(".acoes button").forEach((b) => b.addEventListener("click", () => {
    b.dataset.a === "e" ? abrirEdicao(b.dataset.id) : excluir(b.dataset.id);
  }));
  atualizarAlerta();
}
$("#busca").addEventListener("input", render);

if (db) {
  db.collection("lancamentos").onSnapshot((s) => {
    itens = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(); tentarSomAoAbrir();
  }, (e) => {
    $("#lista").innerHTML = `<div class="vazio">Erro ao ler o banco: ${esc(e.message)}<br>Confira as Regras do Firestore (LEIA-ME, passo 1).</div>`;
  });
}

// ---------- Editar / excluir ----------
const dlg = $("#dlg");
function abrirEdicao(id) {
  const i = itens.find((x) => x.id === id); if (!i) return;
  editandoId = id;
  $("#e-nome").value = i.nome; $("#e-validade").value = fmt(i.validade);
  $("#e-qtd").value = i.quantidade; $("#e-ncm").value = i.ncm || "";
  fotoEdit = i.foto || ""; mostrarFoto($("#e-foto"), $("#btn-foto-e"), fotoEdit);
  dlg.showModal();
}
$("#e-cancelar").addEventListener("click", () => dlg.close());
$("#e-excluir").addEventListener("click", async () => { if (await excluir(editandoId)) dlg.close(); });
$("#form-edit").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const v = paraISO($("#e-validade").value.trim());
  if (!v) return alert("Validade inválida. Use DD/MM/AAAA.");
  try {
    await db.collection("lancamentos").doc(editandoId).update({
      nome: $("#e-nome").value.trim(), validade: v,
      quantidade: parseInt($("#e-qtd").value, 10) || 1, ncm: $("#e-ncm").value.trim(), foto: fotoEdit
    });
    dlg.close();
  } catch (e) { alert("Erro ao salvar: " + e.message); }
});
async function excluir(id) {
  const i = itens.find((x) => x.id === id);
  if (!i || !confirm(`Excluir "${i.nome}" (validade ${fmt(i.validade)})?`)) return false;
  try { await db.collection("lancamentos").doc(id).delete(); return true; }
  catch (e) { alert("Erro ao excluir: " + e.message); return false; }
}

// ---------- Câmera / lançar ----------
let leitor = null, codigoAtual = null;
async function pararCamera() {
  if (leitor) { try { await leitor.stop(); leitor.clear(); } catch (e) {} leitor = null; }
}
$("#btn-camera").addEventListener("click", async () => {
  await pararCamera();
  $("#msg").textContent = "Abrindo câmera...";
  $("#leitor").innerHTML = '<div id="qr" style="width:100%"></div>';
  leitor = new Html5Qrcode("qr");
  try {
    await leitor.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 120 } }, onLido, () => {});
    $("#msg").textContent = "Aponte para o código de barras.";
  } catch (e) { $("#msg").textContent = "Não foi possível abrir a câmera: " + e; }
});
$("#btn-manual").addEventListener("click", async () => {
  await pararCamera(); $("#leitor").innerHTML = ""; codigoAtual = null;
  limparNovo(); $("#form-novo").classList.remove("oculto"); $("#n-nome").focus();
});

let audioCtx = null;
function beep(freq = 1500, dur = 0.12, quando = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + quando;
    o.type = "square"; o.frequency.value = freq; g.gain.value = 0.18;
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur);
  } catch (e) {}
}

// ---------- Foto ----------
let fotoNova = "", fotoEdit = "", alvoFoto = "novo";
function mostrarFoto(img, btn, src) {
  img.classList.toggle("oculto", !src);
  if (src) img.src = src; else img.removeAttribute("src");
  btn.textContent = src ? "📸 Trocar foto" : "📸 Tirar foto";
}
function reduzir(file) {
  return new Promise((ok, err) => {
    const r = new FileReader();
    r.onerror = err;
    r.onload = () => {
      const im = new Image();
      im.onerror = err;
      im.onload = () => {
        const k = Math.min(1, 400 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.65));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
$("#btn-foto").addEventListener("click", () => { alvoFoto = "novo"; $("#arq-foto").click(); });
$("#btn-foto-e").addEventListener("click", () => { alvoFoto = "edit"; $("#arq-foto").click(); });
$("#arq-foto").addEventListener("change", async (ev) => {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  try {
    const url = await reduzir(f);
    if (alvoFoto === "novo") { fotoNova = url; mostrarFoto($("#n-foto"), $("#btn-foto"), url); }
    else { fotoEdit = url; mostrarFoto($("#e-foto"), $("#btn-foto-e"), url); }
  } catch (e) { alert("Não foi possível ler a foto."); }
});

function limparNovo() {
  $("#form-novo").reset(); fotoNova = "";
  mostrarFoto($("#n-foto"), $("#btn-foto"), "");
  $("#busca-status").className = "status oculto";
}

// ---------- Busca automática: catálogo próprio e depois Cosmos ----------
async function preencher(codigo) {
  const st = $("#busca-status");
  const msg = (t, c) => { st.textContent = t; st.className = "status " + (c || ""); };
  const nome = $("#n-nome"), ncm = $("#n-ncm");
  msg("Buscando produto...");
  let achou = false;
  try {
    const d = await db.collection("produtos").doc(codigo).get();
    if (d.exists) {
      const p = d.data();
      if (p.nome) { nome.value = p.nome; achou = true; }
      if (p.ncm) ncm.value = p.ncm;
      if (p.foto) { fotoNova = p.foto; mostrarFoto($("#n-foto"), $("#btn-foto"), p.foto); }
    }
  } catch (e) {}
  if (COSMOS_TOKEN && (!nome.value || !ncm.value || !fotoNova)) {
    try {
      const r = await fetch("https://api.cosmos.bluesoft.com.br/gtins/" + codigo + ".json", { headers: { "X-Cosmos-Token": COSMOS_TOKEN } });
      if (r.ok) {
        const c = await r.json();
        if (c.description && !nome.value) { nome.value = c.description; achou = true; }
        if (c.ncm && c.ncm.code && !ncm.value) ncm.value = c.ncm.code;
        if (c.thumbnail && !fotoNova) { fotoNova = c.thumbnail; mostrarFoto($("#n-foto"), $("#btn-foto"), c.thumbnail); }
      }
    } catch (e) {}
  }
  if (achou) { msg("✔ Produto encontrado. Confira e informe a validade.", "ok"); $("#n-validade").focus(); }
  else msg(COSMOS_TOKEN ? "Produto não encontrado. Digite o nome e tire a foto." : "Cosmos sem token no firebase-config.js. Digite o nome e tire a foto.", "aviso");
}

async function onLido(codigo) {
  if (codigoAtual === codigo) return;
  codigoAtual = codigo; beep();
  await pararCamera(); $("#leitor").innerHTML = "";
  limparNovo();
  $("#form-novo").classList.remove("oculto");
  $("#n-codigo").value = codigo; $("#msg").textContent = "";
  await preencher(codigo);
}

$("#form-novo").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const codigo = $("#n-codigo").value.trim(), nome = $("#n-nome").value.trim(), ncm = $("#n-ncm").value.trim();
  const validade = paraISO($("#n-validade").value.trim());
  if (!validade) { $("#msg").textContent = "Validade inválida. Use DD/MM/AAAA."; return; }
  try {
    if (codigo) await db.collection("produtos").doc(codigo).set({ nome, ncm, foto: fotoNova }, { merge: true });
    await db.collection("lancamentos").add({
      codigo, nome, ncm, foto: fotoNova, validade, quantidade: parseInt($("#n-qtd").value, 10) || 1,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    limparNovo(); ev.target.classList.add("oculto"); codigoAtual = null;
    $("#msg").textContent = "✅ Produto salvo!";
  } catch (e) { $("#msg").textContent = "Erro ao salvar: " + e.message; }
});

// ---------- Alertas: faixa, som, WhatsApp, notificação ----------
const urgentes = () => itens.filter((i) => diasPara(i.validade) <= 3).sort((a, b) => a.validade.localeCompare(b.validade));

function atualizarAlerta() {
  const u = urgentes(), el = $("#alerta");
  if (!u.length) { el.classList.add("oculto"); return; }
  const hoje = u.filter((i) => diasPara(i.validade) <= 0).length;
  $("#alerta-txt").textContent = `⚠️ ${u.length} produto${u.length > 1 ? "s" : ""} para rebaixar` + (hoje ? ` — ${hoje} vence${hoje > 1 ? "m" : ""} HOJE ou já venceu` : " (até 3 dias)");
  el.classList.remove("oculto");
}
function tocarAlerta() { [0, 0.25, 0.5].forEach((q) => beep(1200, 0.18, q)); }
function tentarSomAoAbrir() {
  if (jaTocou || !urgentes().length) return;
  jaTocou = true; tocarAlerta();
}
// Navegadores bloqueiam som sem toque; no primeiro toque o alerta toca se houver urgentes
document.addEventListener("click", function once() {
  if (urgentes().length && !audioCtx) tocarAlerta();
  document.removeEventListener("click", once);
}, { once: true });
$("#btn-som").addEventListener("click", tocarAlerta);
setInterval(() => { if (urgentes().length) { tocarAlerta(); notificar(); } render(); }, 30 * 60 * 1000);

function mensagemZap() {
  const u = urgentes();
  if (!u.length) return "✅ Controle de Rebaixa: nenhum produto vencendo nos próximos 3 dias.";
  const linha = (i) => {
    const d = diasPara(i.validade);
    const q = d < 0 ? `venceu em ${curtaData(i.validade)}` : d === 0 ? "vence HOJE" : `vence em ${d} dia${d > 1 ? "s" : ""} (${curtaData(i.validade)})`;
    return `• ${i.nome} (${i.quantidade} un) — ${q}`;
  };
  return "⚠️ *Controle de Rebaixa*\nProdutos para rebaixar:\n\n" + u.map(linha).join("\n");
}
function abrirZap() {
  let n = (localStorage.getItem("zap") || "").replace(/\D/g, "");
  if (n && n.length <= 11) n = "55" + n;
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(mensagemZap())}`, "_blank");
}
$("#btn-zap").addEventListener("click", abrirZap);
$("#btn-zap2").addEventListener("click", abrirZap);
$("#zap-num").value = localStorage.getItem("zap") || "";
$("#btn-salvar-zap").addEventListener("click", () => {
  localStorage.setItem("zap", $("#zap-num").value.trim()); alert("Número salvo neste aparelho.");
});

async function notificar() {
  if (!("Notification" in window) || Notification.permission !== "granted" || !urgentes().length) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const o = { body: mensagemZap().replace(/\*/g, ""), tag: "rebaixa" };
  reg ? reg.showNotification("Controle de Rebaixa", o) : new Notification("Controle de Rebaixa", o);
}
$("#btn-notif").addEventListener("click", async () => {
  if (!("Notification" in window)) return alert("Este navegador não suporta notificações.");
  const r = await Notification.requestPermission();
  if (r === "granted") { notificar(); alert("Notificações ativadas."); } else alert("Notificações não permitidas.");
});

// ---------- Botão instalar ----------
let promptInstalar = null;
const jaInstalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
if (!jaInstalado()) $("#btn-instalar").classList.remove("oculto");
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptInstalar = e; });
window.addEventListener("appinstalled", () => $("#btn-instalar").classList.add("oculto"));
$("#btn-instalar").addEventListener("click", async () => {
  if (promptInstalar) { promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; return; }
  alert(/iphone|ipad|ipod/i.test(navigator.userAgent)
    ? "No iPhone: toque em Compartilhar e depois em 'Adicionar à Tela de Início'."
    : "Toque no menu ⋮ do navegador e escolha 'Instalar app' ou 'Adicionar à tela inicial'.");
});

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").then((r) => r.update()).catch(() => {}));
  let rec = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (rec || !navigator.serviceWorker.controller) return; rec = true; location.reload(); });
}
