# Alertas automáticos de vencimento — passo a passo

O app avisa no celular nos horários que você escolher (9h, 12h30 e 18h, por exemplo), mesmo fechado.
Para isso existe um "despertador" gratuito na Cloudflare (o arquivo `worker-alerta.js`). Ele não gasta nada
e não pede cartão. Os nomes dos menus da Cloudflare podem estar um pouco diferentes do que está escrito aqui;
procure pelo nome mais parecido.

## Parte A — Publicar o app atualizado
1. Suba os 4 arquivos novos no seu Cloudflare Pages, como você já faz: `index.html`, `app.js`, `style.css` e `service-worker.js`.
2. Não suba o `worker-alerta.js` nem o `chaves-vapid.txt` junto com o app. Eles são só para a Parte B.

## Parte B — Criar o despertador na Cloudflare
1. Abra https://dash.cloudflare.com e entre na mesma conta que você usa para o app.
2. No menu da esquerda, clique em **Workers & Pages** (ou **Compute / Workers**).
3. Clique em **Create** (Criar) e depois em **Create Worker** (Criar Worker).
4. Em "Name", escreva `alerta-vencimento` e clique em **Deploy**.
5. Quando abrir a tela de sucesso, clique em **Edit code** (Editar código).
6. Dentro do editor, apague todo o texto que está lá.
7. Abra o arquivo `worker-alerta.js` (pode ser no Bloco de Notas), copie tudo e cole no editor.
8. Clique em **Deploy** (canto superior direito) e confirme.
9. Volte para a página do Worker e abra a aba **Settings** (Configurações).
10. Procure **Variables and Secrets** (Variáveis e segredos) e clique em **Add** (Adicionar). Crie estas 5 variáveis, uma de cada vez:

| Nome | Tipo | Valor |
|---|---|---|
| `FIREBASE_PROJECT` | Texto | o `projectId` do seu arquivo `firebase-config.js` |
| `FIREBASE_API_KEY` | Texto | o `apiKey` do seu arquivo `firebase-config.js` |
| `VAPID_PUBLICA` | Texto | a chave pública que está no `chaves-vapid.txt` |
| `VAPID_PRIVADA` | **Segredo (Secret)** | a chave privada que está no `chaves-vapid.txt` |
| `VAPID_CONTATO` | Texto (opcional) | `mailto:seu-email@exemplo.com` |

11. Clique em **Deploy** (ou **Save and deploy**) para salvar.
12. Ainda em **Settings**, procure **Trigger Events** (Eventos de gatilho) e depois **Cron Triggers**. Clique em **Add** (Adicionar).
13. Em "Cron expression" escreva exatamente: `*/5 * * * *` e salve.
    (Isso faz o despertador olhar a hora a cada 5 minutos. O plano gratuito permite isso.)

## Parte C — Ativar no celular
1. No Android, abra o app instalado (o ícone na tela inicial). Se ainda não instalou, instale pelo botão "Instalar".
2. Abra a aba **Avisos**.
3. Confira os 3 horários e o campo "Avisar quando faltar até" (o padrão é 3 dias). Deixe um horário vazio para desligar aquele horário.
4. Toque em **Ativar alertas neste celular** e, quando o celular perguntar, toque em **Permitir**.
5. Toque em **Testar alerta agora** para ouvir como o aviso chega.

## Parte D — Testar o envio de verdade (pela Cloudflare)
1. Lance um produto que vença em até 3 dias (ou use um que já exista).
2. Na página do Worker na Cloudflare, procure o endereço dele (algo como `https://alerta-vencimento.SEU-NOME.workers.dev`).
3. Abra esse endereço no navegador do computador e acrescente `/teste` no final.
4. A página mostra um resultado:
   - `alerta enviado` e `enviado`: deu certo, o celular deve tocar.
   - `nenhum celular ativado`: faça a Parte C.
   - `nada vencendo`: não há produto dentro do prazo.
   - Erro de Firestore: confira `FIREBASE_PROJECT` e `FIREBASE_API_KEY`.

## Parte E — Deixar o aviso forte no Android
O app pede som, vibração e que o aviso fique na tela até você tocar. Quem decide o volume e o pop-up é o
Android, então faça uma vez:
1. Configurações do celular > **Apps** > procure **Controle de Rebaixa** (se não aparecer, procure o **Chrome**).
2. Toque em **Notificações** e deixe tudo ativado.
3. Abra a categoria do app e escolha importância **Urgente / Alerta** (som e pop-up na tela).
4. Se quiser que toque mesmo no "Não perturbe", ative a opção de substituir o Não perturbe.
5. Em **Bateria** do app, escolha **Sem restrições** (ou "Não otimizar"), para o celular não segurar o aviso.
6. Deixe o volume de notificações do celular alto.

## Como funciona (resumo)
- A cada 5 minutos a Cloudflare vê se chegou a hora de um alerta (horário de Brasília).
- Se chegou, ela confere o banco do app. Se não há produto vencendo no prazo, não manda nada.
  Se há, manda o aviso para os celulares ativados.
- No horário seguinte ela confere de novo: o que já foi resolvido (excluído ou zerado) deixa de aparecer.
- Mudar os horários ou os dias na aba **Avisos** vale na hora, para todos os celulares.
- Cada celular ativado aparece na lista automaticamente. Para parar de receber num celular, use **Desativar neste celular**.
- Para parar tudo, apague o Cron Trigger no Worker.

## Limites
- Funciona no Android com o app instalado. No iPhone (iOS 16.4 ou mais novo, com o app na tela inicial) pode chegar sem som ou vibração.
- O aviso é uma notificação do celular, não uma tela cheia como despertador.
- O horário pode atrasar alguns minutos (a Cloudflare olha a cada 5 minutos, com tolerância de 10).
