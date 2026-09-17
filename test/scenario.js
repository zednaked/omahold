// The showcase hold: everything already built, goblin waves on a schedule.
//   node test/scenario.js [seed] [years] [dwarves]
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const T = new Function(src + `; return { newScenario, tick, date, summary, dwarves, countItems, cache, YEAR, DAY, ix, iy, iz, tileName, isLit, N }`)()
const seed = parseInt(process.argv[2] || "7", 10), years = parseFloat(process.argv[3] || "2"), n = parseInt(process.argv[4] || "12", 10)
const w = T.newScenario(seed, n)
const cx = T.ix(w.depot), cy = T.iy(w.depot), cz = T.iz(w.depot)
console.log(`${w.name} · depot (${cx},${cy},${cz}) · ${T.dwarves(w).length} anões · designações ${T.cache(w).desigs.length}`)
const c = T.cache(w); let lit = 0; for (let i = 0; i < T.N * 8; i++) if (c.light[i] > 0) lit++
console.log(`camas ${c.beds.length} mesas ${c.tables.length} plantações ${c.farms.length} estoques ${c.stocks.length} tochas ${c.torches.length} (${lit} células iluminadas) cozinha ${c.kitchens.length} fundição ${c.smelters.length} forja ${c.forges.length} treino ${c.trainings.length}`)
let lastLog = 0
const total = Math.floor(T.YEAR * years), t0 = Date.now()
function gear() { const ds = T.dwarves(w); return { militia: ds.filter(u => u.militia).length, armed: ds.filter(u => u.weapon).length, armored: ds.filter(u => u.armor).length, picks: ds.filter(u => u.tool === "pick").length, axes: ds.filter(u => u.tool === "axe").length } }
for (let k = 0; k < total; k++) {
  T.tick(w)
  while (lastLog < w.log.length) { const e = w.log[lastLog++], d = T.date(w); if (e.l >= 1 || process.env.VERBOSE) console.log(`[a${d.year} ${d.seasonName} d${d.day}] ${e.l === 2 ? "!! " : " * "}${e.m}`) }
  if (k % (T.DAY * 10) === 0) {
    const s = T.summary(w), g = gear()
    console.log(`   -- a${s.date.year} ${s.date.seasonName} d${s.date.day}: pop ${s.pop} humor ${s.mood} comida ${T.countItems(w, "food")} refeições ${T.countItems(w, "meal")} bebida ${s.booze} barras ${T.countItems(w, "bar")} minério ${T.countItems(w, "ore")} · milícia ${g.militia} armados ${g.armed} c/armadura ${g.armored} picaretas ${g.picks} machados ${g.axes} · riqueza ${s.wealth}`)
  }
}
const ms = Date.now() - t0
console.log(`\n${total} ticks em ${ms} ms (${(ms / total * 1000).toFixed(1)} µs/tick)`)
console.log("stats:", JSON.stringify(w.stats))
console.log(`resiliência: ${w.stats.raids} ondas, ${w.stats.repelled || 0} repelidas, ${w.stats.goblinsKilled || 0} goblins mortos, ${w.stats.deaths} anões perdidos`)
console.log("mortos:", w.dead.map(d => d.name + " (" + d.how + ")").join("; ") || "nenhum")
for (const u of T.dwarves(w)) console.log(`  ${u.name.padEnd(22)} ${(u.militia ? "milícia" : "").padEnd(8)} ${(u.weapon ? "arma " : "") + (u.armor ? "armadura " : "") + (u.tool || "")}`.padEnd(60) + ` humor ${u.mood} ${u.thoughts[0] ? "· " + u.thoughts[0].m : ""}`)
