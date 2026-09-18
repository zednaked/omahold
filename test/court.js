// The lost court, end to end, under node.
//
//   node test/court.js
//
// A court only comes up when a shaft reaches level 1 and nothing woke there, so
// a normal run rarely sees one. This drives it directly: the envoy walks up and
// asks, paying takes the goods away and gives back something that cannot be
// made, and refusing costs what refusing should cost.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, tick, dwarves, pop, addItem, courtArrive, courtTick, actEnvoy,
  courtGoods, payTribute, wakeOdds, wakeChance, revealLevel, seenAt, date, unitById, idx, iz, N, DAY, YEAR, D,
  kingTick, dwarves, pop, serialize, deserialize, KING_STAY }`)()

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

// bring an envoy up and walk them to the depot, the way a real run would
function summon(seed, gift) {
  const w = S.newScenario(seed, 7, {})
  S.tick(w)
  // pick the gift by pinning the rng draw courtTick makes: easier to just run
  // until the gift we want comes up, since each run is independent
  if (!S.courtArrive(w, 1)) return null
  const envoy = S.unitById(w, w.court.envoy)
  for (let k = 0; k < 3000 && !w.court.said; k++) { S.actEnvoy(w, envoy); envoy.wait = 0 }
  if (!w.court.said) return null
  return { w: w, envoy: envoy }
}

let got = null
for (let seed = 1; seed <= 24 && !got; seed++) got = summon(seed)
check(!!got, "an envoy comes up and reaches the depot")
const w = got.w, c = w.court
check(!!(c.race && c.king), "they speak for a named people and a named king")
check(c.n > 0 && S.courtGoods(w, c.k) >= 0, "they ask for a countable quantity of real goods")

check(c.n > S.courtGoods(w, c.k), "they ask for more than the hold already has")

// nothing happens while the hold has not got it
const before = JSON.stringify(w.court)
S.courtTick(w, S.date(w))
check(JSON.stringify(w.court) === before, "an unpaid tribute inside the deadline just waits")

// pay it: the goods leave the fortress
while (S.courtGoods(w, c.k) < c.n) S.addItem(w, c.k, w.depot)
const had = S.courtGoods(w, c.k)
S.courtTick(w, S.date(w))
check(S.courtGoods(w, c.k) === had - c.n, "paying takes the goods out of the hold")
check(w.court === null, "and the envoy's business is finished")
const leaving = w.units.filter(q => q.k === "envoy")[0]
check(!!(leaving && leaving.going === c.z), "the envoy heads back down, not out through the gate")
for (let k = 0; k < 4000 && w.units.indexOf(leaving) >= 0; k++) { S.actEnvoy(w, leaving); leaving.wait = 0 }
check(w.units.every(q => q.k !== "envoy"), "and is gone once they are home")
check((w.stats.tributes || 0) === 1, "the tribute is counted")

// each of the three gifts, driven until it comes up
const seen = {}
for (let seed = 1; seed <= 120 && Object.keys(seen).length < 3; seed++) {
  const g = summon(seed)
  if (!g) continue
  const gw = g.w, gc = gw.court
  while (S.courtGoods(gw, gc.k) < gc.n) S.addItem(gw, gc.k, gw.depot)
  const z = gc.z
  S.courtTick(gw, S.date(gw))
  if (gw.pact) seen.pact = true
  else if (gw.log.some(e => /aço das suas próprias|steel from their own/.test(e.m))) seen.steel = true
  else if (gw.log.some(e => /mostram o nível|show level/.test(e.m))) { seen.map = true; check(S.seenAt(gw, z * S.N), "the map gift lifts the fog off the whole level") }
}
check(!!seen.pact, "a pact is one of the things they give back")
check(!!seen.steel, "steel from their own forges is another")
check(!!seen.map, "the map of their level is the third")

// a pact really does put the deep back to sleep, and a grudge makes it worse
const pw = S.newScenario(3, 7, {})
check(S.wakeOdds(pw, 1) === S.wakeChance(1), "with no history, the odds are the plain ones")
pw.pact = 1
check(S.wakeOdds(pw, 1) === 0, "a pact puts the deep back to sleep")
pw.pact = 0; pw.grudge = 1
check(S.wakeOdds(pw, 1) === S.wakeChance(1) * 2, "a grudge doubles what wakes")

// refusing: the deadline passes, they go home, something comes up instead
let rw = null
for (let seed = 30; seed <= 60 && !rw; seed++) { const g = summon(seed); if (g) rw = g }
check(!!rw, "a second envoy can be summoned to refuse")
if (rw) {
  const gw = rw.w
  gw.court.since = gw.tick - S.DAY * 16
  const foesBefore = gw.units.filter(u => u.k === "crawler" || u.k === "sentinel").length
  S.courtTick(gw, S.date(gw))
  check(gw.court === null, "a refused envoy leaves")
  check(gw.grudge === 1, "and the deep remembers it")
  check(gw.units.filter(u => u.k === "crawler" || u.k === "sentinel").length > foesBefore,
        "something comes up in the envoy's place")
  check((gw.stats.tributesFailed || 0) === 1, "the refusal is counted")
}

// --- the king comes up himself ------------------------------------------------
// The lost king used to be a name in the envoy's sentence: "in the name of king
// so-and-so". A hold that pays its tribute is a hold worth visiting, and what
// he makes of the visit depends on what he finds when he gets here.
function crowned(seed) {
  const w = S.newScenario(seed, 12, {})
  S.tick(w)
  w.crown = { race: "Ourofria", king: "Mosen Ourolonga", z: 1, since: w.tick, due: w.tick, came: 0 }
  return w
}
{
  const w = crowned(7)
  S.kingTick(w, S.date(w))
  const king = w.units.filter(u => u.k === "king")[0]
  check(!!king, "the king climbs out when he is due")
  check(!!(king && king.name === "Mosen Ourolonga"), "and he is the king the envoy spoke for")
  check(w.units.filter(u => u.k === "kingsguard").length === 2, "with two of his guard")
  check(!!w.crown.came, "the visit is recorded")
  const before = S.pop(w)
  for (let k = 0; k < 400; k++) S.tick(w)
  check(S.pop(w) === before, "nobody is hurt by the visit")
  check(S.dwarves(w).some(u => u.thoughts.some(t => /rei/.test(t.m))), "and the hold talks about having seen him")
}
{
  const w = crowned(11)
  S.kingTick(w, S.date(w))
  w.crown.wealthThen = 1; w.crown.popThen = 1
  w.crown.came = w.tick - S.DAY * (S.KING_STAY + 1)
  const artsBefore = w.artifacts.length
  S.kingTick(w, S.date(w))
  check(w.artifacts.length === artsBefore + 1, "a hold that grew is given a named weapon")
  const gift = w.items.filter(it => it.nm)[0]
  check(!!gift && gift.q === 4, "forged above steel, below the tomb's relic (" + (gift ? gift.q : "—") + ")")
  check(w.crown === null, "and the visit is over")
}
{
  const w = crowned(3)
  S.kingTick(w, S.date(w))
  w.crown.wealthThen = 1e9; w.crown.popThen = S.pop(w)
  w.crown.came = w.tick - S.DAY * (S.KING_STAY + 1)
  S.kingTick(w, S.date(w))
  check(!!w.blessed, "a hold that held its ground is blessed instead")
}
{
  const w = crowned(5)
  S.kingTick(w, S.date(w))
  w.crown.wealthThen = 1e9; w.crown.popThen = 100
  w.crown.came = w.tick - S.DAY * (S.KING_STAY + 1)
  S.kingTick(w, S.date(w))
  check(!w.blessed, "a hold that fell apart gets neither")
  check(S.dwarves(w).some(u => u.thoughts.some(t => /impressionou/.test(t.m))), "and they feel it")
}
{
  const w = crowned(7)
  S.kingTick(w, S.date(w))
  const back = S.deserialize(S.serialize(w))
  check(!!(back.crown && back.crown.king === w.crown.king), "a visit in progress survives a save")
  check(back.units.filter(u => u.k === "king").length === 1, "and so does the king")
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
