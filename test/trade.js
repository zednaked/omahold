// Trading with the caravan.
//
//   node test/trade.js
//
// The caravan used to be an automaton: it took up to four things it picked
// itself and left food in a fixed ratio, so crafts and jewels were worth only
// the wealth number they added. These check that it is now a deal — two sides,
// their arithmetic, dwarves carrying the offer, and nothing moving until the
// whole offer has arrived.
const fs = require("fs"), path = require("path")
const src = fs.readFileSync(path.join(__dirname, "..", "sim.js"), "utf8").replace(".pragma library", "")
const S = new Function(src + `; return { newScenario, tick, setI18n, addItem, countItems, dwarves, caravanDay, date,
  tradeTable, tradeValue, tradeSpare, tradeOffer, tradeWant, tradeClear, tradeAccepts, tradeOwed, tradeSettle, holdTrade,
  TRADE_SELL, TRADE_BUY, TRADE_MARGIN, ITEM_VALUE, YEAR, DAY, addUnit, nearFree, pop }`)()
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

// a hold with merchants camped at the depot
function camped(seed) {
  const w = S.newScenario(seed || 7, 12, {})
  S.tick(w)
  w.caravan = { stage: "trade", spot: w.depot, arrived: 3, days: 1, n: 3 }
  w.trade = { sell: {}, buy: {}, delivered: {}, closed: false }
  for (let k = 0; k < 3; k++) S.addUnit(w, "merchant", S.nearFree(w, w.depot, 2))
  for (let k = 0; k < 6; k++) S.addItem(w, "craft", w.depot)
  // `countItems` reads the per-tick counts, so a fresh item does not exist as
  // far as the hold is concerned until the next tick has run
  w.dirty = true
  S.tick(w)
  return w
}

// --- the table ----------------------------------------------------------------
{
  const w = camped()
  const tr = S.tradeTable(w)
  check(!!tr && !tr.closed, "a camped caravan opens a table")
  const spare = S.tradeSpare(w, "craft")
  check(spare === S.countItems(w, "craft"), "spare starts as everything the hold has (" + spare + ")")
  S.tradeOffer(w, "craft", 1)
  check(tr.sell.craft === 1, "offering puts one on the table")
  check(S.tradeSpare(w, "craft") === spare - 1, "and it is no longer spare")
  while (S.tradeOffer(w, "craft", 1)) {}
  check(tr.sell.craft === spare, "the table cannot promise more than the hold owns (" + tr.sell.craft + ")")
  S.tradeOffer(w, "craft", -1)
  check(tr.sell.craft === spare - 1, "and it can be taken back off")
  S.tradeClear(w)
  check(!tr.sell.craft && S.tradeValue(w, tr.sell) === 0, "clearing empties the table")
}

// --- their arithmetic ---------------------------------------------------------
{
  const w = camped()
  const tr = S.tradeTable(w)
  check(!S.tradeAccepts(w), "an empty table is not a deal")
  S.tradeWant(w, "food", 1)
  check(!S.tradeAccepts(w), "asking for something and offering nothing is refused")
  S.tradeClear(w)
  for (let k = 0; k < 4; k++) S.tradeOffer(w, "craft", 1)          // 4 x 12 = 48
  const give = S.tradeValue(w, tr.sell)
  // just inside their margin, then just outside it
  const affordable = Math.floor(give * S.TRADE_MARGIN / S.ITEM_VALUE.food)
  for (let k = 0; k < affordable; k++) S.tradeWant(w, "food", 1)
  check(S.tradeAccepts(w), "they take a deal inside their margin (" + S.tradeValue(w, tr.buy) + " for " + give + ")")
  for (let k = 0; k < 6; k++) S.tradeWant(w, "food", 1)
  check(!S.tradeAccepts(w), "and refuse one past it (" + S.tradeValue(w, tr.buy) + " for " + give + ")")
}

