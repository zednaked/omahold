.pragma library

// The world dressed in the theme. Every color on the map is derived from the
// theme's colors.toml — the 16 terminal colors plus foreground, background
// and accent — so switching from Tokyo Night to Rose Pine redresses the
// fortress. Themes disagree wildly about what "green" is (Blackgold's color2
// is gold), which is the point: each theme gives the same hold a different
// climate.

function hex(c) {
  var s = String(c || "").trim().replace(/^#/, "")
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  if (s.length !== 6) return null
  return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)]
}
function css(rgb, a) {
  var r = Math.round(rgb[0]), g = Math.round(rgb[1]), b = Math.round(rgb[2])
  if (a === undefined || a >= 1) return "rgb(" + r + "," + g + "," + b + ")"
  return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(3) + ")"
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] }
function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 }
function scale(c, k) { return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)] }

// Parse colors.toml into { foreground, background, accent, c: [16 rgb] }.
function parseToml(text) {
  var out = { c: [] }
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*([a-z_0-9]+)\s*=\s*"?(#?[0-9a-fA-F]{3,8})"?/)
    if (!m) continue
    var k = m[1], v = hex(m[2].substr(0, 7))
    if (!v) continue
    var cm = k.match(/^color(\d+)$/)
    if (cm) out.c[parseInt(cm[1], 10)] = v
    else out[k] = v
  }
  return out
}

