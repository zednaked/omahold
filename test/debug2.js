const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const T = new Function(src + `; return { newWorld, tick, designate, idx, ix, iy, iz, dwarves, jobName, findPath, passable, freeItem, canDesignate, YEAR, DAY, B_STAIR, B_STILL, B_WORKSHOP, B_FARM, B_BED, B_STOCK, countItems, pop }`)()
const seed = parseInt(process.argv[2] || "23", 10)
const w = T.newWorld(seed)
const cx = T.ix(w.depot), cy = T.iy(w.depot), cz = T.iz(w.depot)
for (let z = cz; z >= cz - 4; z--) T.designate(w, T.idx(cx, cy, z), "stair")
for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 6; x <= cx + 7; x++) if (x !== cx || y !== cy) T.designate(w, T.idx(x, y, cz - 3), "dig")
for (let dx = -4; dx < 0; dx++) for (const dy of [2, 3]) T.designate(w, T.idx(cx + dx, cy + dy, w.ground[(cy + dy) * 48 + cx + dx]), "build", T.B_FARM)
const hist = {}
let placed = false
for (let k = 0; k < T.YEAR * 1.3; k++) {
  T.tick(w)
  if (!placed && k > 600) { placed = true
    T.designate(w, T.idx(cx + 2, cy + 2, cz - 3), "build", T.B_STILL); T.designate(w, T.idx(cx + 5, cy + 2, cz - 3), "build", T.B_WORKSHOP)
    for (let q = 0; q < 6; q++) { T.designate(w, T.idx(cx - 6 + q, cy - 3, cz - 3), "build", T.B_BED); T.designate(w, T.idx(cx - 6 + q, cy + 3, cz - 3), "build", T.B_STOCK) } }
  for (const u of T.dwarves(w)) {
    if (u.hunger < 80 && u.thirst < 80) continue
    const h = hist[u.id] || (hist[u.id] = [])
    const line = `${T.jobName(u)}${u.job && u.job.stage ? "/" + u.job.stage : ""}${u.path ? " p" + (u.path.length - u.pi) : ""} @${T.ix(u.i)},${T.iy(u.i)},${T.iz(u.i)} h${u.hunger | 0} t${u.thirst | 0} s${u.sleep | 0}`
    if (h.length === 0 || h[h.length - 1].line.split(" @")[0] !== line.split(" @")[0]) h.push({ k, line })
  }
  const dead = w.dead.find(d => !d.shown)
  if (dead) {
    dead.shown = true
    const u = Object.values(hist).find(h => h.name === dead.name) 
    console.log(`\n=== ${dead.name}: ${dead.how} (tick ${w.tick}) food=${T.countItems(w, "food")} booze=${T.countItems(w, "booze")} pop=${T.pop(w)}`)
  }
  for (const u of T.dwarves(w)) if (hist[u.id]) hist[u.id].name = u.name
}
for (const d of w.dead) {
  const h = Object.values(hist).find(h => h.name === d.name)
  if (!h) continue
  console.log(`\n--- ${d.name} (${d.how}) últimas transições:`)
  for (const e of h.slice(-14)) console.log("   ", e.k, e.line)
}
