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

## 5. Alerta de vencimento
- Ao abrir o app com produto vencendo em até 3 dias, aparece a faixa vermelha no topo do Painel e toca o alerta sonoro. O botão **Tocar alerta** repete o som.
- Os alertas automáticos, o aviso por WhatsApp e as notificações do celular foram removidos.

## 6. Excluir e selecionar vários (Painel e Mercafacil)
- Toque longo em um produto (ou no botão de seleção ao lado da busca) liga a seleção. Depois toque nos outros produtos e use **Excluir**. **Todos** marca tudo o que está na tela (respeita filtro, seção e busca).
- Painel: o que for excluído fica 24 h no histórico para restaurar.
- Mercafacil: a lista de "Falta lançar" é a visão padrão; os já lançados ficam escondidos no ícone verde **Lançados**. Excluir daqui tira o produto da lista importada (para voltar, importe a planilha de novo).

## 7. Importar planilha e validade rápida
- Aba Mercafacil: há um botão só, **Importar planilha**. O app descobre sozinho se é a de produtos ou a de fotos. Comece pela de produtos.
- Validade: digite só dia e mês (`1512` vira 15/12 com o ano completado) ou a data inteira. Se a data já passou, o app assume o ano que vem; para produto já vencido, digite o ano (ex.: 101126).

## 8. Marcas da vistoria: Falta placa e Acabou
- O app não conversa com o site do Mercafacil; as marcas servem de lista para você.
- **Falta placa**: botão em cada produto da aba Mercafacil (e dentro do produto no Painel). O quadradinho laranja "Falta placa" mostra só os que estão sem placa. Ao colocar a placa, toque no botão de novo para desmarcar.
- **Acabou**: o produto vai para o quadradinho cinza "Acabou" e o lançamento dele sai do Painel (fica 24 h no histórico). No fim da vistoria, desative esses produtos no site e depois selecione todos em "Acabou" e exclua.
- As marcas continuam quando você importa uma planilha nova.

## Se editar os arquivos depois
Aumente o número da versão no topo do `service-worker.js` (v1 para v2) e publique de novo.