// Build the drawing palette. `theme` is parseToml's output; missing entries
// fall back to sane grays so a half-parsed file still draws something.
function build(theme) {
  var bg = theme.background || [16, 19, 21], fg = theme.foreground || [202, 204, 204]
  var dark = lum(bg) < 0.5
  var c = theme.c || []
  function C(n, fallback) { return c[n] || fallback }
  var red = C(1, [200, 90, 90]), green = C(2, [110, 160, 90]), yellow = C(3, [190, 160, 80]), blue = C(4, [90, 130, 200])
  var magenta = C(5, [170, 110, 190]), cyan = C(6, [90, 170, 170]), white = C(7, fg), gray = C(8, mix(fg, bg, 0.6))
  var bred = C(9, red), bgreen = C(10, green), byellow = C(11, yellow), bblue = C(12, blue), bmag = C(13, magenta), bcyan = C(14, cyan), bwhite = C(15, white)
  var accent = theme.accent || blue
  // toward-background amount: lighter themes need stronger tints to read
  var k = dark ? 1 : 1.15
  function groundRgb(col, t) { return mix(col, bg, Math.min(0.92, t * k)) }
  function ground(col, t) { return css(groundRgb(col, t)) }
  var p = {
    dark: dark,
    bgRgb: bg, fgRgb: fg,
    bg: css(bg), fg: css(fg), accent: css(accent), muted: css(mix(fg, bg, 0.55)),
    // terrain bodies (solid)
    soil: ground(yellow, 0.62), stone: ground(gray, 0.45), ore: ground(byellow, 0.35), gem: ground(bmag, 0.35),
    tree: ground(green, 0.35), treeGlyph: css(bgreen), fungus: ground(magenta, 0.45), fungusGlyph: css(bmag),
    // unexplored rock: a shade off the background, so "not dug yet" reads
    // differently from "outside the map"
    fog: ground(gray, 0.06),
    // the mark of a hunch: visible enough to aim a pick at, faint enough to
    // read as a feeling rather than a fact
    hunch: css(mix(fg, bg, 0.55)),
    water: ground(blue, 0.3), waterGlyph: css(bblue), magma: ground(red, 0.2), magmaGlyph: css(byellow),
    shrub: ground(green, 0.55), shrubGlyph: css(green),
    // floors (open)
    fSoil: ground(yellow, 0.82), fStone: ground(gray, 0.78), fGrass: ground(green, 0.72), fMoss: ground(cyan, 0.78), fSnow: ground(white, 0.35),
    // things
    dwarf: css(bwhite), dwarfSel: css(accent), goblin: css(bred), wolf: css(gray), deer: css(yellow), kobold: css(magenta), merchant: css(bcyan),
    // what comes up from below reads as the deep does: the crawler in the
    // fungus colour of the caverns it lives in, the sentinel in magma
    crawler: css(magenta), sentinel: css(byellow),
    // an envoy of the deep is not a foe and must not read like one
    envoy: css(bmag),
    item: css(mix(fg, bg, 0.25)), itemLog: css(yellow), itemStone: css(gray), itemOre: css(byellow), itemGem: css(bmag), itemFood: css(bgreen), itemBooze: css(byellow), itemCraft: css(cyan), itemWeapon: css(bwhite), itemArtifact: css(accent), itemRemains: css(gray),
    bKitchen: css(byellow), bSmelter: css(bred), bForge: css(bwhite), bTorch: css(byellow), bTraining: css(mix(fg, bg, 0.35)),
    itemBar: css(byellow), itemTool: css(bcyan), itemArmor: css(bwhite), itemMeal: css(bgreen), itemCutGem: css(mix(bmag, bwhite, 0.35)), itemJewel: css(mix(accent, bwhite, 0.5)), bJeweler: css(bmag),
    bStair: css(mix(fg, bg, 0.2)), bBed: css(magenta), bTable: css(yellow), bFarm: ground(green, 0.6), bFarmRipe: css(bgreen), bStill: css(byellow), bWorkshop: css(cyan), bWall: ground(gray, 0.15), bWallGlyph: css(mix(fg, bg, 0.3)), bDoor: css(yellow), bStock: css(mix(fg, bg, 0.75)), bStatue: css(bwhite),
    desig: css(accent, 0.28), desigGlyph: css(accent), desigBad: css(red, 0.35), desigBadGlyph: css(bred), cursor: css(accent), select: css(accent, 0.18),
    night: css(mix(bg, blue, 0.15), 0.62), rain: css(bblue, 0.5), snowGlyph: css(bwhite, 0.7),
    urgent: css(red),
    warmRgb: mix(byellow, [255, 220, 150], 0.4), fireRgb: mix(bred, [255, 120, 40], 0.5), duskRgb: mix(red, byellow, 0.5), nightRgb: mix(bg, blue, 0.25),
    heat: [css(mix(bg, blue, 0.5)), css(mix(bg, blue, 0.15)), css(mix(byellow, bg, 0.55)), css(mix(byellow, bg, 0.25)), css(byellow)],
    // glyph mode: the same materials as characters on the background
    g: { soil: css(mix(yellow, bg, 0.3)), stone: css(mix(gray, bg, 0.15)), ore: css(byellow), gem: css(bmag), tree: css(bgreen), fungus: css(bmag),
         water: css(bblue), magma: css(bred), shrub: css(green),
         fSoil: css(mix(yellow, bg, 0.5)), fStone: css(mix(gray, bg, 0.45)), fGrass: css(mix(green, bg, 0.4)), fMoss: css(mix(cyan, bg, 0.45)), fSnow: css(mix(white, bg, 0.15)) },
    // 4 jitter variants for the big terrain fills, so slabs of stone read as stone and not as a flat rectangle
    v: {}
  }
  var jitterKeys = ["soil", "stone", "ore", "gem", "tree", "fSoil", "fStone", "fGrass", "fMoss", "fSnow", "water", "magma", "fungus", "shrub", "bFarm", "bWall"]
  var base = { soil: groundRgb(yellow, 0.62), stone: groundRgb(gray, 0.45), ore: groundRgb(byellow, 0.35), gem: groundRgb(bmag, 0.35), tree: groundRgb(green, 0.35),
    fSoil: groundRgb(yellow, 0.82), fStone: groundRgb(gray, 0.78), fGrass: groundRgb(green, 0.72), fMoss: groundRgb(cyan, 0.78), fSnow: groundRgb(white, 0.35),
    water: groundRgb(blue, 0.3), magma: groundRgb(red, 0.2), fungus: groundRgb(magenta, 0.45), shrub: groundRgb(green, 0.55), bFarm: groundRgb(green, 0.6), bWall: groundRgb(gray, 0.15) }
  for (var j = 0; j < jitterKeys.length; j++) {
    var key = jitterKeys[j], arr = []
    for (var q = 0; q < 4; q++) arr.push(css(scale(base[key], dark ? 0.9 + q * 0.07 : 0.96 + q * 0.03)))
    p.v[key] = arr
  }
  // looking down: the level below, dimmed, then the one under that
  p.dim = [1, 0.55, 0.3, 0.16]
  return p
}

