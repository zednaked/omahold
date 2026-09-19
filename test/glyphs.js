// Todo glifo que o plugin desenha, contra o que as fontes de verdade cobrem.
//
//   node test/glyphs.js
//
// Um glifo que nenhuma fonte tem nao aparece como erro: aparece como NADA. O
// chip fica vazio, a unidade fica invisivel no mapa, e nada no console diz por
// que. Achado em 19/09/2026, quando o chip de profundidade sumiu numa maquina:
//
//   U+26B7 CHIRON  ⚷  "quao fundo a fortaleza cavou"   0 fontes instaladas
//   U+2654 WHITE CHESS KING  ♔  o rei, no mapa          0 fontes instaladas
//
// Os dois eram escolhas bonitas em fonte de desenvolvedor e invisiveis em todo
// lugar. Como o plugin e publicado, isso nao e problema de uma maquina.
//
// Duas camadas, de proposito:
//
//   BANIDOS  faixas que quase nenhuma fonte de texto cobre. Deterministico,
//            roda sem fontconfig, e falha - e a rede que impede a reincidencia.
//   AVISO    o que o fontconfig DESTA maquina nao acha. Nao falha, porque uma
//            maquina magra faria o teste mentir sobre o plugin.
const fs = require("fs"), path = require("path")
const { execFileSync } = require("child_process")

const BANIDOS = [
  [0x2654, 0x265f, "pecas de xadrez - nenhuma fonte de texto as tem"],
  [0x26b3, 0x26bc, "simbolos astrologicos (Ceres..Chiron) - idem"],
  [0x1f300, 0x1faff, "emoji - o painel e monoespacado, emoji quebra a grade"],
  [0x2e80, 0x9fff, "CJK - largura dupla desalinha a grade do mapa"],
]
const PERMITIDOS_APESAR_DO_FONTCONFIG = []

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

const base = path.join(__dirname, "..")
const arquivos = fs.readdirSync(base).filter((f) => /\.(qml|js)$/.test(f))
const achados = new Map()
for (const f of arquivos) {
  const linhas = fs.readFileSync(path.join(base, f), "utf8").split("\n")
  linhas.forEach((linha, k) => {
    for (const ch of linha) {
      const cp = ch.codePointAt(0)
      // acima da pontuacao latina, fora das quotes tipograficas
      if (cp <= 0x2000 || (cp >= 0x2018 && cp <= 0x201f)) continue
      if (!achados.has(cp)) achados.set(cp, { ch: ch, onde: `${f}:${k + 1}` })
    }
  })
}

console.log(`${achados.size} glifo(s) acima de U+2000 em ${arquivos.length} arquivo(s)\n`)

// --- camada 1: faixas banidas ----------------------------------------------
const proibidos = []
for (const [cp, info] of achados) {
  for (const [lo, hi, porque] of BANIDOS) {
    if (cp >= lo && cp <= hi) proibidos.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${info.ch} em ${info.onde} — ${porque}`)
  }
}
check(proibidos.length === 0, "nenhum glifo de faixa banida")
for (const m of proibidos) console.log("          " + m)

// --- camada 2: o que o fontconfig desta maquina nao acha --------------------
let temFc = true
try { execFileSync("fc-list", ["--version"], { stdio: "ignore" }) } catch (e) { temFc = false }

if (!temFc) {
  console.log("\n  (sem fc-list: a checagem contra as fontes instaladas foi pulada)")
} else {
  const semFonte = []
  for (const [cp, info] of achados) {
    if (PERMITIDOS_APESAR_DO_FONTCONFIG.includes(cp)) continue
    let out = ""
    try { out = execFileSync("fc-list", [`:charset=${cp.toString(16)}`], { encoding: "utf8" }) } catch (e) { out = "" }
    if (!out.trim()) semFonte.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${info.ch} em ${info.onde}`)
  }
  if (semFonte.length) {
    console.log(`\n  AVISO: ${semFonte.length} glifo(s) sem fonte NESTA maquina (nao falha o teste):`)
    for (const m of semFonte) console.log("          " + m)
    console.log("          se for uma maquina magra, ignore; se nao, o glifo esta invisivel")
  } else {
    passed++
    console.log("  ok    todos os glifos tem ao menos uma fonte nesta maquina")
  }
}

console.log(`\n${passed + failed} checks, ${failed} failed`)
process.exit(failed ? 1 : 0)
