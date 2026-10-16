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

No painel: `1` a `7` trocam de aba (Início, Atividades, Tempo, Agentes, Tokens, Insights, Config),
`h` explica como ler a aba, `w` abre no navegador, `e` exporta, `x` limpa (aperte duas vezes em até
3 segundos), `Esc` fecha. O idioma fica em Config e em `/radar-lang`; em `auto` (o padrão) a
interface segue o idioma do sistema.

- **Início:** a aba que abre primeiro. Mostra o modelo e o nível de esforço, quanto do contexto está
  ocupado, os tokens de entrada e saída com a parte que veio do cache, o custo e quanto das janelas
  de 5 horas e semanal do plano já foi usado, com quando cada uma renova. Abaixo, uma linha por aba
  com o que ela mostra e, quando já há algo, quanto. O esforço vem da linha do `/config` que o
  guarda; se a sua versão não tiver essa linha, aparece só o modelo.

- **Atividades:** uma linha por prompt enviado. Tab ou as setas navegam e Enter abre a atividade,
  que lista cada ferramenta chamada, em ordem, inclusive as dos subagentes.
- **Tokens:** `h` explica as colunas. `novo` são os tokens de entrada que o cache não serviu, cobrados
  pelo preço cheio. `cache↓` é o que foi lido do cache e `cache↑` o que foi gravado nele. `prompt`
  é a requisição inteira e `hit%` a parte que veio do cache. Linha amarela indica provável perda de
  cache. Em **Vida do cache** aparecem a TTL, quanto tempo falta para expirar e quanto a próxima
  requisição regrava se expirar.
- **Insights:** desligados até você ligar em Config. Regras fixas leem o que o radar registrou e
  sugerem mudanças na configuração do Claude Code, cada uma com os números que a justificam: cache
  expirado depois de uma pausa (e se uma TTL de 1h compensaria), troca de modelo que perdeu o cache,
  comandos negados repetidamente (`permissions.allow` para os só de leitura, `permissions.deny` para
  os destrutivos, nunca `allow`), falhas recorrentes, comandos e buscas repetidos, ferramentas
  lentas, subagentes só de leitura fora do Haiku, contexto acima de 80%, primeira requisição grande,
  MCP sem uso ou instável. O botão `marcar aplicado` compara o número da regra por sessão antes e
  depois da mudança.
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
abre sozinho. As mesmas cinco áreas, com busca, filtros, tabelas ordenáveis, gráficos e um painel
de detalhes.

O servidor escuta só em `127.0.0.1`, em porta escolhida pelo sistema, exige um token aleatório e
não carrega nada de fora. Ele termina com `/radar-web stop`, quando o Claude Code fecha, e sozinho
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
