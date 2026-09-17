# Omahold

**Uma fortaleza anã miniatura que mora dentro do omarchy-shell.** · by ZeD

![O painel do Omahold: mapa de um nível, barra lateral e crônica](preview.png)

Um plugin do Omarchy: um mundo de 48×30 células com 8 níveis de profundidade
(z-levels), sete anões com fome, sede, sono, humor e ofícios, escavação,
lavoura, cervejaria, artesanato, humores estranhos e artefatos, migrantes,
caravanas, emboscadas de goblins, lobos no inverno, kobolds ladrões,
inundações e magma. Tudo desenhado com as cores do tema ativo — trocar o
tema veste a fortaleza de outro clima.

Enquanto você trabalha, o mundo anda devagar (um dia de fortaleza a cada
poucos minutos). Quando você abre o painel, corre a quatro ticks por segundo.
Nada é desenhado sem uma janela visível, e um tick custa uma fração de
milissegundo num MacBook de 2014.

```
omarchy plugin add https://github.com/zednaked/omahold.git --enable
# ou, à mão:
cp -r . ~/.config/omarchy/plugins/zed.omahold && omarchy-shell shell rescanPlugins && omarchy plugin enable zed.omahold
```

## Três superfícies

| Onde | O quê |
|---|---|
| **Barra** | `☺ 7` — população. Um ponto acende quando algo aconteceu desde a última olhada (caravana, morte, artefato). Clique abre o mundo; botão direito liga a janelinha de canto; roda muda o nível dela. |
| **Janelinha de canto** (`m` ou botão direito na barra) | Uma vista viva de 240×150 px no canto inferior direito, por cima das janelas, sem roubar foco. Para ficar de olho enquanto faz outra coisa. Clique nela abre o painel. |
| **Painel** (`omarchy-shell omahold toggle`, ou clique na barra) | Mapa de um nível, barra lateral, anúncios e as teclas para dar ordens. |

Sugestão de atalho no `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER SHIFT", "F", "omarchy-shell omahold toggle", "Omahold")
```

## Menu, predefinições e slots

`Esc` (com nada para cancelar) ou o botão **≡ menu** abre o menu; `Esc` nele
fecha o painel.

- **Novo jogo**: Embarque clássico (7 anões, do zero), Fortaleza pronta (12,
  ondas a cada 15 dias), Guarnição (10, seis na milícia, ondas cedo e
  frequentes), Vale tranquilo (fortaleza pronta, sem inimigos), Cerco (8,
  ondas grandes desde o dia 2). **Personalizado** escolhe predefinição, número
  de anões (4–24) e semente numérica.
- **Salvar / Carregar**: cinco slots com nome, predefinição, data do jogo,
  população e quando foi gravado; `x` duas vezes limpa um slot para reuso. O
  autosave (`world.json`) continua independente dos slots.
- **Ver / inspecionar** (`v` no menu; `o` no jogo alterna): Normal, **Luz**
  (mapa de calor da iluminação), **Humor** (halo por anão), **Acesso** (o que
  se alcança a pé desde o portão ou de onde os anões estão; vermelho = isolado).
  É o mesmo campo que decide quais designações saem em vermelho no mapa. "Pular para uma hora do
  dia" mostra noite e tochas sem esperar.
- **Opções** (persistem em `options.json`): ritmo com o painel fechado
  (congelado, 1 tick a cada 4 s / 2 s / 1 s, 4 por segundo), velocidade com o
  painel aberto, blocos ou glifos, janelinha de canto, teto de população,
  inimigos ligados ou não, ondas goblin calmas / normais / brutais.

IPC equivalente: `omarchy-shell omahold preset <classic|ready|garrison|peaceful|siege>`,
`saveSlot <n>`, `loadSlot <n>`, `slots`, `presets`.

## Como se joga

É Dwarf Fortress em miniatura: você não controla anões, você **designa** o que
quer feito e eles decidem quem faz.

