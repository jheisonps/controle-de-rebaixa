// ===== Controle de Rebaixa =====
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let db = null, itens = [], filtro = "todos", editandoId = null, jaTocou = false;
let itensMF = [], metaMF = null, filtroMF = "todos", mfAtual = null;

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
const brl = (n) => "R$ " + n.toFixed(2).replace(".", ",");
function textoPrecos(i) {
  const p = [];
  if (i.precoSemClube != null) p.push("Sem clube " + brl(i.precoSemClube));
  if (i.precoComClube != null) p.push("Com clube " + brl(i.precoComClube));
  return p.join(" · ");
}
function lerPreco(v) {
  v = String(v || "").replace(/[^\d.,]/g, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}
const precoTexto = (n) => (n == null ? "" : n.toFixed(2).replace(".", ","));
const ico = (n) => `<i data-lucide="${n}"></i>`;
function icones() { try { lucide.createIcons(); } catch (e) {} }
const ICONE = { hoje: "alert-triangle", urgente: "clock", atencao: "calendar-days", ok: "check" };
const ROTULO = { hoje: "Vencido/hoje", urgente: "1 a 3 dias", atencao: "4 a 7 dias", ok: "+7 dias" };

// ---------- Máscara e validação de data ----------
function mascara(el) {
  el.addEventListener("input", () => {
    const d = el.value.replace(/\D/g, "").slice(0, 8);
    el.value = d.length > 4 ? d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4) : d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  });
}
document.querySelectorAll(".data").forEach(mascara);

// Textos digitados sempre em MAIÚSCULAS
document.querySelectorAll("#n-nome, #e-nome, #busca, #mf-busca").forEach((el) => {
  el.setAttribute("autocapitalize", "characters");
  el.addEventListener("input", () => {
    const p = el.selectionStart;
    el.value = el.value.toUpperCase();
    try { el.setSelectionRange(p, p); } catch (e) {}
  });
});

// Preços: a vírgula entra sozinha (digite 599 e aparece 5,99)
document.querySelectorAll("#n-p1, #n-p2, #e-p1, #e-p2").forEach((el) => el.addEventListener("input", () => {
  let d = el.value.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) { el.value = ""; return; }
  d = d.padStart(3, "0").slice(-12);
  el.value = d.slice(0, -2).replace(/^0+(?=\d)/, "") + "," + d.slice(-2);
}));
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
  if (b.dataset.aba === "bipar") {
    if (!leitor && $("#form-novo").classList.contains("oculto") && $("#dup").classList.contains("oculto")) iniciarCamera();
  } else pararCamera();
}));

// ---------- Lista de produtos ----------
function render() {
  const busca = $("#busca").value.trim().toLowerCase();
  const cont = {};
  GRUPOS.forEach((g) => { cont[g.k] = itens.filter((i) => g.t(diasPara(i.validade))).length; });
  $("#resumo").innerHTML = '<div class="kpis">' + GRUPOS.map((g) => `<button class="tile ${filtro === g.k ? "sel" : ""}" style="--c:${g.cor}" data-f="${g.k}" type="button"><strong>${cont[g.k]}</strong><span>${ROTULO[g.k]}</span></button>`).join("") + "</div>";
  document.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => {
    filtro = filtro === t.dataset.f ? "todos" : t.dataset.f; render();
  }));

  const vis = itens.filter((i) => casaBusca($("#busca").value, i.nome, [i.codigo]));
  let html = "";
  GRUPOS.filter((g) => filtro === "todos" || filtro === g.k).forEach((g) => {
    const lista = vis.filter((i) => g.t(diasPara(i.validade))).sort((a, b) => a.validade.localeCompare(b.validade));
    if (!lista.length) return;
    html += `<div class="grupo" style="--c:${g.cor}">${g.nome}<small>${lista.length}</small></div>`;
    lista.forEach((i) => {
      const d = diasPara(i.validade);
      const status = d < 0 ? `Venceu há ${-d}d` : d === 0 ? "Hoje" : d === 1 ? "Amanhã" : `Em ${d} dias`;
      const thumb = i.foto ? `<img class="thumb" src="${esc(i.foto)}" alt="" loading="lazy" onerror="this.classList.add('quebrada')">` : `<div class="thumb ph">${ico("package")}</div>`;
      const chips = (i.precoSemClube != null ? `<span class="chip">Sem clube ${precoTexto(i.precoSemClube)}</span>` : "") + (i.precoComClube != null ? `<span class="chip clube">Com clube ${precoTexto(i.precoComClube)}</span>` : "") + (mfDeLanc(i)?.saiu ? '<span class="chip saiu">Saiu do Mercafacil</span>' : "");
      const ck = baseConf(i) === hojeISO() ? "feito" : precisaConferir(i) ? "velho" : "";
      html += `<article class="card lanc" data-id="${i.id}" style="--c:${g.cor}">
        <strong class="nome">${esc(i.nome)}</strong>
        <div class="corpo">${thumb}
          <div class="col">
            <div class="l1"><span class="dt">${ico("calendar-days")}<b>${fmt(i.validade)}</b></span>
              <span class="ctl"><button class="ck ${ck}" data-a="ok" type="button" aria-label="Conferido">${ico("circle-check")}</button><span class="qtd"><button data-a="-" type="button" aria-label="Diminuir">−</button><b>${i.quantidade} un</b><button data-a="+" type="button" aria-label="Aumentar">+</button></span></span></div>
            <div class="l2"><span class="cod">${i.codigo ? `COD. BARRA: <b>${esc(i.codigo)}</b>` : ""}</span><span class="pill">${status}</span></div>
            ${chips ? `<div class="l3">${chips}</div>` : ""}
          </div>
        </div></article>`;
    });
  });
  $("#lista").innerHTML = html || `<div class="vazio">${ico(itens.length ? "search-x" : "package-open")}<b>${itens.length ? "Nenhum produto encontrado" : "Nenhum produto lançado ainda"}</b><span>${itens.length ? "Tente outro nome ou código." : "Toque em Lançar para cadastrar o primeiro."}</span></div>`;
  atualizarAlerta();
  icones();
}
// ---------- Conferência e quantidade rápida ----------
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const hojeISO = () => ymd(new Date());
const baseConf = (i) => i.conferidoEm || (i.criadoEm && i.criadoEm.toDate ? ymd(i.criadoEm.toDate()) : hojeISO());
const diasDesde = (iso) => { const h = new Date(); h.setHours(0, 0, 0, 0); return Math.round((h - new Date(iso + "T00:00:00")) / 86400000); };
const precisaConferir = (i) => diasDesde(baseConf(i)) > 3;
async function ajustarQtd(id, d) {
  const i = itens.find((x) => x.id === id); if (!i) return;
  if (d < 0 && (i.quantidade || 1) <= 1) { excluir(id); return; }
  try { await db.collection("lancamentos").doc(id).update({ quantidade: firebase.firestore.FieldValue.increment(d), conferidoEm: hojeISO() }); }
  catch (e) { alert("Erro ao atualizar: " + e.message); }
}
async function conferir(id) {
  try { await db.collection("lancamentos").doc(id).update({ conferidoEm: hojeISO() }); }
  catch (e) { alert("Erro ao salvar: " + e.message); }
}
$("#lista").addEventListener("click", (ev) => {
  const card = ev.target.closest(".card[data-id]"); if (!card) return;
  const id = card.dataset.id, b = ev.target.closest("button[data-a]");
  if (!b) { abrirEdicao(id); return; }
  const k = b.dataset.a;
  if (k === "x") excluir(id); else if (k === "ok") conferir(id); else ajustarQtd(id, k === "+" ? 1 : -1);
});
$("#busca").addEventListener("input", render);

