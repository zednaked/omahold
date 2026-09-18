// The infirmary, the pen, and the crown.
//
//   node test/court2.js
//
// Three things a fortress grows into: somewhere to put the badly hurt, animals
// that are nobody's job, and what happens after "legendary" — which used to be
// the end of the game rather than a promotion.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, newFromPreset, tick, setI18n, cache, dwarves, pop, date, die,
  wounded, woundMul, skillMul, hospitalFor, branchRest, branchTend, unitAt, addUnit, nearFree, penTick, livestock,
  actBeast, beastDied, becomeCapital, capitalTick, royalHeld, pickBaron, unitById, serialize, deserialize,
  B_HOSPITAL, B_PEN, WOUND_AT, DAY, YEAR, ROYAL_DELAY, idx, ix, iy, iz, NN, F_GRASS, F_MOSS }`)()
const I18n = (function () {
  const isrc = fs.readFileSync(path.join(__dirname, "..", "I18n.js"), "utf8").replace(".pragma library", "")
  return new Function(isrc + "; return { t, tf, plural, table, inSeason, STRINGS, TABLES }")()
})()
S.setI18n(I18n, "pt")

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

// --- wounds -------------------------------------------------------------------
{
  const w = S.newScenario(7, 12, {})
  S.tick(w)
  check(S.cache(w).hospital.length >= 2, "the ready hold has infirmary beds (" + S.cache(w).hospital.length + ")")
  const u = S.dwarves(w)[0]
  u.hp = u.maxhp
  check(!S.wounded(u), "a whole dwarf is not wounded")
  check(S.woundMul(u) === 1, "and works at full speed")
  u.hp = Math.floor(u.maxhp * S.WOUND_AT)
  check(S.wounded(u), "past a third of their hit points they are")
  check(S.woundMul(u) === 0.5, "and work at half speed")
  const fast = S.skillMul(u, "mine")
  u.hp = u.maxhp
  check(S.skillMul(u, "mine") === fast * 2, "which reaches the actual work rate")

  // a scratch mends itself; a bad wound does not
  const scratched = S.dwarves(w)[1], badly = S.dwarves(w)[2]
  scratched.hp = scratched.maxhp - 1; scratched.hunger = 0
  badly.hp = 1; badly.hunger = 0
  // keep the badly hurt one away from any bed, so only the self-healing is tested
  const far = (function () { for (let i = 0; i < S.NN; i++) if (w.tile[i] === 0 && w.floor[i] !== 0 && w.build[i] === 0) return i; return -1 })()
  for (let k = 0; k < 300; k++) { badly.i = far; badly.job = null; badly.hunger = 0; S.tick(w) }
  check(scratched.hp > scratched.maxhp - 1, "a scratch closes on its own")
  check(badly.hp <= 1, "a bad wound does not (" + badly.hp + ")")
}

// --- somebody tends them ------------------------------------------------------
{
  const w = S.newScenario(11, 12, {})
  S.tick(w)
  const hurt = S.dwarves(w)[0]
  hurt.hp = 2; hurt.hunger = 0; hurt.thirst = 0
  let inBed = false, mended = false
  for (let k = 0; k < 6000 && !mended; k++) {
    S.tick(w)
    if (hurt.job && hurt.job.k === "rest") inBed = true
    if (hurt.hp > 2) mended = true
  }
  check(inBed, "a wounded dwarf takes to an infirmary bed")
  check(mended, "and somebody tends them (" + hurt.hp + " hp)")
  check((w.stats.tended || 0) > 0, "the tending is counted")
}

// A standing job must give way to thirst. `work()` runs before `needJob()`, so
// this has bitten twice: a guard holding an unreachable post, and then a dwarf
// lying in an infirmary bed who died of thirst with the cellar four steps away.
{
  const w = S.newScenario(7, 12, {})
  S.tick(w)
  const bed = S.cache(w).hospital[0]
  const u = S.dwarves(w)[0]
  u.hp = 2                                   // wounded, so they want the bed
  u.i = bed
  u.job = { k: "rest", i: bed, claims: true, prog: 0 }
  u.thirst = 90
  let left = false
  for (let k = 0; k < 400 && !left; k++) { S.tick(w); if (!u.job || u.job.k !== "rest") left = true }
  check(left, "a wounded dwarf leaves the bed when they are thirsty")
  let drank = false
  for (let k = 0; k < 3000 && !drank; k++) { S.tick(w); if (u.thirst < 30) drank = true }
  check(drank, "and drinks (thirst " + Math.round(u.thirst) + ")")
  check(u.hp >= 2, "without getting worse for it (" + u.hp + " hp)")
}

// --- the pen ------------------------------------------------------------------
{
  const w = S.newFromPreset(7, "peaceful", 0)
  S.tick(w)
  check(S.cache(w).pens.length >= 1, "the ready hold has a pen")
  let beasts = 0
  for (let k = 0; k < S.DAY * 10; k++) { S.tick(w); beasts = S.livestock(w) }
  check(beasts > 0, "the caravan brings livestock to a hold with a pen (" + beasts + ")")
  check(w.units.filter(u => u.k === "goat" || u.k === "cat").every(u => !!u.name), "every animal has a name")
  check((w.stats.milked || 0) > 0, "goats on grass feed the hold (" + (w.stats.milked || 0) + ")")
  // an animal nobody owns is still missed; an owned one is grieved
  const cat = w.units.filter(u => u.k === "cat")[0] || S.addUnit(w, "cat", w.depot)
  cat.name = "Fuligem"
  const keeper = S.dwarves(w)[0]
  cat.owner = keeper.id
  const griefBefore = keeper.grief || 0
  S.beastDied(w, cat, "testado")
  check((keeper.grief || 0) > griefBefore, "losing an animal you kept is grief, not a number")
  check(keeper.thoughts.some(t => /Fuligem/.test(t.m)), "and it is remembered by name")
}

// --- the capital --------------------------------------------------------------
{
  const w = S.newScenario(7, 12, {})
  S.tick(w)
  w.baron = S.pickBaron(w).id
  const capBefore = w.popCap
  S.becomeCapital(w)
  check(!!w.capital, "a legendary hold becomes a capital")
  check(w.popCap > capBefore, "which everyone wants to move to (" + capBefore + " → " + w.popCap + ")")
  const king = S.unitById(w, w.monarch)
  check(!!king, "and the baron is raised to king")
  check(w.baron === 0, "leaving the barony vacant")
  check(!!w.royalRaid, "the goblins are given a date")

  // the crown passes
  S.die(w, king, "testado")
  S.capitalTick(w, S.date(w))
  const heir = S.unitById(w, w.monarch)
  check(!!heir && heir.id !== king.id, "a dead king is succeeded")

  // the royal siege, and holding it
  w.royalRaid = w.tick
  w.royalWarned = 1
  const goblinsBefore = w.units.filter(u => u.k === "goblin").length
  S.capitalTick(w, S.date(w))
  check(w.units.filter(u => u.k === "goblin").length > goblinsBefore, "the royal siege arrives in one piece")
  check(!S.royalHeld(w), "and is not held while it is still standing")
  w.units = w.units.filter(u => u.k !== "goblin")
  w.raid = null
  w.tick += S.DAY * 2
  check(S.royalHeld(w), "holding it is the last thing the game asks")

  const back = S.deserialize(S.serialize(w))
  check(back.capital === w.capital && back.monarch === w.monarch, "the crown survives a save")
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
