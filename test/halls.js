// The four things a hold builds for its own sake, under node.
//
//   node test/halls.js
//
// A hearth, a crystal column, a game table and a spike trap: each one carries
// an effect, and an effect that is not checked is a decoration.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, tick, dwarves, pop, addUnit, addItem, cache, cellLight, isLit,
  B_HEARTH, B_CRYSTAL, B_GAMES, B_GRAVE, B_TORCH, B_TRAP, B_NONE, B_POST, B_WELL, B_FLOODGATE, T_WATER, T_OPEN,
  TRAP_CHARGES, BOND_FRIEND, POST_REACH, trapFires, trapCharges, armTrap, bondTotal, shiftBond, nearBuilding,
  buildName, canDesignate, rosterMilitia, spreadLiquids, touchesWater, idx, ix, iy, iz, dist, N, W, H, NN, DAY }`)()

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

const w = S.newScenario(7, 12, {})
S.tick(w)
const c = S.cache(w)

// --- the ready hold demonstrates all four -------------------------------------
check(c.hearths.length >= 1, "the ready hold has a hearth")
check(c.games.length >= 2, "and game tables")
check(c.crystals.length >= 1, "and a crystal column")
check(c.traps.length >= 2, "and spikes in the entrance corridor")
check(c.beacons.length === c.hearths.length + c.crystals.length, "hearths and columns share one light field")

// --- light: a beacon carries much further than a torch ------------------------
// an open cell in the middle of the dug-out level, so walls do not decide it
const z = S.iz(S.dwarves(w)[0].i)
let open = -1, bestOpen = -1
for (let y = 3; y < S.H - 3; y++) for (let x = 3; x < S.W - 3; x++) {
  const i = S.idx(x, y, z)
  if (w.tile[i] !== 0 || w.floor[i] === 0 || w.build[i] !== 0) continue
  let n = 0
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (w.tile[S.idx(x + dx, y + dy, z)] === 0) n++
  if (n > bestOpen) { bestOpen = n; open = i }
}
function litCells() { let n = 0; for (let i = z * S.N; i < (z + 1) * S.N; i++) if (S.cellLight(w, i) > 0.05) n++; return n }
function sumLight() { let t = 0; for (let i = z * S.N; i < (z + 1) * S.N; i++) t += S.cellLight(w, i); return t }
const bare = sumLight()
w.build[open] = S.B_TORCH; w.dirty = true; S.tick(w)
const torch = sumLight() - bare
w.build[open] = S.B_HEARTH; w.dirty = true; S.tick(w)
const hearth = sumLight() - bare
w.build[open] = S.B_CRYSTAL; w.dirty = true; S.tick(w)
const crystal = sumLight() - bare
check(hearth > torch * 2, "a hearth lights more than twice what a torch does (" + hearth.toFixed(1) + " vs " + torch.toFixed(1) + ")")
check(Math.abs(crystal - hearth) < 0.01, "a crystal column reaches as far, without the flicker")
w.build[open] = S.B_NONE; w.dirty = true; S.tick(w)

// --- the hearth mends -----------------------------------------------------------
// two dwarves hurt the same amount, one of them by the fire
const fire = c.hearths[0]
const near = S.dwarves(w)[0], far = S.dwarves(w)[1]
near.i = fire + 1; far.i = open
near.hp = far.hp = 4; near.hunger = far.hunger = 0; near.thirst = far.thirst = 0
check(S.nearBuilding(w, near.i, S.B_HEARTH, 3) && !S.nearBuilding(w, far.i, S.B_HEARTH, 3),
      "one dwarf is by the fire and the other is not")
for (let k = 0; k < 200; k++) {
  near.i = fire + 1; far.i = open            // hold them in place against the job loop
  near.hunger = far.hunger = 0; near.thirst = far.thirst = 0
  S.tick(w)
}
check(near.hp > far.hp, "the one by the fire mends faster (" + near.hp + " vs " + far.hp + ")")

// --- the game table ties two dwarves together ----------------------------------
const w2 = S.newScenario(3, 12, {})
S.tick(w2)
const g = S.cache(w2).games[0]
const a = S.dwarves(w2)[0], b = S.dwarves(w2)[1]
const before = S.bondTotal(a, b.id)
for (let k = 0; k < 600; k++) { a.i = g; b.i = g + 1; S.tick(w2) }
check(S.bondTotal(a, b.id) > before + 10, "sitting at a game table builds a tie fast (" + before + " → " + S.bondTotal(a, b.id) + ")")

// a grave is not a game table: same time, much slower
const w3 = S.newScenario(3, 12, {})
S.tick(w3)
const a3 = S.dwarves(w3)[0], b3 = S.dwarves(w3)[1]
const corner = (function () {
  for (let i = 0; i < S.N * 8; i++) if (w3.tile[i] === 0 && w3.floor[i] !== 0 && w3.build[i] === 0 && !S.nearBuilding(w3, i, S.B_GAMES, 2) && !S.nearBuilding(w3, i, S.B_HEARTH, 2)) return i
  return -1
})()
for (let k = 0; k < 600; k++) { a3.i = corner; b3.i = corner + 1; S.tick(w3) }
check(S.bondTotal(a3, b3.id) < S.bondTotal(a, b.id), "a corridor builds one slower than the table does (" +
      S.bondTotal(a3, b3.id) + " vs " + S.bondTotal(a, b.id) + ")")

// --- the trap: three charges, then it is scrap ---------------------------------
const w4 = S.newScenario(5, 12, {})
S.tick(w4)
const t = S.cache(w4).traps[0]
check(S.trapCharges(w4, t) === S.TRAP_CHARGES, "a finished trap comes armed with three charges")
let killed = 0, fired = 0
for (let k = 0; k < 6 && w4.build[t] === S.B_TRAP; k++) {
  const foe = S.addUnit(w4, "goblin", t)
  if (S.trapFires(w4, foe)) fired++
  // 3-6 damage against 5 hit points: a goblin sometimes walks off one
  if (w4.units.indexOf(foe) < 0) killed++
}
check(fired === 3, "it fires three times (" + fired + ")")
check(killed >= 1, "and kills most of what it catches (" + killed + " of " + fired + ")")
check(w4.build[t] !== S.B_TRAP, "and then comes apart")
check((w4.stats.trapped || 0) >= 3, "each strike is counted")
const dwarf = S.dwarves(w4)[0]
const t2 = S.cache(w4).traps[0]
if (t2 >= 0 && t2 !== undefined) {
  const hp = dwarf.hp
  dwarf.i = t2
  S.tick(w4)
  check(dwarf.hp >= hp - 1, "a dwarf walking over a trap is not spiked by it")
}

// --- the guard post: they hold it, and they stop working ----------------------
const w5 = S.newScenario(7, 12, {})
S.tick(w5)
const post = S.cache(w5).posts[0]
check(post >= 0 && post !== undefined, "the ready hold has a guard post")
S.rosterMilitia(w5)
const posted = S.dwarves(w5).filter(q => q.militia && q.post >= 0)
check(posted.length > 0, "the militia is assigned to it (" + posted.length + " guards)")
check(S.dwarves(w5).filter(q => !q.militia && q.post >= 0).length === 0, "nobody outside the militia is posted")
// a whole day: they should spend it near the post, and never on a dig
let atPost = 0, working = 0, samples = 0
for (let k = 0; k < S.DAY * 2; k++) {
  S.tick(w5)
  if (k % 10) continue
  for (const q of S.dwarves(w5)) {
    if (!q.militia || !(q.post >= 0)) continue
    samples++
    if (S.dist(q.i, q.post) <= 4) atPost++
    if (q.job && (q.job.k === "dig" || q.job.k === "haul" || q.job.k === "build")) working++
  }
}
check(samples > 0 && atPost / samples > 0.2, "a guard spends their watch near the post (" + Math.round(100 * atPost / samples) + "%)")
check(working === 0, "and takes no work while posted (" + working + " samples working)")

// a second post splits the squads
const spare = (function () {
  for (let i = 0; i < S.NN; i++) if (w5.tile[i] === S.T_OPEN && w5.floor[i] !== 0 && w5.build[i] === 0 && S.dist(i, post) > 10) return i
  return -1
})()
if (spare >= 0) {
  w5.build[spare] = S.B_POST; w5.dirty = true
  S.rosterMilitia(w5)
  const spread = {}
  for (const q of S.dwarves(w5)) if (q.militia && q.post >= 0) spread[q.post] = (spread[q.post] || 0) + 1
  check(Object.keys(spread).length === 2, "two posts split the militia between them")
}

// A guard whose post became unreachable has to let go of the job: `work()` runs
// before `needJob()`, so a job that never ends is a dwarf who never eats. This
// one cost five deaths of thirst across sixteen fortresses.
const w8 = S.newScenario(11, 12, {})
S.tick(w8)
S.rosterMilitia(w8)
const stuck = S.dwarves(w8).filter(q => q.militia && q.post >= 0)[0]
if (stuck) {
  stuck.job = { k: "station", i: stuck.post }
  stuck.path = null
  stuck.i = w8.depot                    // far from the post, with no path
  stuck.thirst = 90
  let released = false
  for (let k = 0; k < 60 && !released; k++) { S.tick(w8); if (!stuck.job || stuck.job.k !== "station") released = true }
  check(released, "a guard who cannot reach their post lets go of the job")
  let drank = false
  for (let k = 0; k < 3000 && !drank; k++) { S.tick(w8); if (stuck.thirst < 30) drank = true }
  check(drank, "and goes and drinks (thirst " + Math.round(stuck.thirst) + ")")
}

// --- the well: water without walking to the water ----------------------------
const w6 = S.newScenario(7, 12, {})
S.tick(w6)
const wells = S.cache(w6).wells
check(wells.length >= 1, "the ready hold has a well" + (wells.length ? "" : " (no water within reach on this map)"))
if (wells.length) {
  check(S.touchesWater(w6, wells[0]), "a well is built at the edge of water")
  // and it cannot be built away from water
  const dry = (function () {
    for (let i = 0; i < S.NN; i++) if (w6.tile[i] === S.T_OPEN && w6.floor[i] !== 0 && w6.build[i] === 0 && !S.touchesWater(w6, i)) return i
    return -1
  })()
  check(dry >= 0 && !S.canDesignate(w6, dry, "build", S.B_WELL), "and nowhere else")
  // a thirsty dwarf uses it
  const thirsty = S.dwarves(w6)[0]
  thirsty.thirst = 90
  thirsty.i = wells[0] + S.W        // start them beside it, as the hold would be
  w6.items = w6.items.filter(it => it.t !== "booze")
  w6.dirty = true
  let used = false
  for (let k = 0; k < 2000 && !used; k++) {
    S.tick(w6)
    if (thirsty.job && thirsty.job.k === "drinkwater" && thirsty.job.i >= 0) used = true
  }
  check(used, "a thirsty dwarf with no booze draws from the well")
}

// --- the floodgate: shut is rock, open is a channel ---------------------------
// The hold's own cistern, gate and well, which is the arrangement the scenario
// builds: the cistern touches both, so the gate is the only way out of it.
const w7 = S.newScenario(7, 12, {})
S.tick(w7)
let gate = -1
for (let i = 0; i < S.NN; i++) if (w7.build[i] === S.B_FLOODGATE) { gate = i; break }
check(gate >= 0, "the ready hold has a floodgate on its cistern")
if (gate >= 0) {
  check(S.touchesWater(w7, gate), "the gate touches the water it holds back")
  // Two identical worlds, one lever apart. Doing it in sequence on one world
  // proved nothing: `spreadLiquids` only acts on even ticks, so with an odd
  // tick every call returns immediately and the shut case passes because
  // nothing anywhere ever moves.
  function runGate(open) {
    const gw = S.newScenario(7, 12, {})
    S.tick(gw)
    let g = -1
    for (let i = 0; i < S.NN; i++) if (gw.build[i] === S.B_FLOODGATE) { g = i; break }
    gw.tick = 2                       // even, or spreadLiquids does nothing
    gw.gatesOpen = open; gw.dirty = true
    gw.liquidBudget = { water: 600, magma: 0 }
    for (let k = 0; k < 60000; k++) { S.spreadLiquids(gw); if (gw.tile[g] === S.T_WATER) return true }
    return false
  }
  check(runGate(true), "an open floodgate lets the cistern through")
  check(!runGate(false), "a shut one holds it back")
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