1. Marque uma **escada** (`s`) no acampamento: no chão, isso já marca a descida (a célula e a rocha embaixo). Para ir mais fundo, desça (`>`) e aperte `s` de novo sobre a escada. Uma escada marcada na rocha é cavada de qualquer chão que exista acima dela.
2. **Cave** (`d`) um salão: Enter marca um canto, Enter de novo aplica; ou arraste com o mouse.
3. **Construa** (`b`): camas (`b b`), mesas (`b t`), uma destilaria (`b d`), uma oficina (`b o`), um estoque (`b e`). Camas e mesas consomem toras (corte árvores com `c`); destilaria e oficina consomem pedra (sai da escavação).
4. **Plante** (`b f`) em terra, grama ou musgo de caverna. Piso de pedra não serve. Quando houver minério, uma **fundição** (`b u`) e uma **forja** (`b j`) transformam-no em picaretas, machados, armas e armaduras; **tochas** (`b l`) iluminam os salões; um **campo de treino** (`b r`) faz a milícia treinar.
5. Designações **em vermelho** não têm caminho até elas por enquanto (falta escada ou acesso pelo mesmo nível); a página Local explica. Elas são tentadas de novo sozinhas.
6. Olhe. Anões comem, bebem cerveja de cogumelo (ou água, e reclamam), dormem em cama ou no chão, conversam à mesa, ficam tristes quando alguém morre. Humor baixo demais vira acesso de fúria; fúria assistida piora o humor dos outros. É assim que uma fortaleza cai.

Cuidados: cavar embaixo do riacho **inunda**; cavar até o nível 0 encontra
**magma**; as cavernas (nível 1) têm musgo e cogumelos gigantes, e água.

Dicas de tecla ficam no rodapé; a ferramenta ativa aparece numa pílula sobre o
mapa e os avisos num toast central.

### Teclas

| | |
|---|---|
| setas / `hjkl` | mover cursor (`Shift`: 5 células) |
| `<` `>` `,` `.` PgUp/PgDn, roda | subir / descer um nível |
| `Enter` | marcar canto; de novo aplica. Em modo olhar: seleciona o que está sob o cursor |
| mouse | arrastar aplica a ferramenta; botão direito seleciona |
| `d` `s` `c` | cavar, escada (no chão: cava a descida; sobre uma escada: continua para baixo), cortar |
| `b` + letra | construir: `b` cama `t` mesa `f` plantação `e` estoque `p` porta `w` muro `l` tocha `o` oficina `d` destilaria `c` cozinha `u` fundição `j` forja `g` joalheria `r` campo de treino `s` estátua |
| `x` `r` | cancelar designação, remover construção |
| `]` `[` `f` | próximo/anterior anão; seguir o selecionado |
| `Espaço` `+` `-` | pausa; velocidade 1×/2×/4× |
| `L` | trancar portas: goblins, lobos e kobolds não passam |
| `g` | blocos ↔ glifos (o visual clássico) |
| `m` | janelinha de canto |
| `Tab` `u` `i` `y` `?` | páginas: Anões, Local, Lendas, Ajuda |
| `Home` | voltar ao acampamento |
| `n` | menu Novo jogo |
| `Shift+S` | menu Salvar |
| `Esc` | sair da ferramenta / menu |

## Cenário de teste

`omarchy-shell omahold scenario 12` (ou **Novo jogo → Fortaleza pronta** no
menu, `n`) troca o mundo por uma fortaleza pronta, feita para assistir a todos
os loops rodarem e para medir quanto ela aguenta:

| Nível | O que tem |
|---|---|
| superfície | portão murado com uma porta ao sul da escada |
| −1 | 12 plantações, despensa com 40 comidas, 12 refeições e 40 bebidas, tochas |
| −2 | refeitório com 12 mesas, cozinha, duas destilarias, estátuas, tochas |
| −3 | dormitório (camas para todos e mais quatro), fundição, forja, duas oficinas, dois campos de treino, estoque com toras, pedra, minério, barras e equipamento sobressalente |
| minas | galerias e todos os veios ao alcance já designados, com túneis de acesso |

