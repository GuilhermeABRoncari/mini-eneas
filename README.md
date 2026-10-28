# Mini Enéas — protótipo 0.2.0

Assistente visual em forma de caricatura 3D, com proporções de boneco colecionável. Projeto pessoal independente do Necso DevStack; possui suas próprias dependências e não usa os scripts, bancos ou configurações dele.

## O que já funciona

- Modelo 3D original gerado por código: cabeça grande, óculos, barba e terno.
- Articulação por hierarquia de objetos, cinco clipes de animação, estado neutro e tontura procedural.
- Aceno, reflexão, reclamação, fala visual e sono; respiração, piscar e acompanhamento do cursor dentro da área 3D.
- Clique no personagem ou botão Cutucar; três cutucadas em até 2,5 segundos provocam uma reclamação.
- Conversa por Ollama local ou OpenAI Responses, com streaming, cancelamento e contexto recente em memória.
- Modo de demonstração sem provedor e temperamento configurável: calmo, dramático ou impaciente de brincadeira.
- Giro, tamanho e modo sossego com preferências locais.
- Exportação GLB com os cinco clipes; pode ser aberto em ferramentas compatíveis com glTF 2.0.
- Aplicativo Electron com fundo transparente, barra para arrastar, minimizar, encerrar e menu de bandeja quando suportado pelo sistema.
- Modo estúdio para inspecionar o personagem e suas reações.

**A integração de IA está pronta para configuração pelo usuário; nenhum provedor foi ativado durante o desenvolvimento.** Voz, Telegram e MCP continuam pendentes. O aplicativo não executa comandos nem envia mensagens a contatos; responde somente na conversa local da interface quando o usuário envia uma pergunta.

## Ver as prévias sem iniciar o aplicativo

- [Estúdio](previews/mini-eneas-estudio.png)
- [Sete estados do personagem](previews/reacoes.png)
- [Layout de desktop com transparência](previews/mini-eneas-desktop.png)
- [Modelo GLB com animações](previews/mini-eneas-prototipo.glb)
- [Conversa com servidor fictício de teste](previews/conversa-ia-teste.png)

As imagens foram geradas automaticamente em Chromium headless. O GLB foi exportado e reimportado pelo GLTFLoader para verificar integridade e presença das animações.

## Iniciar manualmente

Requer Git, Node.js 22.12 ou superior, npm e acesso à internet para instalar dependências e o Electron. O repositório é privado; use uma conta GitHub com acesso.

Para obter o projeto em outra máquina:

```bash
git clone https://github.com/GuilhermeABRoncari/mini-eneas.git
cd mini-eneas
npm ci
npm start
```

Se a pasta já estiver clonada e as dependências instaladas:

```bash
cd mini-eneas
npm start
```

Esse comando **abre uma janela**. Para abrir o estúdio em vez do mascote compacto:

```bash
npm start -- --studio
```

Segure a barra superior para mover a janela. Clique em **Opções** para abrir os controles no modo compacto. O botão − minimiza; × encerra o processo. A interface permanece acessível pela barra do sistema se a bandeja não estiver disponível.

## Desenvolvimento em segundo plano

```bash
npm run typecheck
npm test
npm run build
npm run test:visual
npm run test:chat
```

Esses comandos não abrem janelas no desktop. O teste visual usa Chrome em modo headless, WebGL por software, DISPLAY/WAYLAND_DISPLAY vazios e um servidor HTTP temporário em loopback com porta aleatória. Ele encerra navegador e servidor ao terminar. `CHROME_PATH` permite escolher o executável; o padrão nesta máquina é `/usr/bin/google-chrome`.

O teste visual verifica renderização, reações, sono/acordar, conversa local sem injeção HTML, persistência das preferências, modo compacto e exportação/reimportação GLB. Gera novamente as imagens em `previews/`.

## Estrutura

- `src/model.ts`: construção do boneco e clipes exportáveis.
- `src/behavior.ts`: estados, respostas locais e janelas de tempo das cutucadas.
- `src/render-loop.ts`: agendamento por estado, pausa e resposta imediata às interações.
- `src/main.ts`: cena, interface, animação e exportação.
- `src/chat-ui.ts`: conversa e configuração do provedor.
- `src/ai/`: contratos, streaming, histórico da sessão e armazenamento da configuração.
- `desktop/`: processo Electron e ponte IPC restrita.
- `scripts/`: compilação e validação visual headless.
- `tests/`: testes de comportamento e integridade dos clipes.

Three.js + TypeScript no primeiro protótipo; a interface usa DOM/CSS diretamente, sem React, para manter a base pequena. Não depende de Blender ou Live2D. O modelo usa objetos articulados, não uma malha com esqueleto humanoide ou morph targets.

## Dados e limites atuais

