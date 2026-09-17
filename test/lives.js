// The chronicle read back as a biography.
//
//   node test/lives.js
//
// The Legends page has everything that ever happened, in order, which is a
// record rather than a story — the story is what happened to somebody. These
// check the two functions the Lives page is built on, and that the hold
// actually writes lines worth reading back.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newFromPreset, tick, lives, lifeLines, dwarves, pop, YEAR, setI18n,
  legend, die, dwarfName, BOND_FRIEND }`)()
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

// "Full house" is the preset built for this: families, friendships, and enough
// of them that something is bound to happen to someone.
const w = S.newFromPreset(3, "kinfolk", 0)
const started = S.pop(w)
for (let k = 0; k < S.YEAR * 2; k++) S.tick(w)

const ls = S.lives(w)
const living = ls.filter(l => l.alive), dead = ls.filter(l => !l.alive)
check(ls.length >= started, "every dwarf the hold remembers is listed (" + ls.length + ")")
check(living.length === S.pop(w), "the living are the ones still alive (" + living.length + ")")
check(dead.length === (w.dead || []).length, "and the dead are all there (" + dead.length + ")")
check(ls.slice(0, living.length).every(l => l.alive), "the living come first")
check(living.every(l => l.u && l.u.name === l.name), "a living entry carries the dwarf")
check(dead.every(l => l.how && typeof l.t === "number"), "a dead entry carries how and when")

// names are unique enough for a substring match to be a biography
const names = {}
for (const l of ls) names[l.name] = (names[l.name] || 0) + 1
const dupes = Object.keys(names).filter(n => names[n] > 1)
check(dupes.length === 0, "names are unique, so matching by name is safe" + (dupes.length ? " — " + dupes.join(", ") : ""))

// the chronicle has something to say about most of them
let told = 0
for (const l of ls) if (S.lifeLines(w, l.name).length) told++
check(told > ls.length / 3, told + " of " + ls.length + " lives have lines in the chronicle")

// every line returned really is about them, and is in chronological order
let wrong = 0, unsorted = 0
for (const l of ls) {
  const story = S.lifeLines(w, l.name)
  for (const e of story) if (e.m.indexOf(l.name) < 0) wrong++
  for (let k = 1; k < story.length; k++) if (story[k].t < story[k - 1].t) unsorted++
}
check(wrong === 0, "every line of a life mentions that dwarf")
check(unsorted === 0, "and the lines stay in the order they happened")

// a death does not erase the life
const victim = S.dwarves(w)[0]
const before = S.lifeLines(w, victim.name).length
const nm = victim.name
S.die(w, victim, "testado")
check(S.lifeLines(w, nm).length >= before, "a dwarf's lines outlive them")
check(S.lives(w).some(l => l.name === nm && !l.alive), "and they move to the dead")

// an empty hold does not throw
const fresh = S.newFromPreset(5, "classic", 0)
check(S.lives(fresh).length > 0 && S.lifeLines(fresh, "nobody at all").length === 0,
      "a name nobody has gives an empty life, not an error")

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