Os anões chegam com ofícios: mineradores com picareta, lenhadores com machado,
fazendeiros, cervejeiro, ferreiro, pedreiro. Um terço forma a **milícia**, já
com arma e armadura, e treina no campo quando não há mais nada a fazer.

O loop completo: lavoura → comida → refeição (cozinha) e cerveja (destilaria);
árvore → tora → cama/mesa/porta/tocha; escavação → pedra → construções e
artesanato; minério → **fundição** → barra → **forja** → picareta, machado,
arma, armadura (por necessidade: primeiro quem não tem); gema bruta (minerada
de `☼` na rocha) → **joalheria** → gema lapidada → joia, os bens mais valiosos
para a caravana. **Luz** é simulada por
célula: o sol nasce e se põe (dias longos no verão, curtos no inverno, mais
fraco na chuva), cada tocha **tremula** e lança luz quente que decai com a
distância e **não atravessa rocha nem muro** (nem passa por quinas), e o magma
brilha em vermelho. Só a face da parede que encosta em chão aberto recebe luz;
rocha e muro são desenhados como alvenaria com um fio claro na aresta voltada
para o chão, então o contorno das salas fica nítido e é óbvio onde é sólido.
A superfície escurece à noite até um luar azulado, com amanhecer e entardecer
tingidos; o subsolo fica em penumbra onde não há tocha. Dormir e comer no
escuro vale menos; a página Local mostra a luz em % no cursor. Quando o minério acaba, a fortaleza
prospecta o veio mais próximo sozinha — o veio inteiro, com um túnel de acesso
— e quando faltam toras, marca árvores.

Nada disso se acumula para sempre: a despensa guarda umas dez comidas por anão
e o que passa daí **apodrece** (refeição preparada não, e é por isso que a
cozinha vale a pedra que custa), e **picareta, machado, arma e armadura se
gastam** até quebrar. Uma picareta quebrada é motivo para voltar à mina, e é o
que mantém a fundição e a forja acesas no terceiro ano em vez de deixá-las
ornamentais. As Lendas contam quanto estragou e quanto quebrou.

A **primeira onda goblin chega em seis dias** e depois a cada quinze, cada uma
maior (4, 5, 6, 7… até nove, veteranos a partir da quinta). O placar fica nas
Lendas: ondas, repelidas, goblins mortos, anões perdidos. Equipamento de quem
cai fica no chão para o próximo. Em dois anos de teste sem intervenção, em oito
sementes (`node test/scenario.js <semente> 2`), 12 anões repelem as 11 ondas,
perdem uns 9 e terminam com uns 16 — os migrantes repõem mais do que os goblins
levam. Trancar as portas (`L`) muda tudo: goblins não passam e vão embora.

Se ainda assim o último anão morrer, a fortaleza **cai**: o painel marca `caiu`,
as Lendas registram o fim e o mundo para de gerar ondas, caravanas e migrantes.
Perder é divertido, mas uma ruína não fica anunciando vitórias.

`omarchy-shell omahold raid` traz uma onda agora.

## IPC

```
omarchy-shell omahold toggle|open|close|peek|pause|save|status
omarchy-shell omahold speed 1|2|4
omarchy-shell omahold scenario 12         # fortaleza pronta com N anões e ondas goblin
omarchy-shell omahold raid                # uma onda agora
omarchy-shell omahold hour 22             # pula para uma hora do dia (0-24)
omarchy-shell omahold view light          # normal | light | mood | access
omarchy-shell omahold background 2000      # ms por tick com o painel fechado; 0 congela
omarchy-shell omahold newWorld "" # ou uma semente numérica
```

Opções inline na entrada do widget em `~/.config/omarchy/shell.json`:
`{ "id": "zed.omahold", "backgroundMs": 2000, "popCap": 20, "peek": false }`.