if (db) {
  db.collection("lancamentos").onSnapshot((s) => {
    itens = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(); renderMF(); tentarSomAoAbrir();
  }, (e) => {
    $("#lista").innerHTML = `<div class="vazio">Erro ao ler o banco: ${esc(e.message)}<br>Confira as Regras do Firestore (LEIA-ME, passo 1).</div>`;
  });
}

if (db) {
  db.collection("mercafacil").onSnapshot((s) => {
    itensMF = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMF(); render();
  }, () => {});
  db.collection("meta").doc("mercafacil").onSnapshot((d) => { metaMF = d.exists ? d.data() : null; renderMF(); }, () => {});
}

// ---------- Editar / excluir ----------
const dlg = $("#dlg");
function abrirEdicao(id) {
  const i = itens.find((x) => x.id === id); if (!i) return;
  editandoId = id;
  $("#e-nome").value = (i.nome || "").toUpperCase(); $("#e-validade").value = fmt(i.validade);
  $("#e-qtd").value = i.quantidade; $("#e-p1").value = precoTexto(i.precoSemClube); $("#e-p2").value = precoTexto(i.precoComClube);
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
    const atual = itens.find((x) => x.id === editandoId), nome = $("#e-nome").value.trim().toUpperCase();
    await db.collection("lancamentos").doc(editandoId).update({
      nome, validade: v, quantidade: parseInt($("#e-qtd").value, 10) || 1, foto: fotoEdit, conferidoEm: hojeISO(),
      precoSemClube: lerPreco($("#e-p1").value), precoComClube: lerPreco($("#e-p2").value)
    });
    const mfx = atual && mfDeLanc(atual);
    if (mfx && nome !== (mfx.nome || "").toUpperCase()) await db.collection("mercafacil").doc(mfx.id).set({ nome, nomeEditado: true }, { merge: true });
    // mantém o catálogo (memória do app) igual à correção feita aqui
    if (atual && atual.codigo) await db.collection("produtos").doc(atual.codigo).set({ nome, ...(fotoEdit ? { foto: fotoEdit } : {}) }, { merge: true });
    dlg.close();
  } catch (e) { alert("Erro ao salvar: " + e.message); }
});
async function excluir(id) {
  const i = itens.find((x) => x.id === id); if (!i) return false;
  const mf = mfDeLanc(i), ultimo = !!mf && lancsDe(mf).filter((x) => x.id !== id).length === 0;
  if (!confirm(`Excluir "${i.nome}" (validade ${fmt(i.validade)})?` + (ultimo ? "\n\nEle também sai da lista do Mercafacil." : "") + "\n\nFica 24 h no histórico para restaurar.")) return false;
  try {
    const dados = { ...i }; delete dados.id;
    const b = db.batch();
    b.set(db.collection("excluidos").doc(), { em: Date.now(), origId: id, dados, mf: ultimo ? mf : null });
    b.delete(db.collection("lancamentos").doc(id));
    if (ultimo) b.delete(db.collection("mercafacil").doc(mf.id));
    await b.commit();
    return true;
  } catch (e) { alert("Erro ao excluir: " + e.message); return false; }
}

