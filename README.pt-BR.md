# Session Radar

Um mod para o **Claude Code** que mostra o que o agente está fazendo enquanto faz: cada chamada de
ferramenta, cada subagente, cada chamada MCP e web e cada requisição ao modelo, com tokens, cache e
tempo.

Guia curto. O [README.md](./README.md) em inglês é o documento de referência.

> **Isto é um mod, ou seja, é código.** Ele roda dentro do Claude Code com as suas permissões e vê
> todo prompt e toda chamada de ferramenta da sessão. Não envia nada para fora da sua máquina e não
> chama nenhum modelo; o único arquivo que grava é o export: quando você pede com `/radar-export`, ou
> ao fim de cada atividade, se você ligar isso. Entre sessões
> guarda o idioma e as configurações e, só se você ligar os insights, contagens por projeto, sem
> prompts nem argumentos. As notificações ficam desligadas até você ligar. A visão no navegador,
> quando você a abre, é servida só em `127.0.0.1`, protegida por um token aleatório. O
> [SECURITY.md](./SECURITY.md) lista exatamente o que ele chama.

## Requisitos

Claude Code **2.1.287 ou mais recente** (`claude --version`). O painel aparece no terminal e na aba
Code do app Desktop.

## Instalar

```
/plugin marketplace add NeuralSeam/ns-session-radar
/plugin install session-radar@ns-session-radar
```

Se aparecer `Run /reload-plugins to activate.`, rode esse comando. O `/plugin` deve mostrar
`1 mod active · session-radar`.

Para testar sem instalar: clone este repositório e rode `claude --plugin-dir ./ns-session-radar`.

## Usar

| Comando | O que faz |
| --- | --- |
| `/radar` | Abre ou fecha o painel, mesmo com o Claude trabalhando |
| `/radar-export` | Grava tudo em `session-radar-<data>.json` na pasta atual |
| `/radar-lang pt\|en\|auto` | Define o idioma e o mantém nas próximas sessões |
| `/radar-web` | Abre o radar no navegador; `/radar-web stop` encerra |
| `/radar-config` | Abre o painel na aba Config |
| `/session-radar:radar-review` | A análise com IA de um export. Usa tokens |

O radar tem dois lugares. **O painel no terminal** fica com o que se lê num relance ou pede ação
agora: Início, Atividades, Insights e Config. **O navegador** (`w` ou `/radar-web`) acrescenta o que
precisa de espaço: linha do tempo, agentes, cada requisição com o cache, gráficos e a memória da
máquina.

No painel: `1` a `4` trocam de aba (Início, Atividades, Insights, Config), `h` explica como ler a
aba, `w` abre no navegador, `e` exporta, `x` limpa (aperte duas vezes em até 3 segundos), `d` move
o radar para baixo do transcript ou de volta para a lateral, `Esc` fecha.

**Na lateral ou abaixo**, como o DevTools: `d`, ou *Posição do radar* em Config, que fica para as
próximas sessões. Na lateral o radar é um painel, que o Claude Code encaixa ao lado do transcript em
tela cheia a partir de 110 colunas e, fora isso, acima do prompt. Abaixo, ele ocupa a faixa acima do
prompt, compacto: abas e ações numa linha quando cabem, Início e Config em duas colunas num terminal
largo, sem notas nem linhas em branco, numa moldura arredondada na cor do crachá que a separa do
transcript (a partir de 8 linhas; abaixo disso as linhas ficam para o radar). A faixa recebe as teclas depois de `ctrl+x tab` ou de um
clique, `q` fecha, e uma pesquisa do Claude Code tem a vez na faixa. Um mod não posiciona o painel
sozinho, então não há lado esquerdo. O idioma fica em Config e em `/radar-lang`; em `auto` (o padrão) a interface segue o idioma
do sistema.

- **Início:** a aba que abre primeiro. Mostra o modelo e o nível de esforço, quanto do contexto está
  ocupado, os tokens de entrada e saída com a parte que veio do cache, o custo, quanto das janelas
  de 5 horas e semanal do plano já foi usado, com quando cada uma renova, e quando o cache da sessão
  principal expira. Abaixo, uma linha por aba e o que só o navegador mostra, com quanto há de cada
  coisa. O esforço vem da linha do `/config` que o guarda; se a sua versão não tiver essa linha,
  aparece só o modelo.