O mundo é salvo em `~/.local/state/omarchy/omahold/world.json` a cada 90 s e
ao fechar o painel; sobrevive a reinícios do shell.

## O que está simulado, e o que não está

**Está**: cadeia minério → barra → ferramentas/armas/armadura, cozinha, tochas e luz, milícia automática com treino, armadura no combate, cenário-vitrine com ondas; economia com dreno — comida crua estraga no que passa da capacidade da despensa (refeições preparadas conservam) e picareta, machado, arma e armadura se gastam com o uso até quebrar, então a mina e a forja têm por que continuar depois do primeiro ano; relevo com encostas (rampas implícitas), solo/rocha/minério/gemas,
riacho, cavernas, mar de magma; A* em 3D com escadas e encostas; sete
necessidades e ofícios; designações de cavar/escada/cortar/construir; lavoura
com crescimento, destilaria, oficina (artesanato e armas de minério),
estoques e transporte; camas reivindicadas, refeições à mesa; pensamentos
com peso e humor com deriva, fúria, melancolia (e recuperação), fúria
assassina; humores estranhos com reivindicação de oficina, exigência de
material e artefato nomeado; migrantes por riqueza e teto de população;
caravana no outono que compra artesanato/gemas e deixa suprimentos;
emboscadas escaladas pela riqueza; lobos no inverno; kobolds; combate com
habilidade e armas; portas trancáveis; líquidos que avançam por brechas com
orçamento finito; dia e noite, chuva e neve; crônica e memorial.

**Não está** (de propósito, pela escala): hidráulica de verdade (níveis de
água/pressão), desabamentos, temperatura, comércio
com negociação, nobres, animais domésticos, sítios externos, ordens de oficina
e ofícios atribuídos à mão (os anões escolhem o trabalho sozinhos). Cada anão é um
único glifo e não tem membros — a ferida é só um número.

## Referências

Este é um "DF-like" no sentido de [Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress):
mundo em fatias verticais, ordens indiretas, personagens com histórias
emergentes e a regra de que perder é divertido. Coisas parecidas em escala
menor e que serviram de comparação: [DeepForge](https://minitech.itch.io/deep-forge)
(colônia ASCII com sete anões), [Albert's ASCII Dwarfs Simulation](https://albertfreeman.itch.io/alberts-dwarfs-simulation)
(só simulação, sem jogo), [Undholm](https://store.steampowered.com/app/982060/Undholm/).
A ideia de um mundo que corre no canto da tela enquanto você trabalha vem de
[Taskbar Colony](https://store.steampowered.com/app/5056060) e
[Desktop Colony](https://store.steampowered.com/app/3825610); a de um plugin
que vive no fundo do shell, do [Omalava](https://github.com/) e do
[Omaland](https://github.com/bobby-nicholas/omaland) para omarchy-shell.
O [catálogo de plugins do Omarchy](https://plugins.omarchy.org/) não tinha
nenhum jogo ou simulação quando este foi escrito.

## Desenvolvimento

`sim.js` é JavaScript puro, sem QML: `node test/run.js [semente] [anos]`
joga uma fortaleza roteirizada e imprime a crônica, as estatísticas e mapas
ASCII de três níveis. `node test/scenario.js [semente] [anos] [anões]` roda a
fortaleza pronta e imprime o placar das ondas — é com ele que se afere o
balanceamento acima. `test/debug.js` e `test/debug2.js` rastreiam caminhos
e transições de trabalho — foi assim que se descobriu que os anões morriam
de sede porque `step()` confundia "ainda andando" com "bloqueado".

Arquivos: `manifest.json` · `World.qml` (singleton: relógio, salvamento,
paleta) · `sim.js` (o mundo) · `palette.js` (tema → cores do mapa) ·
`Fort.qml` (painel) · `Service.qml` (janelinha de canto) · `BarWidget.qml`.
