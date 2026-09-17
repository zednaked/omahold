// Every preset, built and played, under node.
//
//   node test/presets.js
//
// A preset is a whole fortress built by code nobody looks at again, so a broken
// one is invisible until somebody picks it from the menu. This builds each of
// them, checks it is the fortress its blurb promises, and plays a year to be
// sure it does not throw.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newFromPreset, tick, PRESETS, presetName, presetDesc, cache, dwarves, pop,
  digDepth, iz, bondTotal, isKin, BOND_FRIEND, YEAR, setI18n, countItems }`)()
const I18n = (function () {
  const isrc = fs.readFileSync(path.join(__dirname, "..", "I18n.js"), "utf8").replace(".pragma library", "")
  return new Function(isrc + "; return { t, tf, plural, table, inSeason, STRINGS, TABLES }")()
})()

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

// what each preset is for, which is what its blurb promises
const WANT = {
  classic:  { pop: 7,  scenario: false },
  ready:    { pop: 12, hearths: 1, crystals: 1, games: 2, traps: 2 },
  garrison: { pop: 10, hearths: 0, games: 0, trapsAtLeast: 6 },
  peaceful: { pop: 12, hearths: 2, crystals: 2, games: 4, traps: 0, peaceful: true },
  kinfolk:  { pop: 16, hearths: 2, games: 4, allKin: true, friends: true },
  depths:   { pop: 12, deepTo: 2, trapsAtLeast: 4 },
  siege:    { pop: 8,  hearths: 0, trapsAtLeast: 8 },
}

check(S.PRESETS.length === Object.keys(WANT).length, "every preset is accounted for here (" + S.PRESETS.length + ")")

for (const lang of ["pt", "en"]) {
  S.setI18n(I18n, lang)
  let named = 0
  for (const pr of S.PRESETS) {
    const nm = S.presetName(pr), ds = S.presetDesc(pr)
    if (nm && nm.indexOf("preset.") !== 0 && ds && ds.indexOf("preset.") !== 0) named++
  }
  check(named === S.PRESETS.length, "all " + S.PRESETS.length + " presets have a name and a blurb in " + lang)
}
S.setI18n(I18n, "pt")

for (const pr of S.PRESETS) {
  const want = WANT[pr.id]
  if (!want) { check(false, "unknown preset " + pr.id); continue }
  const w = S.newFromPreset(7, pr.id, 0)
  S.tick(w)
  const c = S.cache(w), ds = S.dwarves(w)
  const label = pr.id.padEnd(9)
  check(S.pop(w) === want.pop, label + " starts with " + want.pop + " dwarves (" + S.pop(w) + ")")
  if (want.scenario === false) check(!w.scenario, label + " is a plain embark, with no wave schedule")
  if (want.peaceful) check(w.peaceful === true && !w.scenario, label + " has no enemies at all")
  for (const [key, list] of [["hearths", c.hearths], ["crystals", c.crystals], ["games", c.games], ["traps", c.traps]]) {
    if (want[key] !== undefined) check(list.length === want[key], label + " has " + want[key] + " " + key + " (" + list.length + ")")
  }
  if (want.trapsAtLeast !== undefined) check(c.traps.length >= want.trapsAtLeast, label + " lines the corridor (" + c.traps.length + " traps)")
  if (want.deepTo !== undefined) {
    check(S.digDepth(w) === want.deepTo, label + " has a shaft down to level " + want.deepTo + " (z" + S.digDepth(w) + ")")
    check(!w.woke[want.deepTo - 1], label + " leaves the level below untouched, so it can still wake")
  }
  if (want.allKin) check(ds.every(u => u.kin && u.kin.length), label + " arrived as families (" + ds.filter(u => u.kin.length).length + "/" + ds.length + ")")
  if (want.friends) {
    let fr = 0
    for (const u of ds) for (const id in (u.bonds || {})) if (u.bonds[id] >= S.BOND_FRIEND) fr++
    check(fr / 2 >= 3, label + " starts with friendships already formed (" + fr / 2 + ")")
  }
  // and it survives being played
  let threw = null
  try { for (let k = 0; k < S.YEAR; k++) S.tick(w) } catch (e) { threw = e }
  check(!threw, label + " plays a year without throwing" + (threw ? ": " + threw.message : ""))
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