- **Atividades:** uma linha por prompt enviado. Tab ou as setas navegam e Enter abre a atividade,
  que lista cada ferramenta chamada, em ordem, inclusive as dos subagentes.
- **Insights:** desligados até você ligar em Config. Regras fixas leem o que o radar registrou e
  sugerem mudanças na configuração do Claude Code, cada uma com os números que a justificam: cache
  expirado depois de uma pausa (e se uma TTL de 1h compensaria), troca de modelo que perdeu o cache,
  comandos negados repetidamente (`permissions.allow` para os só de leitura, `permissions.deny` para
  os destrutivos, nunca `allow`), falhas recorrentes, comandos e buscas repetidos, ferramentas
  lentas, subagentes só de leitura fora do Haiku, contexto acima de 80%, primeira requisição grande,
  MCP sem uso ou instável. O botão `marcar aplicado` compara o número da regra por sessão antes e
  depois da mudança. O navegador mostra os mesmos achados e comparações, só para leitura: marcar é
  no painel.
- **Config:** tudo o que notifica ou guarda dados começa desligado. Tab ou as setas navegam e Enter
  muda a linha.
  - *Avisar quando uma atividade terminar*, só se levou pelo menos 15 s, 30 s, 1 min ou 2 min.
    A notificação traz o número, a duração, as ferramentas, as falhas e quando o cache expira; nunca
    o prompt.
  - *Avisar antes de o cache expirar*: um aviso por entrada de cache, de 30 s a 5 min antes, enquanto
    nada está rodando. TTL desconhecida conta como 5 minutos, e o texto diz isso.
  - *Insights, com histórico por projeto*: guarda, por pasta de projeto, contagens das últimas 30
    sessões em até 20 projetos, sem prompts e sem argumentos, e lê do `.mcp.json` só os nomes dos
    servidores.
  - *Sugerir a análise com IA*, *Apagar o histórico guardado* e o idioma.
  - *Salvar o export automaticamente quando uma atividade terminar*: grava o export sem perguntar,
    um `session-radar-<início>.json` por conversa na pasta atual, regravado a cada atividade com a
    conversa inteira, pronto para a [análise com IA](#análise-com-ia). Ponha `session-radar-*.json`
    no seu `.gitignore`.

  - *Sempre mostrar o crachá desta sessão*, abaixo do prompt (veja abaixo).

  As notificações usam o canal de notificação do Claude Code (`preferredNotifChannel`).

No navegador, `1` a `6` trocam a visão; as três primeiras são as mesmas do painel.

- **Início:** os cards da sessão e a **memória da máquina**: quanto está em uso, de quanto, e um
  gráfico dos últimos 10 minutos. Abaixo, chamadas por tipo, duração de cada atividade e tempo por
  ferramenta. A memória é lida pelo próprio servidor do navegador, a cada 2 segundos, dos totais do
  sistema operacional: sem lista de processos e sem comandos. No macOS a memória em cache conta como
  usada, então a livre parece menor do que é.
- **Atividades** e **Insights:** como no painel, com filtros e busca.
- **Tempo:** a linha do tempo, uma linha por chamada, com janela de 15, 5 ou 1 minuto.
- **Agentes:** a árvore da sessão principal e dos subagentes.
- **Tokens:** contexto, custo, limites, cache, a vida do cache de cada loop, um gráfico do prompt por
  requisição e a tabela de todas elas. `O que significa cada coluna` explica: `Novo` são os tokens
  de entrada que o cache não serviu, cobrados pelo preço cheio; `Cache↓` é o que foi lido do cache e
  `Cache↑` o que foi gravado nele; `Prompt` é a requisição inteira e `Acerto` a parte que veio do
  cache. Linha destacada indica provável perda de cache.

Sem Node, ou sem navegador na mesma máquina (SSH puro, alguns containers), a linha do tempo, os
agentes e os tokens continuam no export (`/radar-export`).

## Várias sessões ao mesmo tempo

Cada sessão tem um crachá: uma marca e um código de quatro letras, como `▲ K7QF`, numa de quatro
cores, calculados a partir do id da sessão. O crachá não muda quando o mod recarrega e é diferente
de uma sessão para outra. Enquanto o radar no navegador roda, ele aparece abaixo do prompt do
terminal da sessão (`▲ radar K7QF`), e o mesmo crachá aparece na página:

- no título da aba, `▲ K7QF · meu-app · Session Radar`, e no ícone, a marca na cor da sessão;
- numa faixa dessa cor no topo, e no cabeçalho com a pasta do projeto e o modelo; passe o mouse
  para ver o caminho completo;
- quando a sessão ou o servidor termina, o título vira `✕ K7QF · encerrada` e o ícone fica cinza,
  para você saber quais abas pode fechar.

A linha de status do painel também começa com o crachá. Para mantê-lo abaixo do prompt mesmo com o
navegador fechado, ligue *Sempre mostrar o crachá desta sessão* em Config.

## Análise com IA

O plugin traz a skill `/session-radar:radar-review`. Exporte (`e`), ou ligue *Salvar o export
automaticamente* em Config, e rode a skill: o Claude, na sua
sessão e com as suas permissões, lê o export mais recente, o CLAUDE.md, as chaves `permissions`,
`model` e `hooks` das configurações e o `.mcp.json`, e propõe mudanças em forma de diff, cada uma com
a evidência e a métrica do radar que deve mudar. Também agrupa os prompts em tarefas recorrentes,
aponta onde o CLAUDE.md e o que aconteceu discordam e dá hipóteses para falhas recorrentes. Não
aplica nada sem perguntar. **Usa tokens** da sessão atual; o mod continua sem chamar nenhum modelo.

## No navegador

O Claude Code não desenha uma página web dentro do terminal, então a visão completa abre no seu
navegador. Aperte `w` no painel (o `/radar` já abre com o foco nele) ou rode `/radar-web`: o mod
inicia um servidor pequeno (`web/server.mjs`, Node 20+ no `PATH`, sem dependências) e o navegador
abre sozinho. São seis visões (veja acima), com busca, filtros, tabelas ordenáveis, gráficos e um
painel de detalhes. A página só lê: Config e `marcar aplicado` ficam no painel.

O servidor escuta só em `127.0.0.1`, em porta escolhida pelo sistema, exige um token aleatório e
não carrega nada de fora. Guarda em memória só o último envio do mod e os últimos 10 minutos de
leituras de memória. Ele termina com `/radar-web stop`, quando o Claude Code fecha, e sozinho
30 segundos depois que o mod para de enviar. O `w` funciona com o painel em foco, não enquanto você
digita no prompt. Sem Node, o `/radar-web` avisa e o resto continua funcionando.

## Desinstalar

```
/plugin uninstall session-radar@ns-session-radar
```

Problemas e dúvidas: [issues](https://github.com/NeuralSeam/ns-session-radar/issues).

## Licença

Apache-2.0: veja o [LICENSE](./LICENSE) e o [NOTICE](./NOTICE). A versão 0.2.0,
[publicada neste repositório](https://github.com/NeuralSeam/ns-session-radar/tree/e6d2d1cb3c06110318a949bdae909489040e8d51)
antes da mudança, continua disponível sob MIT. A licença não concede direitos sobre o nome e o logo da
Neural Seam; veja o [TRADEMARKS.md](./TRADEMARKS.md).

O Session Radar é uma extensão independente para o Claude Code. Não é feito nem endossado pela
Anthropic.

## Créditos e forks

Você pode redistribuir o Session Radar ou criar projetos derivados dele. Se fizer isso:

- Mantenha os arquivos [LICENSE](./LICENSE) e [NOTICE](./NOTICE) e preserve o crédito à Neural Seam.
- Dê ao projeto derivado um nome próprio; o [TRADEMARKS.md](./TRADEMARKS.md) diz o que é permitido.
- [Abra uma issue](https://github.com/NeuralSeam/ns-session-radar/issues) para ter o seu projeto
  listado como derivado.
