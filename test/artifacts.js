// Artifacts that are about something.
//
//   node test/artifacts.js
//
// An artifact used to be a name and a line from a table — "it bears an image
// of cheese" — which said nothing about the fortress it came out of. A strange
// mood now starts from something that happened, and these check that the thing
// it starts from is real, that it reaches the object, and that it survives a
// save.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newFromPreset, newScenario, tick, setI18n, inspiration, artScene, artifactName,
  dwarves, die, serialize, deserialize, maybeStrangeMood, YEAR, DAY, lastName, first, pop, PRESETS, presetName }`)()
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

// --- the heirloom every ready hold owns ---------------------------------------
for (const id of ["ready", "kinfolk", "depths"]) {
  const w = S.newFromPreset(7, id, 0)
  S.tick(w)
  const a = w.artifacts[0]
  check(!!a, id + " starts with an heirloom")
  if (a) {
    check(!!a.about && !!a.about.k, id + "'s heirloom is about something (" + (a.about || {}).k + ")")
    check(a.desc.indexOf(".") > 0 && a.desc.split(". ").length >= 2, id + "'s heirloom has a scene, not just a material")
    check(!!S.dwarves(w).find(u => u.name === a.maker), id + "'s heirloom was made by one of its own")
  }
}
const plain = S.newFromPreset(7, "classic", 0)
check(plain.artifacts.length === 0, "a classic embark starts with no history")

// --- every kind of inspiration has a sentence ---------------------------------
const kinds = ["lost", "lost_kin", "lost_friend", "kin", "friend", "rival", "repelled", "siege", "tomb",
               "relic", "pact", "grudge", "depths", "baron", "caravan", "artifact", "magma", "graves", "founding"]
const w2 = S.newScenario(7, 12, {})
S.tick(w2)
let blank = [], raw = []
for (const k of kinds) {
  const line = S.artScene(w2, { k: k, who: "Erok Rochaviva", year: 3 })
  if (!line || line.length < 10) blank.push(k)
  if (/\{\d\}/.test(line) || line.indexOf("art.sc.") === 0) raw.push(k)
}
check(blank.length === 0, "all " + kinds.length + " kinds of inspiration have a scene" + (blank.length ? " — " + blank.join(", ") : ""))
check(raw.length === 0, "and none of them leak a placeholder or a key" + (raw.length ? " — " + raw.join(", ") : ""))
// and in English too
S.setI18n(I18n, "en")
let rawEn = []
for (const k of kinds) { const line = S.artScene(w2, { k: k, who: "Erok Stoneborn", year: 3 }); if (/\{\d\}/.test(line) || line.indexOf("art.sc.") === 0) rawEn.push(k) }
check(rawEn.length === 0, "the same in English" + (rawEn.length ? " — " + rawEn.join(", ") : ""))
S.setI18n(I18n, "pt")

// --- a name can come from the person it is about -------------------------------
let named = 0
for (let k = 0; k < 60; k++) {
  const parts = S.artifactName(w2, "stone", { k: "friend", who: "Erok Rochaviva" }).split("|")
  if (parts[1].indexOf("Rochaviva") >= 0) named++
}
check(named > 5 && named < 55, "about half the time the title carries their house name (" + named + "/60)")
check(S.lastName("Erok Rochaviva") === "Rochaviva", "the house name is the last word")
check(S.artifactName(w2, "stone", { k: "founding", who: "Salão de Bronze" }).split("|")[1].indexOf("Bronze") < 0,
      "the founding does not put the fortress name in the title")

// --- what a dwarf cannot stop thinking about ----------------------------------
const w3 = S.newFromPreset(3, "kinfolk", 0)
for (let k = 0; k < S.YEAR; k++) S.tick(w3)
const mourner = S.dwarves(w3)[0]
const lost = S.dwarves(w3)[1]
const lostName = lost.name
// friends and not kin: in "Full house" they are usually relatives too, and
// then the loss is remembered as kin rather than as a friend
mourner.bonds = {}; mourner.bonds[lost.id] = 60
mourner.kin = (mourner.kin || []).filter(id => id !== lost.id)
lost.kin = (lost.kin || []).filter(id => id !== mourner.id)
S.die(w3, lost, "testado")
check(mourner.lostFriend === lostName, "a dwarf remembers which friend they lost")
let aboutThem = 0
for (let k = 0; k < 200; k++) { const ins = S.inspiration(w3, mourner); if (ins.who === lostName) aboutThem++ }
check(aboutThem > 20, "and a strange mood reaches for them (" + Math.round(aboutThem / 2) + "% of the time)")

// --- it reaches the object, and survives a save -------------------------------
const w4 = S.newScenario(11, 12, {})
S.tick(w4)
const before = w4.artifacts.length
let made = null
for (let k = 0; k < S.YEAR * 4 && !made; k++) {
  S.tick(w4)
  if (w4.artifacts.length > before) made = w4.artifacts[w4.artifacts.length - 1]
}
check(!!made, "a hold left alone makes an artifact eventually")
if (made) {
  check(!!made.about, "and it is about something (" + made.about.k + ")")
  const back = S.deserialize(S.serialize(w4))
  const same = back.artifacts[back.artifacts.length - 1]
  check(!!same.about && same.about.k === made.about.k, "which survives a save")
  check(same.desc === made.desc, "with its scene intact")
}
// an old save with no `about` at all does not break
const legacy = S.newScenario(5, 12, {})
S.tick(legacy)
for (const a of legacy.artifacts) delete a.about
const revived = S.deserialize(S.serialize(legacy))
check(revived.artifacts.every(a => a.about === null), "an artifact saved before this gets about = null, not undefined")

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
