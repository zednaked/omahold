// Toda troca de nivel de anao, auditada contra a geometria que a autorizou.
//
//   node test/zmoves.js [seed] [ticks]
//
// Ha dois jeitos de trocar de nivel: a escada construida (B_STAIR nas duas
// pontas) e a rampa natural do `stepTo` - morro a um nivel de distancia. Este
// teste roda a partida, guarda a geometria de cada tick, e para cada anao que
// mudou de z pergunta qual das duas regras permitia aquilo. Nenhuma das duas
// significa que o anao subiu por onde nao ha passagem.
//
// Existe porque isso quebrou quatro vezes (as tres primeiras em stairs.js):
//
//   4. A rampa conferia `tile[i+N] === T_OPEN` para saber se havia espaco sobre
//      a cabeca, e nunca `floor[i+N]`. Num corredor escavado o tile tambem e
//      aberto, entao o anao subia atravessando o piso do andar de cima. Nas
//      seeds 1/2/3/7/42/99, 4000 ticks: 1099 ocorrencias. O jogador via anoes
//      pegando uma escada que nao existe.
//
// A contagem certa e ZERO, nao "poucas": uma unica dessas e um anao dentro da
// rocha.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, tick, dwarves, idx, ix, iy, iz, N, NN, W, H, D,
  B_STAIR, B_WALL, T_OPEN, T_TREE, T_FUNGUS, F_NONE, setI18n, solid }`)()
const I18n = (function () {
  const isrc = fs.readFileSync(path.join(__dirname, "..", "I18n.js"), "utf8").replace(".pragma library", "")
  return new Function(isrc + "; return { t, tf, plural, table, inSeason, STRINGS, TABLES }")()
})()
S.setI18n(I18n, "pt")

const SEEDS = process.argv[2] ? [Number(process.argv[2])] : [1, 2, 3, 7, 42, 99]
const TICKS = Number(process.argv[3] || 2000)

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

// As regras de movimento, lidas contra o snapshot em vez do mundo vivo.
let tile, floor, build
function pass(i) { return tile[i] === S.T_OPEN && floor[i] !== S.F_NONE && build[i] !== S.B_WALL }
function climbUp(j) {
  return S.solid(tile[j]) && tile[j] !== S.T_TREE && tile[j] !== S.T_FUNGUS && pass(j + S.N)
}

function audita(seed) {
  const w = S.newScenario(seed, 12, {})
  const ruins = []
  let legais = 0
  const antes = new Map()

  for (let t = 0; t < TICKS; t++) {
    tile = Uint8Array.from(w.tile); floor = Uint8Array.from(w.floor); build = Uint8Array.from(w.build)
    antes.clear()
    for (const d of S.dwarves(w)) antes.set(d.id, d.i)
    S.tick(w)
    for (const d of S.dwarves(w)) {
      const a = antes.get(d.id); if (a === undefined) continue
      const b = d.i; if (a === b) continue
      const dz = S.iz(b) - S.iz(a); if (dz === 0) continue
      const dx = S.ix(b) - S.ix(a), dy = S.iy(b) - S.iy(a)
      const onde = `t=${t} (${S.ix(a)},${S.iy(a)},${S.iz(a)})->(${S.ix(b)},${S.iy(b)},${S.iz(b)})`

      // vertical puro: e a escada, e precisa dela nas duas pontas
      if (dx === 0 && dy === 0 && Math.abs(dz) === 1) {
        if (build[a] === S.B_STAIR && build[b] === S.B_STAIR) legais++
        else ruins.push("vertical sem escada " + onde)
        continue
      }
      // um passo lateral trocando de nivel: e a rampa
      if (Math.abs(dx) + Math.abs(dy) === 1 && Math.abs(dz) === 1) {
        const lat = S.idx(S.ix(b), S.iy(b), S.iz(a))
        if (dz === 1) {
          if (!climbUp(lat)) ruins.push("subiu sem rampa " + onde)
          else if (tile[a + S.N] !== S.T_OPEN) ruins.push("subiu com rocha na cabeca " + onde)
          else if (floor[a + S.N] !== S.F_NONE) ruins.push("subiu atravessando o piso de cima " + onde)
          else legais++
        } else {
          if (tile[lat] !== S.T_OPEN) ruins.push("desceu por rocha " + onde)
          else legais++
        }
        continue
      }
      ruins.push("salto que nao e um passo " + onde)
    }
  }
  return { legais: legais, ruins: ruins }
}

console.log(`trocas de nivel, ${TICKS} ticks por seed`)
let totalRuins = 0, totalLegais = 0
for (const seed of SEEDS) {
  const r = audita(seed)
  totalRuins += r.ruins.length; totalLegais += r.legais
  check(r.ruins.length === 0, `seed ${seed}: ${r.legais} trocas, todas por escada ou rampa de verdade`)
  for (const m of r.ruins.slice(0, 3)) console.log("          " + m)
  if (r.ruins.length > 3) console.log(`          ... e outras ${r.ruins.length - 3}`)
}

console.log(`\n${totalLegais} trocas legitimas, ${totalRuins} sem passagem`)
console.log(`${passed + failed} checks, ${failed} failed`)
process.exit(failed ? 1 : 0)
