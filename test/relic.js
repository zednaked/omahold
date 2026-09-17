// The relic from the tomb, end to end, under node.
//
//   node test/relic.js
//
// The tomb is a 2% roll on a cell dug at level 1 or below, so a normal run
// almost never opens one — this drives it directly and then checks the whole
// chain: the guard carries the weapon, killing the guard drops it named, a
// dwarf takes it up, it hits harder than steel, it does not wear out, and it
// stays named when its bearer dies.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, tick, dwarves, pop, idx, iz, ix, iy, addUnit, addItem,
  maybeTomb, attack, itemLabel, wearOut, die, itemById, bestItem, passable, deepSpot, W, H, D, N, YEAR, setI18n }`)()

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

const w = S.newScenario(7, 7, {})
S.tick(w)   // one tick so the per-run scratch (claims, counts) exists
const u = S.dwarves(w)[0]

// the tomb, forced: chance() is 2%, so roll until it takes
const deep = S.deepSpot(w, 1)
let tries = 0
while (!w.tomb && tries++ < 4000) S.maybeTomb(w, u, deep)
check(!!w.tomb, "the tomb opens on level 1")

const guard = w.units.filter(q => q.k === "sentinel")[0]
check(!!guard, "something was keeping it")
check(!!(guard && guard.bears && guard.bears.q === 5), "the guard carries a grade-5 weapon")
check(!!(guard && guard.bears && guard.bears.nm), "and that weapon has a name")

// kill it: a dwarf who cannot lose, so the test is about the drop and not the fight
const hero = S.dwarves(w)[1]
hero.skills.fight = 20; hero.hp = hero.maxhp = 500
const nm = guard.bears.nm
for (let k = 0; k < 400 && w.units.indexOf(guard) >= 0; k++) S.attack(w, hero, guard)
check(w.units.indexOf(guard) < 0, "the guard can be killed")
const relic = w.items.filter(it => it.nm === nm)[0]
check(!!relic, "the relic falls where the guard did")
check(!!(relic && relic.q === 5), "it is one grade above steel")
check(S.itemLabel(relic) === nm + ", " + relic.title, "it is called by its name, not by a grade")
check(!!(w.relic && w.relic.nm === nm), "the hold remembers it")

// the best free weapon is the relic, even with steel lying closer
S.addItem(w, "weapon", hero.i, 3)
const want = S.bestItem(w, "weapon", hero)
check(!!(want && want.nm === nm), "a militia dwarf reaches for the relic over steel")

// taking it up, and the name staying on the weapon
const bearer = S.dwarves(w)[2]
bearer.weapon = true; bearer.weaponQ = relic.q; bearer.wnm = relic.nm; bearer.wtitle = relic.title
const before = bearer.wweapon
for (let k = 0; k < 500; k++) S.wearOut(w, bearer, "weapon")
check(bearer.weapon === true && bearer.wweapon === before, "500 swings do not wear the relic out")

const steelBearer = S.dwarves(w)[3]
steelBearer.weapon = true; steelBearer.weaponQ = 3
for (let k = 0; k < 200; k++) S.wearOut(w, steelBearer, "weapon")
check(steelBearer.weapon === false, "a steel weapon still breaks")

const where = bearer.i
S.die(w, bearer, "testado")
const fallen = w.items.filter(it => it.nm === nm && it.i === where)
check(fallen.length === 1, "the relic keeps its name when its bearer dies")

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