// --- dwarves carry it, and nothing moves until it is all there ----------------
{
  const w = camped(11)
  const tr = S.tradeTable(w)
  // the player's deal, which is what the trade page files: the hold's own
  // convenience deal is carried by the economy, this one outranks the pick
  for (let k = 0; k < 3; k++) S.tradeOffer(w, "craft", 1, true)
  S.tradeWant(w, "food", 8, true)
  check(S.tradeAccepts(w), "a deal they accept is on the table")
  const foodBefore = S.countItems(w, "food"), craftBefore = S.countItems(w, "craft")
  let owedLeft = Object.keys(S.tradeOwed(w)).length
  check(owedLeft > 0, "the offer starts undelivered")
  let closedAt = -1
  for (let k = 0; k < 4000 && closedAt < 0; k++) { S.tick(w); if (tr.closed) closedAt = k }
  check(closedAt >= 0, "the hold carries the whole offer to the camp (" + (closedAt >= 0 ? closedAt + " ticks" : "never") + ")")
  if (closedAt >= 0) {
    S.tick(w)                                  // one more, so the counts include the settlement
    check(S.countItems(w, "craft") === craftBefore - 3, "the crafts left the fortress")
    check(S.countItems(w, "food") >= foodBefore + 8, "and the food arrived (" + (S.countItems(w, "food") - foodBefore) + ")")
    check((w.stats.traded || 0) === 3, "the trade is counted")
    check(!S.tradeAccepts(w) || tr.closed, "the table closes after settling")
  }
}

// --- settling is idempotent ---------------------------------------------------
{
  const w = camped(9)
  const tr = S.tradeTable(w)
  S.tradeOffer(w, "craft", 2)
  S.tradeWant(w, "food", 4)
  tr.delivered = { craft: 2 }
  S.tick(w)
  const before = S.countItems(w, "food")
  check(S.tradeSettle(w), "a fully delivered offer settles")
  S.tick(w)
  const after = S.countItems(w, "food")
  check(!S.tradeSettle(w), "and settling again does nothing")
  S.tick(w)
  check(S.countItems(w, "food") === after, "the goods are not handed over twice (" + before + " → " + after + ")")
}

// --- the hold trades for itself when the player says nothing -------------------
{
  const w = camped(13)
  const tr = S.tradeTable(w)
  check(!tr.byPlayer, "an untouched table belongs to nobody yet")
  S.holdTrade(w)
  const sells = Object.keys(tr.sell).length, buys = Object.keys(tr.buy).length
  check(sells > 0 && buys > 0, "the hold builds its own deal (" + sells + " kinds out, " + buys + " in)")
  check(S.tradeAccepts(w), "and one the merchants will take")
  // but not over the player
  const w2 = camped(13)
  const tr2 = S.tradeTable(w2)
  S.tradeWant(w2, "food", 2, true)
  S.holdTrade(w2)
  check(Object.keys(tr2.sell).length === 0, "it keeps its hands off a table the player has touched")
  // including one the player deliberately emptied
  const w3 = camped(13)
  const tr3 = S.tradeTable(w3)
  S.tradeClear(w3, true)
  S.holdTrade(w3)
  check(Object.keys(tr3.buy).length === 0, "and one the player cleared on purpose")
}

// --- a deal they refuse is never carried --------------------------------------
{
  const w = camped(3)
  S.tradeOffer(w, "craft", 1)
  S.tradeWant(w, "bar", 40)                    // wildly over the margin
  check(!S.tradeAccepts(w), "a greedy table is refused")
  // measured on the deliveries, not on the stock: a working fortress makes and
  // uses crafts while the clock runs
  const tr = S.tradeTable(w)
  for (let k = 0; k < 600; k++) S.tick(w)
  check(Object.keys(tr.delivered || {}).length === 0, "and nobody carries anything to the camp")
}

// --- they leave on the fifth day, paying for what arrived ---------------------
{
  const w = camped(5)
  const tr = S.tradeTable(w)
  tr.delivered = { craft: 2 }
  w.caravan.days = 4
  const before = S.countItems(w, "food") + S.countItems(w, "booze")
  S.caravanDay(w)
  S.tick(w)                                    // let the counts catch up
  check(w.caravan.stage === "leave", "the caravan leaves on the fifth day")
  check(S.countItems(w, "food") + S.countItems(w, "booze") > before,
        "and pays for the half a deal that arrived in time")
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
