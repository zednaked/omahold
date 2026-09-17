// Headless run of sim.js under node. Plays a scripted fortress for a few years
// and prints what happened, so the dwarves can be watched without the shell.
//   node test/run.js [seed] [years]
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newWorld, tick, designate, designateRect, idx, ix, iy, iz, summary, date, W, H, D, N,
  B_STAIR, B_BED, B_TABLE, B_FARM, B_STILL, B_WORKSHOP, B_STOCK, B_DOOR, B_WALL, B_STATUE, T_OPEN, T_TREE, F_NONE,
  serialize, deserialize, dwarves, pop, tileName, jobName, moodWord, canDesignate, passable, YEAR, DAY }`)()

const seed = parseInt(process.argv[2] || "7", 10)
const years = parseFloat(process.argv[3] || "2")
let w = S.newWorld(seed)
const T = S
const cx = T.ix(w.depot), cy = T.iy(w.depot), cz = T.iz(w.depot)
console.log(`fortaleza: ${w.name}  seed=${seed}  depot=(${cx},${cy},${cz})`)

function ascii(z) {
  let out = ""
  const unitAt = {}, itemAt = {}
  for (const u of w.units) if (T.iz(u.i) === z) unitAt[u.i] = u
  for (const it of w.items) if (T.iz(it.i) === z && !it.by) itemAt[it.i] = it
  for (let y = 0; y < T.H; y++) {
    let row = ""
    for (let x = 0; x < T.W; x++) {
      const i = T.idx(x, y, z), t = w.tile[i], f = w.floor[i], b = w.build[i], d = w.desig[i]
      let c = " "
      if (t === 1) c = "▒"; else if (t === 2) c = "▓"; else if (t === 3) c = "£"; else if (t === 4) c = "*"; else if (t === 5) c = "♠"
      else if (t === 6) c = "~"; else if (t === 7) c = "M"; else if (t === 8) c = "♣"; else if (t === 9) c = '"'
      else { c = f === 0 ? " " : f === 3 ? "." : f === 4 ? ":" : f === 1 ? "," : "·" }
      if (b) c = { 1: "X", 2: "b", 3: "T", 4: "≡", 5: "S", 6: "W", 7: "#", 8: "+", 9: "=", 10: "Ω" }[b]
      if (d && !b) c = d === 1 ? "d" : d === 2 ? "x" : d === 3 ? "c" : "B"
      if (itemAt[i]) c = { log: "l", stone: "o", ore: "%", gem: "◆", food: "f", booze: "!", craft: "a", weapon: "/", artifact: "A", remains: "†" }[itemAt[i].t]
      if (unitAt[i]) c = { dwarf: "☺", goblin: "g", deer: "D", wolf: "w", kobold: "k", merchant: "$" }[unitAt[i].k]
      row += c
    }
    out += row + "\n"
  }
  return out
}

// --- the script: a modest fortress next to the wagon --------------------------
// stairs at the wagon spot going down 3 levels; a 7x5 hall on z-1; bedrooms on z-2
const sx = cx, sy = cy
const plan = []
function at(t, x, y, z, bt) { plan.push({ t, x, y, z, bt }) }
for (let z = cz; z >= cz - 4; z--) at("stair", sx, sy, z)
for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx + 1; x <= sx + 7; x++) at("dig", x, y, cz - 3)
for (let y = sy - 3; y <= sy + 3; y++) for (let x = sx - 6; x <= sx - 1; x++) at("dig", x, y, cz - 3)
for (let y = sy - 3; y <= sy + 3; y++) for (let x = sx - 6; x <= sx + 7; x++) if (Math.abs(x - sx) > 0 || Math.abs(y - sy) > 0) at("dig", x, y, cz - 4)
// chop nearby trees
for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 8; x <= cx + 8; x++) { if (!T.inb || true) { const g = w.ground[y * T.W + x]; if (g !== undefined) { const i = T.idx(x, y, g); if (w.tile[i] === T.T_TREE) at("chop", x, y, g) } } }
let applied = 0
function applyPlan(pred) {
  for (const p of plan) {
    if (p.done) continue
    if (pred && !pred(p)) continue
    if (!(p.x >= 0 && p.y >= 0 && p.x < T.W && p.y < T.H && p.z >= 0 && p.z < T.D)) { p.done = true; continue }
    if (T.designate(w, T.idx(p.x, p.y, p.z), p.t, p.bt)) applied++
    p.done = true
  }
}
applyPlan(p => p.t !== "build")
// buildings get designated once there is floor to put them on
let buildingsPlaced = false
function placeBuildings() {
  const z1 = cz - 3, z2 = cz - 4
  const tries = [
    ["build", sx + 2, sy - 1, z1, T.B_TABLE], ["build", sx + 4, sy - 1, z1, T.B_TABLE], ["build", sx + 6, sy - 1, z1, T.B_TABLE],
    ["build", sx + 2, sy + 2, z1, T.B_STILL], ["build", sx + 5, sy + 2, z1, T.B_WORKSHOP],
    ["build", sx - 6, sy - 2, z1, T.B_STOCK], ["build", sx - 5, sy - 2, z1, T.B_STOCK], ["build", sx - 4, sy - 2, z1, T.B_STOCK], ["build", sx - 3, sy - 2, z1, T.B_STOCK],
    ["build", cx + -4, cy + 2, w.ground[(cy + 2) * T.W + cx + -4], T.B_FARM],
    ["build", cx + -4, cy + 3, w.ground[(cy + 3) * T.W + cx + -4], T.B_FARM],
    ["build", cx + -3, cy + 2, w.ground[(cy + 2) * T.W + cx + -3], T.B_FARM],
    ["build", cx + -3, cy + 3, w.ground[(cy + 3) * T.W + cx + -3], T.B_FARM],
    ["build", cx + -2, cy + 2, w.ground[(cy + 2) * T.W + cx + -2], T.B_FARM],
    ["build", cx + -2, cy + 3, w.ground[(cy + 3) * T.W + cx + -2], T.B_FARM],
    ["build", cx + -1, cy + 2, w.ground[(cy + 2) * T.W + cx + -1], T.B_FARM],
    ["build", cx + -1, cy + 3, w.ground[(cy + 3) * T.W + cx + -1], T.B_FARM],
    ["build", sx + 1, sy, cz, T.B_DOOR],
  ]
  for (let k = 0; k < 12; k++) tries.push(["build", sx - 6 + (k % 7) * 2, sy - 3 + Math.floor(k / 7) * 3, z2, T.B_BED])
  let n = 0
  for (const t of tries) if (T.canDesignate(w, T.idx(t[1], t[2], t[3]), t[0], t[4])) { T.designate(w, T.idx(t[1], t[2], t[3]), t[0], t[4]); n++ }
  return n
}

const total = Math.floor(T.YEAR * years)
let lastLog = 0, placed = 0
const t0 = Date.now()
for (let k = 0; k < total; k++) {
  T.tick(w)
  if (k % 200 === 0) placed += placeBuildings()
  if (k % (T.DAY * 5) === 0 && process.env.SEASONS) { const q = T.summary(w); console.log(`   -- a${q.date.year} ${q.date.seasonName} d${q.date.day}: pop ${q.pop} humor ${q.mood} comida ${q.food} bebida ${q.booze} riqueza ${q.wealth} still=${w.build.indexOf(5)>=0} shop=${w.build.indexOf(6)>=0} farms=${[...w.build].filter(b=>b===4).length} beds=${[...w.build].filter(b=>b===2).length}`) }
  if (k % 300 === 0) applyPlan()
  while (lastLog < w.log.length) {
    const e = w.log[lastLog++], d = T.date(w)
    if (e.l >= 1 || process.env.VERBOSE) console.log(`[a${d.year} ${d.seasonName} d${d.day}] ${e.l === 2 ? "!! " : e.l === 1 ? " * " : "   "}${e.m}`)
  }
  if (k === Math.floor(total / 2)) {
    // round-trip the save halfway through
    const js = T.serialize(w); const w2 = T.deserialize(js); if (!w2) throw new Error("deserialize failed")
    console.log(`save: ${(js.length / 1024).toFixed(0)} KB, round-trip ok (units ${w2.units.length}, items ${w2.items.length})`)
    w = w2
  }
}
const ms = Date.now() - t0
const s = T.summary(w)
console.log(`\n${total} ticks em ${ms} ms (${(ms / total * 1000).toFixed(1)} µs/tick)`)
console.log(`pop=${s.pop} humor=${s.mood} comida=${s.food} bebida=${s.booze} riqueza=${s.wealth} designações aplicadas=${applied} prédios designados=${placed}`)
console.log("stats:", JSON.stringify(w.stats))
console.log("artefatos:", w.artifacts.map(a => a.name + " '" + a.title + "'").join("; ") || "nenhum")
console.log("mortos:", w.dead.map(d => d.name + " (" + d.how + ")").join("; ") || "nenhum")
for (const u of T.dwarves(w)) console.log(`  ${u.name.padEnd(22)} ${T.moodWord(u).padEnd(10)} ${T.jobName(u).padEnd(20)} z${T.iz(u.i)} fome ${u.hunger | 0} sede ${u.thirst | 0} sono ${u.sleep | 0} hp ${u.hp} ${u.trait} ${u.thoughts[0] ? "· " + u.thoughts[0].m : ""}`)
if (process.env.MAP !== "0") { for (const z of [cz, cz - 3, cz - 4]) { console.log(`\n--- z=${z} ---`); process.stdout.write(ascii(z)) } }