As preferências de aparência ficam no armazenamento local do aplicativo; a posição solicitada da janela fica em `window.json` no perfil `mini-eneas` do sistema. Conversas e contexto ficam somente na memória da sessão, sem gravação em disco pelo aplicativo. Configurações do provedor ficam em `ai.json`, incluindo somente a chave cifrada quando o usuário opta por lembrar e existe chaveiro seguro disponível. Nenhum token ou serviço real foi configurado durante o desenvolvimento.

A animação busca 30 FPS durante reações, 12 FPS em repouso e 4 FPS durante o sono. Interações solicitam um frame imediato. A renderização e seus agendamentos param quando o documento está oculto. O modelo tem 14.660 triângulos e 25 chamadas de desenho no enquadramento padrão. A resolução interna fica limitada a 1×, inclusive em telas HiDPI; isso reduz o custo, com menor nitidez nessas telas. Usa materiais Lambert no desktop e materiais PBR compatíveis no GLB exportado. Desempenho com GPU real ainda precisa ser medido.

A versão 0.1.1 também remove a preservação do buffer entre quadros, agrupa peças rígidas sem juntar articulações independentes e reindexa vértices. [Medições antes/depois](PERFORMANCE.md).

O desenvolvimento e os testes foram feitos sem abrir o Electron no desktop. O usuário testou o protótipo no seu desktop e aprovou a aparência/interação. Transparência, arraste, foco, bandeja e posicionamento não tiveram uma matriz completa de homologação; **Omarchy/Hyprland continua pendente**. As capturas comprovam o conteúdo 3D e o layout, não a integração com o compositor. A janela ainda tem uma área retangular de interação; passagem de cliques pelas áreas vazias não está implementada.

O desenho é uma primeira caricatura e pode ser refinado. As falas são fictícias, não citações históricas. Não há empacotamento para distribuição, publicação ou licença de distribuição definida nesta etapa.

## Próximos passos

1. Homologar o provedor/modelo escolhido pelo usuário; não há teste de inferência real feito nesta etapa.
2. Ampliar personalidade, memória explícita e iniciativa controlada.
3. Telegram, voz e refinamento das animações.
4. Homologar Omarchy/Hyprland.
5. Conectar ao DevStack por MCP como etapa final.

O planejamento detalhado está no documento `planejamento-mini-eneas.md` mantido no diretório de trabalho do usuário. Não é necessário para executar este projeto; a pasta pode ser transferida separadamente e instalada pelo próprio lockfile.


## Aplicar uma atualização

Encerre a instância anterior pelo botão × e execute `npm start` novamente nesta pasta. Minimizar não encerra; iniciar outra instância enquanto a antiga estiver aberta apenas traz a antiga para frente.

O teste de performance pode ser repetido com `npm run test:performance`. Ele usa renderização por software em modo headless e grava `previews/performance-after.json`; não abre janelas. Resultados variam com a carga do sistema e não representam FPS do desktop.


## Gestos do mouse — 0.1.2

Com o ponteiro sobre a área 3D do personagem:

| Gesto | Efeito | Reação ao exagero |
|---|---|---|
| Rodinha | Rotação horizontal livre, em ambos os sentidos, por quantas voltas quiser | Dois giros acumulados em até 4 segundos provocam tontura |
| Ctrl + rodinha para cima | Aumenta o boneco | Alternar entre aumentar e diminuir repetidamente provoca reclamação |
| Ctrl + rodinha para baixo | Diminui o boneco | Mesma reação acima |

O tamanho varia de 65% a 125%; a posição é compensada para manter o boneco no enquadramento. Os controles no painel acompanham os gestos e permitem rotação completa de 0° a 360°. Orientação e tamanho ficam salvos, com gravação agrupada para não escrever em disco a cada evento da rodinha. Fora da área 3D, a rolagem continua normal.

Tontura: cabeça e corpo oscilam, olhos semicerrados e estrelas acima da cabeça. Reclamação por tamanho: exige ao menos duas inversões de direção e mudança acumulada de 35 pontos percentuais em 4 segundos. Eventos que insistem nos limites não contam. Ambas as reações duram 4 segundos, com intervalo mínimo de 4,5 segundos entre disparos do mesmo tipo; os gestos continuam funcionando durante a reação.

A tontura é gerada em tempo real e não acrescenta um sexto clipe ao GLB. O modelo continua com 14.660 triângulos, 25 chamadas de desenho e cinco clipes exportáveis. Não houve nova dependência.

Validação da 0.1.2: 13 testes unitários/modelo/agendamento, TypeScript e integração visual headless. O teste usa rodinha real via Playwright com a tecla Control, verifica que o zoom da interface não muda, testa giro excessivo, alternância de tamanho, recuperação e persistência da orientação completa. Nenhuma janela foi aberta.


## Conversa com IA — 0.2.0

Depois de encerrar a versão anterior pelo × e iniciar com `npm start`, abra **Opções → Configurar conversa com IA**.

