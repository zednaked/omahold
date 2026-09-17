// What every surface that draws the world has to agree on.
//
//   node test/surfaces.js
//
// Two bugs found this way, both reported by a player rather than a test: the
// corner window drew no fog at all (so it showed the caverns and the magma the
// panel was hiding, which makes the fog pointless since the window is always on
// screen), and a building added to the simulation stayed invisible on a surface
// nobody remembered to update. Both are questions about the source, so this
// reads the source.
const fs = require("fs"), path = require("path")
const ROOT = path.join(__dirname, "..")
const sim = fs.readFileSync(path.join(ROOT, "sim.js"), "utf8")

let passed = 0, failed = 0
function check(cond, what) {
  if (cond) { passed++; console.log("  ok    " + what) }
  else { failed++; console.log("  FAIL  " + what) }
}

// every building the player can order, from the one table that defines them
const built = []
for (const m of sim.matchAll(/BUILD_INFO\[(B_[A-Z_]+)\]\s*=/g)) built.push(m[1])
check(built.length >= 20, "found the buildings in sim.js (" + built.length + ")")

// a grave is not ordered, it appears where someone was buried; a stair is drawn
// by the stair column. Both are still drawn, so they are in the list.
const surfaces = ["Fort.qml", "Service.qml"]
for (const file of surfaces) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8")
  check(/Sim\.seenAt\(/.test(src), file + " asks what the hold has seen")
  check(/World\.fog/.test(src), file + " honours the fog option")
  // the cell tested must be the one drawn, not the one looked at: `i0` is the
  // viewed cell and `i` can be several levels below it through a gap
  check(/seenAt\(w, i\)/.test(src), file + " tests the fog on the cell it draws, not on the one above it")
  const missing = built.filter(b => !src.includes("Sim." + b))
  check(missing.length === 0, file + " draws every building" + (missing.length ? " — missing " + missing.join(", ") : ""))
}

// the light fields a surface reads have to be the ones renderLight returns
const fields = new Set()
for (const m of sim.matchAll(/rlMemo\.(\w+) = lightField/g)) fields.add(m[1])
check(fields.size >= 3, "renderLight publishes " + fields.size + " light fields")
for (const file of surfaces) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8")
  const unread = [...fields].filter(f => !new RegExp("RL\\." + f).test(src))
  check(unread.length === 0, file + " reads every light field" + (unread.length ? " — ignoring " + unread.join(", ") : ""))
}

console.log("\n" + (passed + failed) + " checks, " + failed + " failed")
process.exit(failed ? 1 : 0)
