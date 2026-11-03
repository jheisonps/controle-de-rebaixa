# Controle de Rebaixa — como colocar para funcionar

## 1. Criar o novo Firebase (grátis)
1. Acesse https://console.firebase.google.com com sua conta Google.
2. Clique em **Criar um projeto**, dê um nome (ex: `rebaixa`), pode desativar o Google Analytics, e clique em **Criar projeto**.
3. Na tela inicial do projeto, clique no ícone **</>** (Web). Dê um apelido (ex: `rebaixa-web`) e clique em **Registrar app**. NÃO precisa marcar Hosting.
4. Vai aparecer um código com `const firebaseConfig = { apiKey: "...", ... }`. Copie cada valor.
5. Abra o arquivo **firebase-config.js** (Bloco de Notas serve) e troque cada `COLE_AQUI` pelo valor correspondente. Salve.

## 2. Ativar o banco de dados
1. No menu esquerdo: **Compilação > Firestore Database > Criar banco de dados**.
2. Escolha o local `southamerica-east1` (São Paulo) e clique em **Avançar**.
3. Escolha **Iniciar no modo de produção** e clique em **Criar**.
4. Aba **Regras**: apague tudo, cole o texto abaixo e clique em **Publicar**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
(Sem login, o banco fica aberto para quem tiver o link do app. Não divulgue o link fora da loja.)

## 3. Hospedar (sem terminal, grátis)
Cloudflare Pages:
1. https://dash.cloudflare.com > **Workers & Pages** > **Create** > **Pages** > **Upload assets**.
2. Dê um nome e arraste os ARQUIVOS soltos (index.html, app.js, style.css, etc.), ou o .zip. O `index.html` precisa ficar na raiz, não dentro de uma pasta.
3. Clique em **Deploy**. Ele gera um link `https://seu-projeto.pages.dev`.

(Netlify também serve: https://app.netlify.com, arrastar para "deploy manual".)

## 4. Instalar no celular
Abra o link no Chrome, toque no menu (⋮) > **Adicionar à tela inicial**.

## 5. Avisos
- Aba **Avisos**: salve o número do WhatsApp e toque em **Ativar notificações**.
- Ao abrir o app com produto vencendo em até 3 dias, aparece a faixa vermelha e toca o alerta sonoro.
- O botão **WhatsApp** abre a conversa com a mensagem pronta; você só toca em enviar.
- O envio 100% automático (sem abrir o app) exige um servidor pago, por isso não está incluído.

## Se editar os arquivos depois
Aumente o número da versão no topo do `service-worker.js` (v1 para v2) e publique de novo.
