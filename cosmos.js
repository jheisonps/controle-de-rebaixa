// Ponte entre o app e o Cosmos (evita o bloqueio do navegador). Rota: /cosmos?codigo=...
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const codigo = (u.searchParams.get("codigo") || "").replace(/\D/g, "");
  const token = request.headers.get("X-Cosmos-Token") || env.COSMOS_TOKEN || "";
  const json = { "content-type": "application/json" };
  if (!codigo) return new Response('{"error":"codigo"}', { status: 400, headers: json });
  const r = await fetch("https://api.cosmos.bluesoft.com.br/gtins/" + codigo + ".json", {
    headers: { "X-Cosmos-Token": token, "User-Agent": "controle-rebaixa", "Content-Type": "application/json" }
  });
  return new Response(r.body, { status: r.status, headers: json });
}