// ---------- Histórico de excluídos (24 h) ----------
const HIST_MS = 24 * 3600 * 1000;
let itensEx = [], limpandoEx = false;
const exVivos = () => itensEx.filter((x) => Date.now() - x.em < HIST_MS).sort((p, q) => q.em - p.em);
const tempoAtras = (ms) => { const m = Math.floor((Date.now() - ms) / 60000); return m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`; };
const dlgHist = $("#dlg-hist");
function pintarHist(l) {
  $("#hist-lista").innerHTML = l.map((x) => `<div class="dup-item"><span><b>${esc(x.dados.nome)}</b><br><small>${tempoAtras(x.em)} · ${x.dados.quantidade} un · vence ${fmt(x.dados.validade)}</small></span><button data-id="${x.id}" type="button">${ico("rotate-ccw")}Restaurar</button></div>`).join("");
  $("#hist-lista").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => restaurar(b.dataset.id)));
  icones();
}
function renderHist() {
  const l = exVivos();
  $("#btn-hist").classList.toggle("oculto", !l.length); $("#hist-n").textContent = l.length;
  if (dlgHist.open) { if (l.length) pintarHist(l); else dlgHist.close(); }
}
async function limparExpirados() {
  const velhos = itensEx.filter((x) => Date.now() - x.em >= HIST_MS);
  if (!velhos.length || limpandoEx || !db) return;
  limpandoEx = true;
  try {
    for (let k = 0; k < velhos.length; k += 400) {
      const b = db.batch(); velhos.slice(k, k + 400).forEach((x) => b.delete(db.collection("excluidos").doc(x.id))); await b.commit();
    }
  } catch (e) {}
  limpandoEx = false;
}
async function restaurar(docId) {
  const x = itensEx.find((e) => e.id === docId); if (!x) return;
  try {
    const b = db.batch();
    b.set(db.collection("lancamentos").doc(x.origId), x.dados);
    if (x.mf) { const { id: mid, ...md } = x.mf; if (!itensMF.some((m) => m.id === mid)) b.set(db.collection("mercafacil").doc(mid), md); }
    b.delete(db.collection("excluidos").doc(docId));
    await b.commit();
  } catch (e) { alert("Erro ao restaurar: " + e.message); }
}
$("#btn-hist").addEventListener("click", () => { pintarHist(exVivos()); dlgHist.showModal(); });
$("#hist-fechar").addEventListener("click", () => dlgHist.close());
if (db) {
  db.collection("excluidos").onSnapshot((s) => { itensEx = s.docs.map((d) => ({ id: d.id, ...d.data() })); limparExpirados(); renderHist(); }, () => {});
  setInterval(() => { limparExpirados(); renderHist(); }, 60000);
}

// ---------- Câmera / lançar ----------
let leitor = null, codigoAtual = null;
async function pararCamera() {
  if (leitor) { try { await leitor.stop(); leitor.clear(); } catch (e) {} leitor = null; }
}
async function iniciarCamera(prefixo = "") {
  await pararCamera(); fecharDup(); codigoAtual = null;
  $("#msg").textContent = "Abrindo câmera...";
  $("#leitor").innerHTML = '<div id="qr" style="width:100%"></div>';
  const F = Html5QrcodeSupportedFormats;
  leitor = new Html5Qrcode("qr", {
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });
  try {
    // visor pequeno (16:9) com faixa de leitura horizontal: lê o código normal ou de cabeça para baixo
    await leitor.start({ facingMode: "environment" }, {
      fps: 15, aspectRatio: 1.777778,
      qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(h * 0.55) })
    }, onLido, () => {});
    $("#msg").textContent = prefixo + "Aponte para o código de barras (pode estar de cabeça para baixo).";
  } catch (e) { $("#msg").textContent = "Não foi possível abrir a câmera: " + e; }
}
$("#btn-camera").addEventListener("click", () => iniciarCamera());
$("#btn-manual").addEventListener("click", async () => {
  await pararCamera(); $("#leitor").innerHTML = ""; codigoAtual = null;
  fecharDup(); limparNovo(); $("#form-novo").classList.remove("oculto"); $("#n-nome").focus();
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
let ultimoBuscado = "", autoPreenchido = false;
function mostrarFoto(img, btn, src) {
  img.classList.toggle("oculto", !src);
  if (src) img.src = src; else img.removeAttribute("src");
  btn.innerHTML = ico("camera") + (src ? "Trocar foto" : "Tirar foto"); icones();
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
  $("#form-novo").reset(); mfAtual = null; mostrarMFInfo(null); fotoNova = ""; ultimoBuscado = ""; autoPreenchido = false;
  mostrarFoto($("#n-foto"), $("#btn-foto"), "");
  $("#busca-status").className = "status oculto";
}

// ---------- Busca automática: catálogo próprio e depois Cosmos ----------
async function preencher(codigo) {
  const st = $("#busca-status");
  const msg = (t, c) => { st.textContent = t; st.className = "status " + (c || ""); };
  const nome = $("#n-nome");
  msg("Buscando produto...");
  let achou = false;
  const fontes = [];
  const mf = acharMF(codigo);
  if (mf) {
    mfAtual = mf; mostrarMFInfo(mf); achou = true; fontes.push("Mercafacil");
    if (!nome.value && mf.nome) nome.value = mf.nome.toUpperCase();
    if (!$("#n-p1").value && mf.p1 != null) $("#n-p1").value = precoTexto(mf.p1);
    if (!$("#n-p2").value && mf.p2 != null) $("#n-p2").value = precoTexto(mf.p2);
  }
  try {
    const d = await db.collection("produtos").doc(codigo).get();
    if (d.exists) {
      const p = d.data();
      if (p.nome) { if (!nome.value) nome.value = p.nome.toUpperCase(); achou = true; fontes.push("seu catálogo"); }
      if (p.foto && !fotoNova) { fotoNova = p.foto; mostrarFoto($("#n-foto"), $("#btn-foto"), p.foto); }
    }
  } catch (e) {}
  let aviso = "";
  if (!COSMOS_TOKEN) aviso = "Cosmos sem token no firebase-config.js.";
  else if (!nome.value || !fotoNova) {
    const r = await consultarCosmos(codigo);
    if (r.dados) {
      const c = r.dados; fontes.push("Cosmos");
      if (c.description && !nome.value) { nome.value = c.description.toUpperCase(); achou = true; }
      if (c.thumbnail && !fotoNova) { fotoNova = c.thumbnail; mostrarFoto($("#n-foto"), $("#btn-foto"), c.thumbnail); }
    } else aviso = r.aviso + (r.detalhe ? " (" + r.detalhe.join(" | ") + ")" : "");
  }
  // Segunda fonte (gratuita, sem limite diário): Open Food Facts.
  let avisoOff = "";
  if (!nome.value || !fotoNova) {
    const o = await consultarOFF(codigo);
    if (o.nome || o.foto) {
      fontes.push(o.fonte);
      if (o.nome && !nome.value) { nome.value = o.nome.toUpperCase(); achou = true; }
      if (o.foto && !fotoNova) { fotoNova = o.foto; mostrarFoto($("#n-foto"), $("#btn-foto"), o.foto); }
    } else avisoOff = o.aviso;
  }
  const extraMF = !mfAtual && itensMF.length ? " ⚠ Este código NÃO está na lista do Mercafacil." : "";
  if (achou) { msg("Encontrado (" + fontes.join(" + ") + "). Confira e informe a validade." + extraMF, extraMF ? "aviso" : "ok"); $("#n-validade").focus(); }
  else msg([aviso || "Produto não encontrado no Cosmos.", avisoOff].filter(Boolean).join(" ") + " Digite o nome e tire a foto." + extraMF, "aviso");
  autoPreenchido = achou;
}

// Bases gratuitas da mesma família (mesma API): alimentos, produtos em geral, higiene/beleza e pet
const BASES_OFF = [
  ["Open Food Facts", "world.openfoodfacts.org"],
  ["Open Products Facts", "world.openproductsfacts.org"],
  ["Open Beauty Facts", "world.openbeautyfacts.org"],
  ["Open Pet Food Facts", "world.openpetfoodfacts.org"]
];
async function consultarOFF(codigo) {
  const res = await Promise.all(BASES_OFF.map(async ([rotulo, host]) => {
    try {
      const r = await fetch("https://" + host + "/api/v2/product/" + codigo + ".json?fields=product_name,product_name_pt,generic_name,brands,image_front_small_url,image_front_url");
      const d = await r.json();
      if (d.status !== 1 || !d.product) return { ok: true };
      const p = d.product, base = (p.product_name_pt || p.product_name || p.generic_name || "").trim();
      const marca = (p.brands || "").split(",")[0].trim();
      const nome = base && marca && !base.toLowerCase().includes(marca.toLowerCase()) ? base + " - " + marca : base;
      return { ok: true, nome, foto: p.image_front_small_url || p.image_front_url || "", fonte: rotulo };
    } catch (e) { return { ok: false }; }
  }));
  const achado = res.find((x) => x.nome) || res.find((x) => x.foto);
  if (achado) return achado;
  return { aviso: res.every((x) => !x.ok) ? "Open Food Facts indisponível (sem conexão ou bloqueio)." : "Não encontrado no Open Food Facts nem nas bases irmãs (produtos, higiene, pet)." };
}

async function tentar(url, h) {
  try {
    const r = await fetch(url, { headers: h });
    const txt = await r.text();
    let dados = null; try { dados = JSON.parse(txt); } catch (e) {}
    return { status: r.status, dados, txt: txt.slice(0, 40).replace(/\s+/g, " ") };
  } catch (e) { return { erro: String(e.message || e) }; }
}
async function consultarCosmos(codigo) {
  const h = { "X-Cosmos-Token": COSMOS_TOKEN }, det = [];
  const rotas = [["ponte", "/cosmos?codigo=" + codigo], ["direto", "https://api.cosmos.bluesoft.com.br/gtins/" + codigo + ".json"]];
  for (const [nome, url] of rotas) {
    const r = await tentar(url, h);
    if (r.dados) {
      if (r.status === 200) return { dados: r.dados };
      if (r.status === 404) return { aviso: "Produto não encontrado no Cosmos." };
      if (r.status === 401 || r.status === 403) return { aviso: "Token do Cosmos inválido." };
      if (r.status === 429) return { aviso: "Limite diário do Cosmos atingido." };
      return { aviso: "Cosmos indisponível (erro " + r.status + ")." };
    }
    det.push(nome + ": " + (r.erro ? "falhou (" + r.erro + ")" : "HTTP " + r.status + ", não é JSON (" + r.txt + ")"));
  }
  return { aviso: "Não consegui falar com o Cosmos.", detalhe: det };
}
$("#btn-cosmos").addEventListener("click", async () => {
  if (!COSMOS_TOKEN) return alert("Falta o token do Cosmos no firebase-config.js.");
  const r = await consultarCosmos("7891000100103");
  alert(r.dados || /não encontrado/.test(r.aviso || "") ? "✔ Cosmos conectado." : r.aviso + "\n" + (r.detalhe || []).join("\n"));
});

function nota(freq, dur, quando, tipo = "sine", vol = 0.22) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + quando;
    o.type = tipo; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) {}
}
// Som de "prêmio": arpejo ascendente e acorde final
function somPremio() {
  [[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.3]].forEach(([f, q]) => nota(f, 0.25, q, "triangle"));
  [1046.5, 1318.5, 1568].forEach((f) => nota(f, 0.7, 0.46, "sine", 0.16));
  nota(2093, 0.5, 0.55, "sine", 0.1);
}
function fecharDup() { $("#dup").classList.add("oculto"); codigoAtual = null; }
function mostrarDup(codigo, ja) {
  $("#form-novo").classList.add("oculto");
  $("#dup-lista").innerHTML = ja.map((i) => `<div class="dup-item"><span><b>${esc(i.nome)}</b><br>Vence em ${fmt(i.validade)} · ${i.quantidade} un</span><button data-id="${i.id}" type="button">${ico("pencil")}Editar</button></div>`).join("");
  $("#dup-lista").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { fecharDup(); abrirEdicao(b.dataset.id); }));
  $("#dup-novo").onclick = () => { fecharDup(); $("#form-novo").classList.remove("oculto"); $("#n-codigo").value = codigo; ultimoBuscado = codigo; preencher(codigo); };
  $("#dup").classList.remove("oculto"); icones();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// Fluxo único para código bipado ou digitado: avisa se já existe; senão busca nome e foto
async function processarCodigo(codigo, manual) {
  if (manual) {
    if (codigo === ultimoBuscado) return;
    if (autoPreenchido) { $("#n-nome").value = ""; fotoNova = ""; mostrarFoto($("#n-foto"), $("#btn-foto"), ""); }
  }
  ultimoBuscado = codigo;
  const ja = itens.filter((i) => i.codigo === codigo).sort((a, b) => a.validade.localeCompare(b.validade));
  if (ja.length) { somPremio(); mostrarDup(codigo, ja); return; }
  if (!manual) beep();
  await preencher(codigo);
}

async function onLido(codigo) {
  if (codigoAtual === codigo) return;
  codigoAtual = codigo;
  await pararCamera(); $("#leitor").innerHTML = "";
  limparNovo(); $("#msg").textContent = "";
  $("#form-novo").classList.remove("oculto");
  $("#n-codigo").value = codigo;
  await processarCodigo(codigo, false);
}

// Digitou o código: busca sozinho ao completar 13 dígitos, ao sair do campo ou ao apertar Enter
const campoCodigo = $("#n-codigo");
const buscarManual = () => { const c = campoCodigo.value.replace(/\D/g, ""); if (c.length >= 8) processarCodigo(c, true); };
campoCodigo.addEventListener("input", () => { const n = campoCodigo.value.replace(/\D/g, "").length; if (n === 13 || n === 14) buscarManual(); });
campoCodigo.addEventListener("change", buscarManual);
campoCodigo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscarManual(); } });

$("#form-novo").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const mf = mfAtual;
  const codigo = $("#n-codigo").value.trim(), nome = $("#n-nome").value.trim().toUpperCase();
  const validade = paraISO($("#n-validade").value.trim());
  if (!validade) { $("#msg").textContent = "Validade inválida. Use DD/MM/AAAA."; return; }
  try {
    if (codigo) await db.collection("produtos").doc(codigo).set({ nome, ...(fotoNova ? { foto: fotoNova } : {}) }, { merge: true });
    if (mf && nome && nome !== (mf.nome || "").toUpperCase()) await db.collection("mercafacil").doc(mf.id).set({ nome, nomeEditado: true }, { merge: true });
    await db.collection("lancamentos").add({
      codigo, nome, mfId: mf ? mf.id : null, foto: fotoNova, validade, quantidade: parseInt($("#n-qtd").value, 10) || 1,
      precoSemClube: lerPreco($("#n-p1").value), precoComClube: lerPreco($("#n-p2").value),
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    limparNovo(); ev.target.classList.add("oculto"); codigoAtual = null;
    iniciarCamera("Produto salvo! ");
  } catch (e) { $("#msg").textContent = "Erro ao salvar: " + e.message; }
});

// ---------- Alertas: faixa, som, WhatsApp, notificação ----------
const urgentes = () => itens.filter((i) => diasPara(i.validade) <= 3).sort((a, b) => a.validade.localeCompare(b.validade));

function atualizarAlerta() {
  const u = urgentes(), el = $("#alerta");
  if (!u.length) { el.classList.add("oculto"); return; }
  const hoje = u.filter((i) => diasPara(i.validade) <= 0).length;
  $("#alerta-txt").textContent = `${u.length} ${u.length > 1 ? "produtos vencem" : "produto vence"} em até 3 dias` + (hoje ? ` — ${hoje} ${hoje > 1 ? "vencem" : "vence"} HOJE ou já ${hoje > 1 ? "venceram" : "venceu"}` : "");
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
  return "⚠️ *Controle de Rebaixa*\nProdutos vencendo em até 3 dias:\n\n" + u.map(linha).join("\n");
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

// ---------- Mercafacil ----------
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const soNum = (c) => String(c ?? "").replace(/\D/g, "").replace(/^0+/, "");
const brlN = (v) => (v == null ? "-" : brl(v));
// EAN vazio, curto ou igual ao SKU = não é código de barras de verdade
const suspeito = (m) => { const e = soNum(m.ean); return !e || e.length < 8 || e === soNum(m.sku); };
const precisaConfirmar = (m) => suspeito(m) && !m.codigoReal;
function codigosMF(m) {
  const s = new Set();
  if (!suspeito(m)) s.add(soNum(m.ean));
  if (m.codigoReal) s.add(soNum(m.codigoReal));
  return s;
}
function acharMF(codigo) {
  const c = soNum(codigo); if (!c) return null;
  const l = itensMF.filter((m) => codigosMF(m).has(c));
  return l.find((m) => !m.saiu) || l[0] || null;
}
const lancsDe = (m) => itens.filter((i) => i.mfId === m.id || codigosMF(m).has(soNum(i.codigo)));
const mfDeLanc = (i) => (i.mfId && itensMF.find((m) => m.id === i.mfId)) || acharMF(i.codigo);

function mostrarMFInfo(m) {
  const el = $("#mf-info");
  if (!m) { el.className = "status oculto"; return; }
  el.textContent = m.saiu ? "⚠ Mercafacil: este produto saiu da campanha na última planilha." : "✔ Mercafacil · SKU " + m.sku + " · nome e preços vieram da planilha.";
  el.className = "status " + (m.saiu ? "aviso" : "ok");
}

// busca: cada palavra pode estar em qualquer parte do nome; números casam com o fim do código (4 últimos dígitos)
function casaBusca(q, nome, codigos) {
  const toks = norm(q).split(" ").filter(Boolean); if (!toks.length) return true;
  const n = norm(nome), cods = codigos.map((c) => String(c ?? "").replace(/\D/g, "")).filter(Boolean);
  return toks.every((t) => n.includes(t) || (/^\d+$/.test(t) && cods.some((c) => c.endsWith(t) || (t.length >= 5 && c.includes(t)))));
}

// ----- lista -----
const TILES_MF = [
  ["falta", "Falta lançar", "package-open", "var(--urgente)"],
  ["lancado", "Lançados", "circle-check", "var(--ok)"],
  ["saiu", "Saíram", "log-out", "var(--hoje)"],
  ["conf", "A confirmar", "scan-barcode", "#7B4FD6"]
];
function renderMF() {
  const lista = $("#mf-lista"); if (!lista) return;
  $("#mf-meta").textContent = metaMF && metaMF.importadoEm
    ? "Última importação: " + new Date(metaMF.importadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + " · " + itensMF.filter((m) => !m.saiu).length + " produtos na campanha"
    : "Nenhuma planilha importada ainda.";
  const busca = norm($("#mf-busca").value);
  const dados = itensMF.map((m) => {
    const l = lancsDe(m);
    return { m, l, cat: m.saiu ? "saiu" : l.length ? "lancado" : "falta", conf: !m.saiu && precisaConfirmar(m) };
  });
  const cont = { falta: 0, lancado: 0, saiu: 0, conf: 0 };
  dados.forEach((x) => { cont[x.cat]++; if (x.conf) cont.conf++; });
  $("#mf-resumo").innerHTML = TILES_MF.map(([k, nome, ic, cor]) =>
    `<button class="tile ${filtroMF === k ? "sel" : ""}" style="--c:${cor}" data-f="${k}" type="button"><strong>${cont[k]}</strong><span>${nome}</span></button>`).join("");
  document.querySelectorAll("#mf-resumo .tile").forEach((t) => t.addEventListener("click", () => {
    filtroMF = filtroMF === t.dataset.f ? "todos" : t.dataset.f; renderMF();
  }));
  const passa = (x) => casaBusca($("#mf-busca").value, x.m.nome, [x.m.ean, x.m.sku, x.m.codigoReal])
    && (filtroMF === "todos" || (filtroMF === "conf" ? x.conf : x.cat === filtroMF));
  const GR = [["falta", "Falta lançar", "var(--urgente)"], ["lancado", "Já lançados", "var(--ok)"], ["saiu", "Saíram da campanha", "var(--hoje)"]];
  const ultimo = metaMF && metaMF.ultimoLote, novaImp = metaMF && (metaMF.importacoes || 0) > 1;
  let html = "";
  GR.forEach(([k, nome, cor]) => {
    const l = dados.filter((x) => x.cat === k && passa(x)).sort((a, b) => (a.m.nome || "").localeCompare(b.m.nome || "", "pt-BR"));
    if (!l.length) return;
    html += `<div class="grupo" style="--c:${cor}">${nome}<small>${l.length}</small></div>`;
    l.forEach((x) => { html += cartaoMF(x); });
  });
  lista.innerHTML = html || `<div class="vazio">${ico(itensMF.length ? "search-x" : "file-spreadsheet")}<b>${itensMF.length ? "Nenhum produto encontrado" : "Nenhuma planilha importada"}</b><span>${itensMF.length ? "Tente outro nome ou código." : "No computador, abra “Importar planilha do Mercafacil” e escolha o arquivo."}</span></div>`;
  lista.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => abrirConferencia(c.dataset.id)));
  icones();

  function cartaoMF(x) {
    const m = x.m;
    const cor = x.conf ? "#7B4FD6" : x.cat === "falta" ? "var(--urgente)" : x.cat === "lancado" ? "var(--ok)" : "var(--hoje)";
    const qtd = x.l.reduce((s, i) => s + (i.quantidade || 0), 0);
    const pill = x.cat === "saiu" ? "Saiu da campanha" : x.cat === "lancado" ? `Lançado · ${qtd} un` : x.conf ? "Confirmar código" : "Falta lançar";
    const dif = x.cat === "lancado" && x.l.some((i) => (i.precoSemClube != null && m.p1 != null && i.precoSemClube !== m.p1) || (i.precoComClube != null && m.p2 != null && i.precoComClube !== m.p2));
    const chips = (m.p1 != null ? `<span class="chip">Sem clube ${brl(m.p1)}</span>` : "") + (m.p2 != null ? `<span class="chip clube">Com clube ${brl(m.p2)}</span>` : "")
      + (x.conf ? '<span class="chip conf">EAN igual ao SKU</span>' : "")
      + (novaImp && m.criadoLote === ultimo ? '<span class="chip novo">NOVO</span>' : "")
      + (dif ? '<span class="chip aviso">Preço diferente do lançamento</span>' : "")
      + (x.cat === "saiu" && x.l.length ? '<span class="chip saiu">Tem lançamento: rever</span>' : "");
    return `<article class="card mf ${x.conf ? "conf" : ""}" data-id="${esc(m.id)}" style="--c:${cor}">
      <div class="info"><strong>${esc(m.nome)}</strong>
        <div class="meta">SKU <b>${esc(m.sku || "-")}</b>${suspeito(m) ? "" : " · EAN <b>" + esc(m.ean) + "</b>"}</div>
        <div class="chips">${chips}</div></div>
      <div class="lado"><span class="pill">${pill}</span></div></article>`;
  }
}
$("#mf-busca").addEventListener("input", renderMF);

// ----- conferência (toque no nome + bipar) -----
let mfConf = null, mfPendente = null, leitorMF = null, travaMF = false;
const dlgMF = $("#dlg-mf");
function avisoMF(t, c) { const el = $("#mf-aviso"); el.textContent = t || ""; el.className = "status " + (c || "") + (t ? "" : " oculto"); }
async function pararLeitorMF() {
  if (leitorMF) { try { await leitorMF.stop(); leitorMF.clear(); } catch (e) {} leitorMF = null; }
  $("#mf-leitor").innerHTML = "";
}
async function iniciarLeitorMF() {
  await pararLeitorMF(); travaMF = false; $("#mf-salvar-box").classList.add("oculto"); avisoMF("");
  $("#mf-leitor").innerHTML = '<div id="qr-mf" style="width:100%"></div>';
  const F = Html5QrcodeSupportedFormats;
  leitorMF = new Html5Qrcode("qr-mf", {
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false
  });
  try {
    await leitorMF.start({ facingMode: "environment" }, {
      fps: 15, aspectRatio: 1.777778,
      qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(h * 0.55) })
    }, (cod) => {
      if (!leitorMF || travaMF) return;
      travaMF = true; beep();
      pararLeitorMF().then(() => conferirCodigo(cod));
    }, () => {});
  } catch (e) { avisoMF("Não foi possível abrir a câmera: " + e + ". Use “digitar o código”.", "aviso"); leitorMF = null; }
}
function abrirConferencia(id) {
  const m = itensMF.find((x) => x.id === id); if (!m) return;
  mfConf = m; mfPendente = null;
  $("#mf-nome").textContent = m.nome;
  $("#mf-det").innerHTML = `SKU <b>${esc(m.sku || "-")}</b> · EAN <b>${esc(m.ean || "-")}</b>` + (m.codigoReal ? ` · Código salvo <b>${esc(m.codigoReal)}</b>` : "");
  $("#mf-precos").innerHTML = (m.p1 != null ? `<span class="chip">Sem clube ${brl(m.p1)}</span>` : "") + (m.p2 != null ? `<span class="chip clube">Com clube ${brl(m.p2)}</span>` : "");
  const l = lancsDe(m);
  $("#mf-lancs").innerHTML = l.length ? '<div class="dup-t"><b>Já lançado:</b></div>' + l.sort((a, b) => a.validade.localeCompare(b.validade)).map((i) =>
    `<div class="dup-item"><span>Vence em <b>${fmt(i.validade)}</b> · ${i.quantidade} un</span><button data-id="${i.id}" type="button">${ico("pencil")}Editar</button></div>`).join("") : "";
  $("#mf-lancs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { dlgMF.close(); abrirEdicao(b.dataset.id); }));
  $("#mf-salvar-box").classList.add("oculto"); $("#mf-manual").classList.add("oculto"); $("#mf-cod").value = "";
  $("#mf-limpar").classList.toggle("oculto", !m.codigoReal);
  $("#mf-acoes").classList.toggle("oculto", !!m.saiu);
  if (m.saiu) avisoMF("Este produto saiu da campanha na última planilha." + (l.length ? " Reveja o lançamento acima." : ""), "aviso");
  else if (precisaConfirmar(m)) avisoMF("No Mercafacil este produto está com EAN igual ao SKU. Bipe a embalagem: o app pergunta se quer salvar o código de barras.", "aviso");
  else avisoMF("");
  dlgMF.showModal(); icones();
  if (!m.saiu) iniciarLeitorMF();
}
function conferirCodigo(cod) {
  const m = mfConf, limpo = String(cod).replace(/\D/g, ""), c = soNum(limpo);
  if (!m || !c) return;
  if (codigosMF(m).has(c)) { dlgMF.close(); abrirLancamentoMF(m, limpo); return; }
  const outro = acharMF(limpo);
  if (outro && outro.id !== m.id) { avisoMF(`❌ Código diferente. O código ${limpo} é do produto “${outro.nome}”, não deste.`, "aviso"); return; }
  if (precisaConfirmar(m)) {
    mfPendente = limpo;
    $("#mf-salvar-txt").textContent = `Salvar o código de barras ${limpo} para “${m.nome}” (que está com EAN e SKU iguais)?`;
    $("#mf-salvar-box").classList.remove("oculto"); avisoMF(""); return;
  }
  avisoMF(`❌ Código diferente (${limpo}). Este não é o código de barras de “${m.nome}” no Mercafacil, ou o produto não está na lista.`, "aviso");
}
$("#mf-bipar").addEventListener("click", iniciarLeitorMF);
$("#mf-digitar").addEventListener("click", () => { pararLeitorMF(); $("#mf-manual").classList.remove("oculto"); $("#mf-cod").focus(); });
$("#mf-conferir").addEventListener("click", () => conferirCodigo($("#mf-cod").value));
$("#mf-cod").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); conferirCodigo($("#mf-cod").value); } });
$("#mf-nao").addEventListener("click", () => { mfPendente = null; $("#mf-salvar-box").classList.add("oculto"); iniciarLeitorMF(); });
$("#mf-sim").addEventListener("click", async () => {
  if (!mfConf || !mfPendente) return;
  try {
    await db.collection("mercafacil").doc(mfConf.id).set({ codigoReal: mfPendente }, { merge: true });
    mfConf.codigoReal = mfPendente;
    const m = mfConf, cod = mfPendente; dlgMF.close(); abrirLancamentoMF(m, cod);
  } catch (e) { alert("Erro ao salvar o código: " + e.message); }
});
$("#mf-limpar").addEventListener("click", async () => {
  if (!mfConf || !confirm("Apagar o código de barras salvo deste produto?")) return;
  try {
    await db.collection("mercafacil").doc(mfConf.id).update({ codigoReal: firebase.firestore.FieldValue.delete() });
    delete mfConf.codigoReal; abrirConferencia(mfConf.id);
  } catch (e) { alert("Erro: " + e.message); }
});
$("#mf-fechar").addEventListener("click", () => dlgMF.close());
dlgMF.addEventListener("close", pararLeitorMF);

// código conferido: abre o formulário já preenchido (falta só validade e quantidade)
function abrirLancamentoMF(m, cod) {
  limparNovo(); fecharDup(); mfAtual = m;
  $("#leitor").innerHTML = ""; $("#msg").textContent = "";
  $("#form-novo").classList.remove("oculto");
  $("#n-codigo").value = cod; $("#n-nome").value = (m.nome || "").toUpperCase();
  $("#n-p1").value = precoTexto(m.p1); $("#n-p2").value = precoTexto(m.p2);
  ultimoBuscado = cod; autoPreenchido = true;
  document.querySelector('.nav[data-aba="bipar"]').click();
  mostrarMFInfo(m);
  preencher(cod);
  $("#n-validade").focus();
}

// ----- importação da planilha -----
let importacao = null;
const setImp = (t, c) => { const el = $("#mf-import-msg"); el.textContent = t || ""; el.className = "status " + (c || "") + (t ? "" : " oculto"); };
function carregarXLSX() {
  return new Promise((ok, err) => {
    if (window.XLSX) return ok();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = ok; s.onerror = () => err(new Error("Não consegui carregar o leitor de Excel (sem internet?)."));
    document.head.appendChild(s);
  });
}
const numPreco = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : lerPreco(v));
$("#mf-escolher").addEventListener("click", () => $("#mf-arq").click());
$("#mf-arq").addEventListener("change", (ev) => { const f = ev.target.files[0]; ev.target.value = ""; if (f) lerPlanilha(f); });

async function lerPlanilha(f) {
  importacao = null; $("#mf-previa").innerHTML = ""; setImp("Lendo a planilha...");
  try {
    await carregarXLSX();
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    const h = rows.findIndex((r, i) => i < 10 && r.some((c) => norm(c) === "sku"));
    if (h < 0) throw new Error("Não achei a coluna SKU. Esta é a planilha de campanha do Mercafacil?");
    const cab = rows[h].map(norm), col = (...n) => cab.findIndex((c) => n.includes(c));
    const ix = { nome: col("nome produto", "nome do produto", "produto"), sku: col("sku"), ean: col("ean"), camp: col("nome campanha", "campanha"), p1: col("preco 1"), p2: col("preco 2") };
    const rot = { nome: "Nome produto", sku: "SKU", ean: "EAN", p1: "Preço 1", p2: "Preço 2" };
    const faltam = Object.keys(rot).filter((k) => ix[k] < 0).map((k) => rot[k]);
    if (faltam.length) throw new Error("Faltam colunas na planilha: " + faltam.join(", ") + ".");
    const mapa = new Map(); let lidas = 0, semCodigo = 0;
    rows.slice(h + 1).forEach((r) => {
      if (!r.some((c) => String(c).trim() !== "")) return;
      lidas++;
      const sku = String(r[ix.sku] ?? "").trim().replace(/\.0$/, "");
      const ean = String(r[ix.ean] ?? "").trim().replace(/\D/g, "");
      if (!sku && !ean) { semCodigo++; return; }
      const id = (sku || ean).replace(/[\/\s]/g, "_");
      mapa.set(id, { id, sku, ean, nome: String(r[ix.nome] ?? "").trim(), campanha: ix.camp >= 0 ? String(r[ix.camp] ?? "").trim() : "", p1: numPreco(r[ix.p1]), p2: numPreco(r[ix.p2]) });
    });
    if (!mapa.size) throw new Error("A planilha não tem produtos.");
    const antigos = new Map(itensMF.map((m) => [m.id, m]));
    const novos = [], iguais = [], mudou = [], voltaram = [], saiu = [];
    mapa.forEach((n) => {
      const o = antigos.get(n.id);
      if (!o) { novos.push(n); return; }
      if (o.saiu) voltaram.push(n);
      const mot = [];
      if (o.p1 !== n.p1 || o.p2 !== n.p2) mot.push(`preço ${brlN(o.p1)}/${brlN(o.p2)} → ${brlN(n.p1)}/${brlN(n.p2)}`);
      if (o.ean !== n.ean) mot.push(`EAN ${o.ean || "-"} → ${n.ean || "-"}`);
      if (mot.length) mudou.push({ n, motivo: mot.join("; ") }); else if (!o.saiu) iguais.push(n);
    });
    itensMF.filter((m) => !m.saiu && !mapa.has(m.id)).forEach((m) => saiu.push(m));
    importacao = { mapa, antigos, novos, iguais, mudou, voltaram, saiu, arquivo: f.name };
    setImp(`Planilha lida: ${lidas} linhas, ${mapa.size} produtos únicos` + (lidas - mapa.size - semCodigo > 0 ? `, ${lidas - mapa.size - semCodigo} linhas repetidas ignoradas` : "") + (semCodigo ? `, ${semCodigo} sem SKU/EAN ignoradas` : "") + ".", "ok");
    previaImport();
  } catch (e) { setImp("Erro: " + e.message, "aviso"); }
}
function previaImport() {
  const imp = importacao; if (!imp) return;
  const G = [
    ["novos", "novo(s) produto(s) adicionado(s)", "var(--ok)", (n) => n.nome],
    ["voltaram", "voltou/voltaram para a campanha", "var(--azul)", (n) => n.nome],
    ["mudou", "com mudança de preço ou código", "var(--urgente)", (x) => x.n.nome + " — " + x.motivo],
    ["saiu", "saiu/saíram da campanha", "var(--hoje)", (m) => m.nome + (lancsDe(m).length ? " (TEM LANÇAMENTO: rever)" : " (sai da lista)")]
  ];
  const mudancas = G.reduce((s, g) => s + imp[g[0]].length, 0);
  let html = G.filter((g) => imp[g[0]].length).map(([k, t, cor, f]) =>
    `<details class="pg" style="--c:${cor}" ${k === "novos" || k === "saiu" ? "open" : ""}><summary><b>${imp[k].length}</b> ${t}</summary><ul>${imp[k].map((x) => `<li>${esc(f(x))}</li>`).join("")}</ul></details>`).join("");
  html += `<p class="nota">${imp.iguais.length} produto(s) já cadastrado(s), sem mudança.</p>`;
  html += mudancas
    ? `<button id="mf-confirmar" class="btn-grande" type="button"><i data-lucide="check"></i>Confirmar importação</button><button id="mf-cancelar" class="btn-link" type="button">Cancelar</button>`
    : `<p class="status ok">Nenhuma novidade: todos os produtos já estão cadastrados.</p>`;
  $("#mf-previa").innerHTML = html; icones();
  const c = $("#mf-confirmar"); if (c) c.addEventListener("click", confirmarImportacao);
  const x = $("#mf-cancelar"); if (x) x.addEventListener("click", () => { importacao = null; $("#mf-previa").innerHTML = ""; setImp(""); });
}
async function confirmarImportacao() {
  const imp = importacao; if (!imp) return;
  if (imp.saiu.length > 5 && imp.saiu.length >= imp.antigos.size * 0.5 && !confirm(`${imp.saiu.length} produtos vão sair da campanha. Esta é mesmo a planilha da campanha certa?`)) return;
  const btn = $("#mf-confirmar"); btn.disabled = true; btn.textContent = "Importando...";
  try {
    const lote = new Date().toISOString(), ops = [], col = db.collection("mercafacil");
    const base = (n) => ({ sku: n.sku, ean: n.ean, nomeMF: n.nome, p1: n.p1, p2: n.p2, campanha: n.campanha, saiu: false, atualizadoLote: lote });
    imp.novos.forEach((n) => ops.push([col.doc(n.id), { ...base(n), nome: n.nome, criadoLote: lote }]));
    imp.mudou.concat(imp.voltaram.map((n) => ({ n }))).forEach(({ n }) => {
      const o = imp.antigos.get(n.id);
      ops.push([col.doc(n.id), { ...base(n), ...(o && o.nomeEditado ? {} : { nome: n.nome }) }]);
    });
    imp.saiu.forEach((m) => ops.push([col.doc(m.id), lancsDe(m).length ? { saiu: true, saiuLote: lote } : null]));
    const vistos = new Map(); ops.forEach(([r, d]) => { const p = vistos.get(r.path); vistos.set(r.path, [r, d === null ? null : { ...(p && p[1] ? p[1] : {}), ...d }]); });
    const final = [...vistos.values()];
    for (let i = 0; i < final.length; i += 400) {
      const b = db.batch(); final.slice(i, i + 400).forEach(([r, d]) => (d === null ? b.delete(r) : b.set(r, d, { merge: true }))); await b.commit();
    }
    await db.collection("meta").doc("mercafacil").set({ ultimoLote: lote, importadoEm: lote, importacoes: ((metaMF && metaMF.importacoes) || 0) + 1, arquivo: imp.arquivo, total: imp.mapa.size }, { merge: true });
    setImp(`✔ Importado: ${imp.novos.length} novo(s), ${imp.mudou.length} alterado(s), ${imp.voltaram.length} que voltou(aram), ${imp.saiu.length} saída(s) da campanha (${imp.saiu.filter((m) => !lancsDe(m).length).length} removida(s) da lista).`, "ok");
    importacao = null; $("#mf-previa").innerHTML = "";
  } catch (e) { setImp("Erro ao importar: " + e.message, "aviso"); btn.disabled = false; btn.textContent = "Confirmar importação"; }
}

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
icones();
