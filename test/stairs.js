// Going down, which has broken three times.
//
//   node test/stairs.js
//
// Every one of these was a player report, and every one left a level nobody
// could reach with no way to fix it from inside the game:
//
//   1. "s" on a built staircase refused silently when a dig was already
//      pending on the rock below, so drawing the room first bricked the level.
//   2. z0 is the magma level, so the refusal was correct but mute.
//   3. A staircase standing over an open cavern floor went nowhere: descending
//      needs a stair at both ends, and "s" refused it for having nothing to
//      dig. There was no way at all to reach a cavern under a shaft.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, tick, designate, canDesignate, desigOk, reachableFrom, dwarves,
  idx, ix, iy, iz, N, NN, W, D, DG_STAIR, DG_DIG, DG_NONE, B_STAIR, B_NONE, T_OPEN, T_MAGMA, T_WATER, T_STONE,
  F_NONE, F_STONE, digDepth, seenAt, carve, tileName, setI18n, solid }`)()
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

// a staircase on the hold's own stair column, with a level below it to play with
function fixture() {
  const w = S.newScenario(7, 12, {})
  S.tick(w)
  let stair = -1
  for (let i = 0; i < S.NN; i++) {
    if (w.build[i] !== S.B_STAIR || S.iz(i) <= 1) continue
    if (w.build[i - S.N] === S.B_STAIR || w.desig[i - S.N] === S.DG_STAIR) continue
    stair = i; break
  }
  return { w: w, stair: stair, under: stair - S.N }
}

// --- rock below: the ordinary case -------------------------------------------
{
  const { w, stair, under } = fixture()
  check(stair >= 0, "found a staircase with an undug cell below it")
  w.tile[under] = S.T_STONE; w.desig[under] = S.DG_NONE; w.dirty = true
  check(S.canDesignate(w, stair, "stair"), "\"s\" is accepted over rock")
  S.designate(w, stair, "stair")
  check(w.desig[under] === S.DG_STAIR, "and the rock below is ordered cut")
}

// --- a dig already pending there: the stair wins ------------------------------
{
  const { w, stair, under } = fixture()
  w.tile[under] = S.T_STONE; w.desig[under] = S.DG_DIG; w.dirty = true
  check(S.canDesignate(w, stair, "stair"), "\"s\" is accepted over a pending dig")
  S.designate(w, stair, "stair")
  check(w.desig[under] === S.DG_STAIR, "and the stair takes the cell over")
}

// --- an open cavern floor below: the step gets built --------------------------
{
  const { w, stair, under } = fixture()
  S.carve(w, under)                       // an open, floored cell, no stair
  w.build[under] = S.B_NONE; w.desig[under] = S.DG_NONE; w.dirty = true
  check(w.tile[under] === S.T_OPEN && w.floor[under] !== S.F_NONE, "the cell below is open floor")
  check(S.canDesignate(w, stair, "stair"), "\"s\" is accepted over an open floor")
  S.designate(w, stair, "stair")
  check(w.desig[under] === S.DG_STAIR, "and a step is ordered built on it")
  check(!!S.desigOk(w)[under], "which is workable — the dwarf works from the staircase above")
  // and the hold actually does it, and the level opens
  let built = -1
  for (let k = 0; k < 6000 && built < 0; k++) { S.tick(w); if (w.build[under] === S.B_STAIR) built = k }
  check(built >= 0, "the hold builds it (" + (built >= 0 ? built + " ticks" : "never") + ")")
  if (built >= 0) {
    const reach = S.reachableFrom(w, [w.depot])
    check(!!reach[under], "and the cell below is now reachable from the gate")
    check(S.digDepth(w) <= S.iz(under), "the hold counts as having reached that level")
  }
}

// --- already ordered, already built: no double order -------------------------
{
  const { w, stair, under } = fixture()
  w.desig[under] = S.DG_STAIR; w.dirty = true
  check(!S.canDesignate(w, stair, "stair"), "\"s\" is refused when the step is already ordered")
  w.desig[under] = S.DG_NONE; w.build[under] = S.B_STAIR; w.tile[under] = S.T_OPEN; w.floor[under] = S.F_STONE; w.dirty = true
  check(!S.canDesignate(w, stair, "stair"), "and when it is already built")
}

// --- liquid below: refused, because cutting it floods the hold ----------------
for (const [tile, name] of [[S.T_MAGMA, "magma"], [S.T_WATER, "water"]]) {
  const { w, stair, under } = fixture()
  w.tile[under] = tile; w.desig[under] = S.DG_NONE; w.dirty = true
  check(!S.canDesignate(w, stair, "stair"), "\"s\" is refused over " + name)
  S.designate(w, stair, "stair")
  check(w.desig[under] !== S.DG_STAIR, "and nothing is ordered into it")
}

// --- the bottom of the world --------------------------------------------------
{
  const { w } = fixture()
  let bottom = -1
  for (let i = 0; i < S.N; i++) if (w.tile[i] === S.T_OPEN && w.floor[i] !== S.F_NONE) { bottom = i; break }
  if (bottom >= 0) {
    w.build[bottom] = S.B_STAIR; w.dirty = true
    check(!S.canDesignate(w, bottom, "stair"), "\"s\" is refused on level 0 — there is nothing below it")
  }
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