1. Escolha **Ollama · servidor local** ou **OpenAI · API**. O padrão permanece Demonstração, sem conexão automática.
2. Informe o nome de um modelo de texto que você já tenha disponível. Para Ollama, mantenha o endereço padrão ou informe outro endereço de loopback/porta. Não são aceitos servidores Ollama fora desta máquina nesta versão.
3. Na OpenAI, informe sua própria chave de API. Ela não é preenchida automaticamente a partir do ambiente nem da assinatura de chat. O uso pode ter cobrança da conta do provedor.
4. Se desejar consultar os nomes disponíveis, aplique a configuração e clique em **Listar modelos**; escolha um nome sugerido e aplique novamente. A listagem não gera texto nem comprova que todo modelo listado aceita Responses/conversa.
5. Escolha o temperamento e clique em **Aplicar configuração**. Isso limpa o contexto da conversa anterior.
6. Envie a pergunta na interface. O boneco pensa e depois acompanha a resposta em texto. **Interromper** cancela a solicitação; **Limpar conversa** apaga o contexto da sessão.

O Ollama precisa estar instalado e com modelo disponível; o aplicativo não instala serviços nem baixa modelos. Inferência local pode consumir CPU/GPU e RAM consideráveis além do boneco 3D. O aplicativo limita a geração e pede keep-alive de 30 segundos ao Ollama, sem controlar outros clientes ou processos dele. A execução local ou remota do modelo depende da configuração do próprio servidor Ollama.

### Dados enviados e limites

A solicitação inclui a pergunta, instruções da caricatura e até seis turnos completos recentes, também limitados por tamanho. Não inclui tela, arquivos, inventário de scripts ou conversas do Telegram. Conteúdo é exibido como texto, sem HTML executável. O backend é responsável pelo histórico; o renderer não fornece mensagens de sistema nem ferramentas.

O endpoint OpenAI é fixo em `https://api.openai.com/v1/responses`, com `store: false` e streaming SSE. Isso desabilita o armazenamento da resposta nessa API; não equivale a uma promessa sobre todos os registros/retenções do provedor. Ollama usa `/api/chat` com NDJSON. Não há ferramentas, execução de comandos, voz ou acesso autônomo a outras aplicações nesta etapa.

Limites: uma geração por vez, 2.000 caracteres por pergunta, 12.000 caracteres de resposta, até dois minutos por solicitação e limite de saída do modelo (OpenAI: 1.024 tokens; Ollama: 512 tokens previstos, contexto 4.096). Respostas incompletas, com erro ou canceladas não entram no contexto seguinte. O trecho parcial permanece identificado na interface até limpar ou encerrar. O balão mostra um resumo visual de até 240 caracteres; o texto completo fica no painel.

### Chave e perfil

A chave é digitada em campo de senha e o campo é limpo após aplicar. As APIs da interface recebem apenas a indicação de chave configurada, nunca a chave salva. Não há captura de chaves existentes no computador, logs de prompts ou registro de cabeçalhos.

Por padrão, a chave fica apenas na memória do processo. **Lembrar chave** usa o chaveiro do sistema quando disponível; no Linux, o backend `basic_text` é recusado. Sem backend seguro, a configuração avisa e a chave permanece apenas nesta sessão. **Esquecer chave** remove a chave da sessão e do arquivo salvo. `ai.json` é gravado com permissão 0600 e substituição atômica; não deve ser distribuído junto ao projeto.

A ponte Electron mantém os pedidos no processo principal, com IPC restrito à janela principal. O renderer continua sem Node e com `connect-src 'none'`. A implementação usa as operações síncronas verificáveis do safeStorage no Electron 45 fixado; elas estão depreciadas e devem ser revistas antes de atualizar para Electron 46. Nenhum fallback para cifragem em texto básico foi habilitado.

### Validação e próximos testes

24 testes unitários/integração cobrem os protocolos fragmentados em UTF-8, erros, EOF prematuro, limites, chave com proteção simulada, ausência de chaveiro, histórico, concorrência, cancelamento e timeout, além dos testes anteriores do modelo e gestos.

`npm run test:chat` testa a interface headless contra o serviço real e um servidor HTTP fictício local, incluindo resposta parcial, cancelamento real da conexão, erros, limpeza, chave apenas na sessão e ausência de HTML executável. `npm run test:visual` continua verificando modelo, gestos e orçamento de renderização. A ponte nativa do Electron e o chaveiro real ainda precisam de homologação no desktop; os testes não abriram o aplicativo nem acessaram o chaveiro.

Nenhuma chave real ou provedor de inferência real foi usado. A prévia `conversa-ia-teste.png` mostra dados fictícios e não comprova inferência de um modelo. Não houve nova dependência, instalação de Ollama, download de modelo ou publicação.

Referências: [OpenAI Docs — streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Responses e store](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Ollama chat](https://docs.ollama.com/api/chat), [Ollama modelos](https://docs.ollama.com/api/tags), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