function toCss(rgb) { return css(rgb) }
// Wall texture colors derived from a lit fill: a darker seam and a brighter edge.
// Both caches count their own entries: Object.keys(...).length walked the whole
// table on every miss, and with the torches flickering the keys turn over every
// tick, so a frame paid thousands of key scans for nothing.
var edgeCache = {}, edgeCacheN = 0
function edges(rgbCss, p, L) {
  var qL = L === undefined ? 10 : Math.round(Math.max(0, Math.min(1, L)) * 10)
  var key = rgbCss + "|" + qL
  var hit = edgeCache[key]; if (hit) return hit
  var m = String(rgbCss).match(/(\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return { seam: rgbCss, face: rgbCss }
  var c = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  // the lip is brightest under light and only a faint trace in the dark
  var out = { seam: css(mix(c, p.bgRgb, 0.45)), face: css(mix(c, p.fgRgb, 0.12 + 0.45 * (qL / 10))) }
  if (edgeCacheN > 4000) { edgeCache = {}; edgeCacheN = 0 }
  edgeCache[key] = out; edgeCacheN++
  return out
}
// Light a color: below full light it sinks toward the background; torchlight
// adds a warm cast; dawn and dusk tint toward the dusk color.
var litCache = {}, litCacheN = 0
function lit(rgbCss, p, L, torch, fire, sun, isOut, solid) {
  // quantize so the cache stays small: 1440 cells x 4 fps would otherwise parse strings all day
  var qL = Math.round(L * 20), qT = Math.round(torch * 12), qF = Math.round(fire * 12), qS = Math.round(sun * 12)
  var key = rgbCss + "|" + qL + "|" + qT + "|" + qF + "|" + qS + "|" + (isOut ? 1 : 0) + (solid ? "s" : "")
  var hit = litCache[key]; if (hit) return hit
  var m = String(rgbCss).match(/(\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return rgbCss
  var c = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  // unlit rock sinks deeper than unlit floor, so a lit wall face stands out and dark rock reads as mass
  var floor = isOut ? 0.2 : (solid ? 0.14 : 0.3)
  var r = mix(p.bgRgb, c, floor + (1 - floor) * (qL / 20))
  if (solid && !isOut && qT + qF > 0) r = scale(r, 1.12)
  var s = qS / 12, t = qT / 12, f = qF / 12
  if (isOut && s < 0.6 && s > 0.15 && t < s) r = mix(r, p.duskRgb, 0.22 * (1 - Math.abs(s - 0.4) / 0.25))
  if (isOut && s < 0.3) r = mix(r, p.nightRgb, 0.35 * (1 - s / 0.3))
  if (t > 0.04) { r = mix(r, p.warmRgb, 0.45 * t); r = scale(r, 1 + 0.25 * t) }
  if (f > 0.04) { r = mix(r, p.fireRgb, 0.5 * f); r = scale(r, 1 + 0.2 * f) }
  var out = css(r)
  if (litCacheN > 6000) { litCache = {}; litCacheN = 0 }
  litCache[key] = out; litCacheN++
  return out
}
function dimmed(rgbCss, bgRgb, amount) {
  // rgbCss is "rgb(r,g,b)"; blend toward the background
  var m = String(rgbCss).match(/(\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return rgbCss
  var c = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  return css(mix(bgRgb, c, amount))
}
