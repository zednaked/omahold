// Digging to the bottom, and what wakes on the way.
//   node test/deep.js [seed]
const fs = require("fs"), path = require("path")
const dir = path.join(__dirname, "..")
function load(file, ex) {
  const src = fs.readFileSync(path.join(dir, file), "utf8").replace(".pragma library", "")
  return new Function(src + "; return { " + ex + " }")()
}
const I18n = load("I18n.js", "t, tf, plural, table, inSeason, STRINGS, TABLES")
const S = load("sim.js", "newScenario, setI18n, tick, designate, idx, ix, iy, iz, dwarves, YEAR, DAY, date, passable, T_OPEN, F_NONE, N, D, W, H, digDepth")
S.setI18n(I18n, process.env.LANG_OMA || "en")

const seed = parseInt(process.argv[2] || "7", 10)
const w = S.newScenario(seed, 12)
const cx = S.ix(w.depot), cy = S.iy(w.depot), cz = S.iz(w.depot)
console.log(`${w.name} · seed ${seed} · depot z${cz} · mais fundo aberto: z${S.digDepth(w)}`)

// a shaft straight down from the mine level to the magma
let marked = 0
for (let z = cz; z >= 0; z--) if (S.designate(w, S.idx(cx, cy, z), "stair")) marked++
console.log(`escada designada em ${marked} níveis`)

const seen = []
let lastDeep = S.digDepth(w)
for (let k = 0; k < S.YEAR * 3; k++) {
  const before = w.log.length
  S.tick(w)
  // keep re-marking: the shaft needs a stair on each level as it opens
  if (k % 200 === 0) for (let z = cz; z >= 0; z--) S.designate(w, S.idx(cx, cy, z), "stair")
  for (let i = before; i < w.log.length; i++) {
    const m = w.log[i].m
    if (/wakes|woke|desperta|despertou|crawlers come|rastejantes saem|sentinel of the deep climbs|sentinela das profundezas sobe|A tomb!|Uma tumba!|silence down here|silêncio aqui|dug too deep|cavou fundo/i.test(m))
      seen.push(`a${S.date(w).year} ${w.log[i].l === 2 ? "!!" : " *"} ${m}`)
  }
  const d = S.digDepth(w)
  if (d < lastDeep) { seen.push(`a${S.date(w).year} -- nível ${d} aberto`); lastDeep = d }
}
for (const line of seen.slice(0, 18)) console.log("  " + line)
const alive = w.units.filter(u => u.k === "crawler" || u.k === "sentinel").length
console.log(`\nmais fundo: z${S.digDepth(w)} · despertados ${w.stats.stirred || 0} · vivos lá embaixo ${alive}`)
console.log(`pop ${S.dwarves(w).length} · mortes ${w.stats.deaths} · artefatos ${w.stats.artifacts} · tumba ${w.tomb ? "aberta" : "não"}`)
