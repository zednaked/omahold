.pragma library

// Omahold — a small dwarven hold that lives inside omarchy-shell.
//
// This file is the whole world: generation, z-levels, pathfinding, dwarves,
// needs, moods, jobs, seasons, caravans, goblins, strange moods and floods.
// It knows nothing about QML on purpose: `test/run.js` runs it under node,
// which is how most of it was debugged. The QML side owns the clock (when to
// call `tick`), persistence and drawing.
//
// Scale is the design constraint. Dwarf Fortress simulates a 192x192xN embark
// with hundreds of creatures; this is 48x30x8 with a population cap, ticking
// four times a second when you look at it and every couple of seconds when
// you don't. Everything below was picked so a tick costs well under a
// millisecond on a 2014 laptop.

var W = 48, H = 30, D = 8
var N = W * H, NN = N * D
var SURFACE_MIN = 4, SURFACE_MAX = 6      // ground height range (z of the walkable surface)

var DAY = 100                              // ticks per day
var SEASON_DAYS = 20
var YEAR = DAY * SEASON_DAYS * 4
var SEASONS = ["primavera", "verão", "outono", "inverno"]

// ---- tile bodies (what fills the cell) ------------------------------------
var T_OPEN = 0, T_SOIL = 1, T_STONE = 2, T_ORE = 3, T_GEM = 4, T_TREE = 5,
    T_WATER = 6, T_MAGMA = 7, T_FUNGUS = 8, T_SHRUB = 9

// ---- floors (what an open cell stands on; 0 = nothing, you see the level below)
var F_NONE = 0, F_SOIL = 1, F_STONE = 2, F_GRASS = 3, F_MOSS = 4

// ---- buildings --------------------------------------------------------------
var B_NONE = 0, B_STAIR = 1, B_BED = 2, B_TABLE = 3, B_FARM = 4, B_STILL = 5,
    B_WORKSHOP = 6, B_WALL = 7, B_DOOR = 8, B_STOCK = 9, B_STATUE = 10,
    B_KITCHEN = 11, B_SMELTER = 12, B_FORGE = 13, B_TORCH = 14, B_TRAINING = 15, B_JEWELER = 16
var TORCH_RADIUS = 4.5   // cells; light fades linearly to nothing at this distance

// ---- designations -----------------------------------------------------------
var DG_NONE = 0, DG_DIG = 1, DG_STAIR = 2, DG_CHOP = 3, DG_BUILD = 4

var BUILD_INFO = {}
BUILD_INFO[B_BED]      = { name: "cama",       mat: "log",   value: 10, work: 18 }
BUILD_INFO[B_TABLE]    = { name: "mesa",       mat: "log",   value: 10, work: 18 }
BUILD_INFO[B_DOOR]     = { name: "porta",      mat: "log",   value: 8,  work: 14 }
BUILD_INFO[B_WALL]     = { name: "muro",       mat: "stone", value: 3,  work: 16 }
BUILD_INFO[B_FARM]     = { name: "plantação",  mat: null,    value: 5,  work: 12 }
BUILD_INFO[B_STILL]    = { name: "destilaria", mat: "stone", value: 30, work: 30 }
BUILD_INFO[B_WORKSHOP] = { name: "oficina",    mat: "stone", value: 30, work: 30 }
BUILD_INFO[B_STOCK]    = { name: "estoque",    mat: null,    value: 1,  work: 4 }
BUILD_INFO[B_STATUE]   = { name: "estátua",    mat: "stone", value: 40, work: 40 }
BUILD_INFO[B_STAIR]    = { name: "escada",     mat: null,    value: 1,  work: 0 }
BUILD_INFO[B_KITCHEN]  = { name: "cozinha",    mat: "stone", value: 30, work: 30 }
BUILD_INFO[B_SMELTER]  = { name: "fundição",   mat: "stone", value: 40, work: 34 }
BUILD_INFO[B_FORGE]    = { name: "forja",      mat: "stone", value: 40, work: 34 }
BUILD_INFO[B_TORCH]    = { name: "tocha",      mat: "log",   value: 3,  work: 6 }
BUILD_INFO[B_TRAINING] = { name: "campo de treino", mat: "stone", value: 15, work: 16 }
BUILD_INFO[B_JEWELER]  = { name: "joalheria",  mat: "stone", value: 40, work: 34 }

var ITEM_VALUE = { log: 2, stone: 1, ore: 8, gem: 30, food: 2, booze: 3, craft: 12, weapon: 25, artifact: 400, remains: 0,
                   bar: 15, pick: 30, axe: 28, armor: 40, meal: 5, cutgem: 70, jewel: 130 }
var ITEM_NAME = { log: "tora", stone: "pedra", ore: "minério", gem: "gema", food: "comida", booze: "bebida",
                  craft: "artesanato", weapon: "arma", artifact: "artefato", remains: "restos",
                  bar: "barra de metal", pick: "picareta", axe: "machado", armor: "armadura", meal: "refeição", cutgem: "gema lapidada", jewel: "joia" }

var SKILLS = ["mine", "wood", "farm", "build", "craft", "fight", "brew"]
var SKILL_NAME = { mine: "mineração", wood: "lenha", farm: "lavoura", build: "construção", craft: "artesanato", fight: "luta", brew: "cervejaria" }

// every counter the UI prints; a save from an older build gets the missing ones
// zeroed on load instead of showing "undefined" in the chronicle
var STAT_KEYS = ["dug", "chopped", "built", "brewed", "crafted", "migrants", "deaths", "artifacts", "raids", "caravans",
                 "cooked", "smelted", "forged", "cut", "jewels", "repelled", "goblinsKilled"]
function newStats() { var o = {}; for (var k = 0; k < STAT_KEYS.length; k++) o[STAT_KEYS[k]] = 0; return o }

var TRAITS = ["teimoso", "alegre", "melancólico", "guloso", "valente", "preguiçoso", "curioso", "rabugento"]

// ---- rng --------------------------------------------------------------------
// mulberry32: tiny, seedable, good enough. The state lives on the world so a
// save file replays the same dice.
function rnd(w) {
  w.rs = (w.rs + 0x6D2B79F5) | 0
  var t = w.rs
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function ri(w, n) { return Math.floor(rnd(w) * n) }
function pick(w, arr) { return arr[ri(w, arr.length)] }
function chance(w, p) { return rnd(w) < p }

function idx(x, y, z) { return z * N + y * W + x }
function ix(i) { return i % W }
function iy(i) { return ((i % N) - (i % W)) / W }
function iz(i) { return (i - (i % N)) / N }
function inb(x, y, z) { return x >= 0 && y >= 0 && x < W && y < H && z >= 0 && z < D }
function dist(a, b) { return Math.abs(ix(a) - ix(b)) + Math.abs(iy(a) - iy(b)) + Math.abs(iz(a) - iz(b)) * 3 }
function hash(i) { var x = (i * 2654435761) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; return (x ^ (x >>> 15)) >>> 0 }

// ---- names ------------------------------------------------------------------
var SYL_A = ["Ur", "Ka", "Do", "Zas", "Mo", "Er", "On", "To", "Lo", "Ri", "Sod", "Id", "Ath", "Bem", "Kib", "Ned", "Ol", "Rak", "Ud", "Vab"]
var SYL_B = ["ist", "dol", "dok", "it", "muz", "ib", "ul", "sid", "kud", "sen", "el", "ral", "am", "os", "eth", "ish", "an", "ur", "lem", "ok"]
var SUR_A = ["Pedra", "Ferro", "Barba", "Machado", "Rocha", "Cerveja", "Fogo", "Neve", "Ouro", "Cinza", "Martelo", "Bronze", "Sal", "Trovão", "Musgo"]
var SUR_B = ["dura", "fria", "funda", "velha", "forte", "torta", "rubra", "longa", "viva", "negra", "clara", "brava", "muda", "alta", "seca"]
var FORT_A = ["Salão", "Martelo", "Portão", "Poço", "Trono", "Sino", "Espelho", "Muralha", "Forja", "Escudo"]
var FORT_B = ["de Bronze", "Profundo", "das Cinzas", "do Trovão", "de Sal", "Silencioso", "das Barbas", "do Outono", "de Musgo", "Rubro"]
var ART_A = ["Veia", "Lâmina", "Coroa", "Canção", "Sombra", "Chama", "Portão", "Lua", "Raiz", "Ponte"]
var ART_B = ["da Manhã", "dos Anéis", "do Silêncio", "de Inverno", "das Profundezas", "do Rei Morto", "de Bronze", "da Tempestade", "dos Sete", "Sem Fim"]
var ART_KIND = ["um amuleto", "uma coroa", "um machado", "uma estatueta", "um cálice", "um anel", "um escudo", "uma flauta", "uma mesa", "um trono"]
var ART_MAT = { log: "de madeira", stone: "de granito", gem: "cravejado de gemas", ore: "de cobre" }
var ART_TAIL = ["Ameaça com espinhos de cobre.", "Traz a imagem de um anão e um goblin. O goblin está gritando.",
  "Nas laterais, círculos de gemas.", "Todo o artesanato é da mais alta qualidade.", "Traz a imagem de queijo.",
  "Está decorado com pontas de osso de veado.", "Traz a imagem da fundação desta fortaleza."]

function dwarfName(w) { return pick(w, SYL_A) + pick(w, SYL_B) + " " + pick(w, SUR_A) + pick(w, SUR_B) }
function fortName(w) { return pick(w, FORT_A) + " " + pick(w, FORT_B) }
function artifactName(w, mat) {
  return pick(w, SYL_A).toLowerCase() + pick(w, SYL_B) + pick(w, SYL_A).toLowerCase() + pick(w, SYL_B) + "|"
    + pick(w, ART_A) + " " + pick(w, ART_B) + "|" + pick(w, ART_KIND) + " " + (ART_MAT[mat] || "de pedra") + ". " + pick(w, ART_TAIL)
}

// ---- noise ------------------------------------------------------------------
// Value noise: a lattice of random values and smooth interpolation between
// them. One octave is enough for hills; two for veins and caverns.
function makeLattice(w, n) { var a = []; for (var i = 0; i < n * n; i++) a.push(rnd(w)); return a }
function lat(l, n, x, y) { return l[((y % n) + n) % n * n + ((x % n) + n) % n] }
function smooth(t) { return t * t * (3 - 2 * t) }
function noise(l, n, x, y, scale) {
  var fx = x / scale, fy = y / scale
  var x0 = Math.floor(fx), y0 = Math.floor(fy)
  var tx = smooth(fx - x0), ty = smooth(fy - y0)
  var a = lat(l, n, x0, y0), b = lat(l, n, x0 + 1, y0), c = lat(l, n, x0, y0 + 1), d = lat(l, n, x0 + 1, y0 + 1)
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

// ---- world ------------------------------------------------------------------
function newWorld(seed) {
  var w = {
    v: 1, seed: seed >>> 0, rs: seed >>> 0, tick: 0,
    tile: new Uint8Array(NN), floor: new Uint8Array(NN), build: new Uint8Array(NN),
    desig: new Uint8Array(NN), dbuild: new Uint8Array(NN), grow: new Uint8Array(NN),
    ground: new Uint8Array(N),
    items: [], units: [], nextId: 1,
    log: [], legends: [], artifacts: [], dead: [],
    name: "", wealth: 0, alerts: 0, popCap: 20,
    liquidBudget: { water: 60, magma: 30 },
    caravan: null, raid: null, lockdown: false, depot: -1,
    weather: 0,   // 0 clear, 1 rain, 2 snow
    stats: newStats(),
    fallen: false,   // the last dwarf died: the world stops sending anyone
    // scratch (not saved)
    claim: null, unreach: {}, lastMoodTick: 0
  }
  w.name = fortName(w)
  generate(w)
  return w
}

function generate(w) {
  var L1 = makeLattice(w, 16), L2 = makeLattice(w, 16), L3 = makeLattice(w, 16), L4 = makeLattice(w, 16)
  var x, y, z, i
  // ground height: rolling hills in [SURFACE_MIN, SURFACE_MAX]
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var n = noise(L1, 16, x, y, 11) * 0.7 + noise(L2, 16, x, y, 5) * 0.3
    var g = SURFACE_MIN + Math.floor(n * (SURFACE_MAX - SURFACE_MIN + 1))
    if (g > SURFACE_MAX) g = SURFACE_MAX
    w.ground[y * W + x] = g
  }
  // no cliff taller than one level: natural slopes then connect every plateau
  for (var pass = 0; pass < 6; pass++) for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var gi = y * W + x, gv = w.ground[gi]
    if (x > 0 && w.ground[gi - 1] > gv + 1) w.ground[gi] = gv = w.ground[gi - 1] - 1
    if (y > 0 && w.ground[gi - W] > gv + 1) w.ground[gi] = gv = w.ground[gi - W] - 1
    if (x < W - 1 && w.ground[gi + 1] > gv + 1) w.ground[gi] = gv = w.ground[gi + 1] - 1
    if (y < H - 1 && w.ground[gi + W] > gv + 1) w.ground[gi] = gv = w.ground[gi + W] - 1
  }
  for (z = 0; z < D; z++) for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = idx(x, y, z)
    var g2 = w.ground[y * W + x]
    if (z < g2) {
      if (z >= g2 - 2) w.tile[i] = T_SOIL
      else {
        var v = noise(L3, 16, x + z * 7, y + z * 3, 4)
        w.tile[i] = v > 0.78 ? (z <= 2 && v > 0.9 ? T_GEM : T_ORE) : T_STONE
      }
    } else if (z === g2) {
      w.tile[i] = T_OPEN
      var soilPatch = noise(L4, 16, x, y, 6) > 0.72
      w.floor[i] = soilPatch ? F_SOIL : F_GRASS
    } else {
      w.tile[i] = T_OPEN; w.floor[i] = F_NONE
    }
  }
  // brook: a wandering vertical line, water at surface level
  var bx = 6 + ri(w, W - 12)
  for (y = 0; y < H; y++) {
    bx += ri(w, 3) - 1; if (bx < 2) bx = 2; if (bx > W - 3) bx = W - 3
    for (var k = 0; k < 2; k++) {
      var wx = bx + k
      var gz = w.ground[y * W + wx]
      w.tile[idx(wx, y, gz)] = T_WATER; w.floor[idx(wx, y, gz)] = F_STONE
    }
  }
  // trees, shrubs on grass
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = idx(x, y, w.ground[y * W + x])
    if (w.tile[i] !== T_OPEN || w.floor[i] !== F_GRASS) continue
    var f = noise(L2, 16, x + 31, y + 17, 5)
    if (f > 0.58 && chance(w, 0.55)) w.tile[i] = T_TREE
    else if (chance(w, 0.05)) w.tile[i] = T_SHRUB
  }
  // cavern layer at z=1: open pockets with moss floor, fungus trees, a lake
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var c = noise(L4, 16, x + 5, y + 9, 6) * 0.6 + noise(L1, 16, x + 40, y + 40, 3) * 0.4
    i = idx(x, y, 1)
    if (c > 0.62) {
      w.tile[i] = T_OPEN; w.floor[i] = F_MOSS
      if (c > 0.8) { w.tile[i] = T_WATER; w.floor[i] = F_STONE }
      else if (chance(w, 0.12)) w.tile[i] = T_FUNGUS
    }
  }
  // magma pools at z=0
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var m = noise(L3, 16, x + 70, y + 20, 7)
    i = idx(x, y, 0)
    if (m > 0.74) { w.tile[i] = T_MAGMA; w.floor[i] = F_STONE }
    else if (noise(L2, 16, x + 90, y + 60, 3) > 0.86) w.tile[i] = T_GEM
  }
  var best = pickDepot(w, 0, 2)
  var cx = best % W, cy = (best - cx) / W, cz = w.ground[best]
  for (var dy2 = -1; dy2 <= 1; dy2++) for (var dx2 = -1; dx2 <= 1; dx2++) {
    var gi = idx(cx + dx2, cy + dy2, w.ground[(cy + dy2) * W + cx + dx2])
    if (w.tile[gi] === T_TREE || w.tile[gi] === T_SHRUB) w.tile[gi] = T_OPEN
  }
  w.depot = idx(cx, cy, cz)
  // embark goods
  var goods = [["food", 45], ["booze", 45], ["log", 10], ["stone", 6]]
  for (var gI = 0; gI < goods.length; gI++)
    for (var q = 0; q < goods[gI][1]; q++) addItem(w, goods[gI][0], nearFree(w, w.depot, 2))
  // the seven
  for (var d7 = 0; d7 < 7; d7++) addDwarf(w, nearFree(w, w.depot, 2))
  // wildlife
  for (var a = 0; a < 3; a++) { var sp = randomSurface(w); if (sp >= 0) addUnit(w, "deer", sp) }
  w.dirty = true
  announce(w, "Golpeie a terra! " + w.name + " foi fundada com sete anões.", 1)
  legend(w, "Fundação de " + w.name + ".")
}

// Embark spot: the flattest, most open square near the middle. `minGround`
// asks for high ground (deep rock under it), `clear` is the half-width of the
// footprint that must be free of water in every column.
function pickDepot(w, minGround, clear) {
  var best = -1, bestScore = -1e9, x, y
  for (y = 4; y < H - 4; y++) for (x = 6; x < W - 6; x++) {
    var s = 0, g0 = w.ground[y * W + x]
    if (g0 < minGround) s -= 40
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var gg = w.ground[(y + dy) * W + x + dx]
      var t = w.tile[idx(x + dx, y + dy, gg)]
      if (gg !== g0) s -= 4
      if (t === T_WATER) s -= 30
      if (t === T_TREE) s -= 1
    }
    if (clear > 2) {
      for (var wy = Math.max(0, y - Math.ceil(clear / 2)); wy <= Math.min(H - 1, y + Math.ceil(clear / 2)); wy++)
        for (var wx = Math.max(0, x - clear); wx <= Math.min(W - 1, x + clear); wx++)
          if (w.tile[surfaceIdx(w, wx, wy)] === T_WATER) s -= 25
    }
    s -= (Math.abs(x - W / 2) + Math.abs(y - H / 2)) * 0.3
    if (s > bestScore) { bestScore = s; best = y * W + x }
  }
  return best
}
function surfaceIdx(w, x, y) { return idx(x, y, w.ground[y * W + x]) }
function randomSurface(w) {
  for (var t = 0; t < 40; t++) { var i = surfaceIdx(w, ri(w, W), ri(w, H)); if (passable(w, i)) return i }
  return -1
}
// A walkable edge cell from which the wagon spot can be reached. Migrants
// used to appear on an island of grass between the brook and the map edge
// and starve there in plain sight.
function edgeSurface(w) {
  var goal = function (c) { return dist(c, w.depot) <= 2 }
  for (var t = 0; t < 40; t++) {
    var side = ri(w, 4), x, y
    if (side === 0) { x = 0; y = ri(w, H) } else if (side === 1) { x = W - 1; y = ri(w, H) }
    else if (side === 2) { x = ri(w, W); y = 0 } else { x = ri(w, W); y = H - 1 }
    var i = surfaceIdx(w, x, y)
    if (!passable(w, i)) continue
    if (w.depot < 0 || findPath(w, i, goal, w.depot, null, 6000)) return i
  }
  return -1
}
function nearFree(w, c, r) {
  for (var t = 0; t < 30; t++) {
    var x = ix(c) + ri(w, 2 * r + 1) - r, y = iy(c) + ri(w, 2 * r + 1) - r
    if (!inb(x, y, 0)) continue
    var i = surfaceIdx(w, x, y); if (passable(w, i)) return i
  }
  return c
}

// ---- entities ---------------------------------------------------------------
function addItem(w, type, i) {
  var it = { id: w.nextId++, t: type, i: i, res: 0, by: 0 }
  w.items.push(it); return it
}
function addUnit(w, kind, i) {
  var hp = { dwarf: 12, goblin: 5, deer: 5, wolf: 5, kobold: 4, merchant: 10 }[kind] || 6
  var u = { id: w.nextId++, k: kind, i: i, hp: hp, maxhp: hp, path: null, pi: 0, job: null, born: w.tick, cool: 0, wait: 0 }
  w.units.push(u); return u
}
function addDwarf(w, i) {
  var u = addUnit(w, "dwarf", i)
  u.name = dwarfName(w)
  u.trait = pick(w, TRAITS)
  u.hunger = ri(w, 30); u.thirst = ri(w, 30); u.sleep = ri(w, 30)
  u.mood = 60; u.thoughts = []; u.skills = {}
  for (var s = 0; s < SKILLS.length; s++) u.skills[SKILLS[s]] = 0
  var a = pick(w, SKILLS), b = pick(w, SKILLS)
  u.skills[a] = 3 + ri(w, 3); u.skills[b] = Math.max(u.skills[b], 2 + ri(w, 3))
  u.bed = -1; u.carry = 0; u.weapon = false; u.armor = false; u.tool = ""; u.militia = false
  u.mood_state = "" // "", "strange", "melancholy", "berserk"
  u.kills = 0; u.made = 0
  return u
}
function unitById(w, id) { for (var k = 0; k < w.units.length; k++) if (w.units[k].id === id) return w.units[k]; return null }
function itemById(w, id) { for (var k = 0; k < w.items.length; k++) if (w.items[k].id === id) return w.items[k]; return null }
function dwarves(w) { var r = []; for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "dwarf") r.push(w.units[k]); return r }
function pop(w) { var n = 0; for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "dwarf") n++; return n }

function announce(w, msg, lvl) {
  w.log.push({ t: w.tick, m: msg, l: lvl || 0 })
  if (w.log.length > 160) w.log.splice(0, w.log.length - 160)
  if (lvl >= 1) w.alerts++
}
function legend(w, msg) { w.legends.push({ t: w.tick, m: msg }); if (w.legends.length > 300) w.legends.shift() }
function thought(w, u, text, v) {
  u.thoughts.unshift({ t: w.tick, m: text, v: v })
  if (u.thoughts.length > 6) u.thoughts.pop()
  u.mood = Math.max(0, Math.min(100, u.mood + v))
}

// ---- time -------------------------------------------------------------------
function date(w) {
  var t = w.tick, year = Math.floor(t / YEAR) + 1
  var inYear = t % YEAR, season = Math.floor(inYear / (DAY * SEASON_DAYS))
  var day = Math.floor((inYear % (DAY * SEASON_DAYS)) / DAY) + 1
  var hour = ((t % DAY) / DAY) * 24
  return { year: year, season: season, seasonName: SEASONS[season], day: day, hour: hour }
}
// 1 at noon, ~0.25 at midnight
function daylight(w) { return sunLevel(w) }
function isNight(w) { return sunLevel(w) < 0.25 }

// ---- passability & paths ---------------------------------------------------
function liquid(t) { return t === T_WATER || t === T_MAGMA }
function solid(t) { return t !== T_OPEN && !liquid(t) }
function passable(w, i) {
  if (w.tile[i] !== T_OPEN) return false
  if (w.floor[i] === F_NONE) return false
  var b = w.build[i]
  return b !== B_WALL
}
// Goblins (and other hostiles) are stopped by doors under lockdown; dwarves never are.
function passableFor(w, i, u) {
  if (!passable(w, i)) return false
  if (w.build[i] === B_DOOR && w.lockdown && u && (u.k === "goblin" || u.k === "wolf" || u.k === "kobold")) return false
  return true
}

var pf = { g: new Int32Array(NN), stamp: new Int32Array(NN), from: new Int32Array(NN), run: 0, closed: new Int32Array(NN) }
var heapA = [], heapF = []
function hpush(i, f) {
  heapA.push(i); heapF.push(f)
  var k = heapA.length - 1
  while (k > 0) { var p = (k - 1) >> 1; if (heapF[p] <= heapF[k]) break
    var ti = heapA[p]; heapA[p] = heapA[k]; heapA[k] = ti; var tf = heapF[p]; heapF[p] = heapF[k]; heapF[k] = tf; k = p }
}
function hpop() {
  var top = heapA[0], last = heapA.pop(), lf = heapF.pop()
  if (heapA.length > 0) {
    heapA[0] = last; heapF[0] = lf
    var k = 0, n = heapA.length
    for (;;) { var l = 2 * k + 1, r = l + 1, m = k
      if (l < n && heapF[l] < heapF[m]) m = l
      if (r < n && heapF[r] < heapF[m]) m = r
      if (m === k) break
      var ti = heapA[m]; heapA[m] = heapA[k]; heapA[k] = ti; var tf = heapF[m]; heapF[m] = heapF[k]; heapF[k] = tf; k = m }
  }
  return top
}
function neighbors(w, i, u, out) {
  var n = 0, x = ix(i), y = iy(i), z = iz(i)
  if (x > 0) n = stepTo(w, i, i - 1, z, u, out, n)
  if (x < W - 1) n = stepTo(w, i, i + 1, z, u, out, n)
  if (y > 0) n = stepTo(w, i, i - W, z, u, out, n)
  if (y < H - 1) n = stepTo(w, i, i + W, z, u, out, n)
  if (w.build[i] === B_STAIR) {
    if (z < D - 1 && w.build[i + N] === B_STAIR && passableFor(w, i + N, u)) out[n++] = i + N
    if (z > 0 && w.build[i - N] === B_STAIR && passableFor(w, i - N, u)) out[n++] = i - N
  }
  return n
}
// One horizontal move, with natural slopes: hills one level apart are walkable
// without stairs (Dwarf Fortress ramps, without the bookkeeping). Stepping up
// needs headroom over the current cell and a floor on top of the neighbor;
// a constructed wall has sky over it, not floor, so it cannot be climbed.
function stepTo(w, i, j, z, u, out, n) {
  if (passableFor(w, j, u)) { out[n++] = j; return n }
  if (z < D - 1 && solid(w.tile[j]) && w.tile[j] !== T_TREE && w.tile[j] !== T_FUNGUS && w.tile[i + N] === T_OPEN && passableFor(w, j + N, u)) { out[n++] = j + N; return n }
  if (z > 0 && w.tile[j] === T_OPEN && w.floor[j] === F_NONE && passableFor(w, j - N, u)) { out[n++] = j - N; return n }
  return n
}
var nb = [0, 0, 0, 0, 0, 0]
// A* from `from` to any cell satisfying goalFn, heuristic toward `hint`.
// Returns the path as an array of cell indices (excluding `from`), or null.
function findPath(w, from, goalFn, hint, u, limit) {
  if (goalFn(from)) return []
  pf.run++
  var run = pf.run
  heapA.length = 0; heapF.length = 0
  pf.g[from] = 0; pf.stamp[from] = run; pf.from[from] = -1; pf.closed[from] = 0
  hpush(from, dist(from, hint))
  var expanded = 0, max = limit || 4000
  while (heapA.length > 0) {
    var cur = hpop()
    if (pf.closed[cur] === run) continue
    pf.closed[cur] = run
    if (goalFn(cur)) {
      var path = []
      for (var c = cur; c !== from; c = pf.from[c]) path.push(c)
      path.reverse(); return path
    }
    if (++expanded > max) return null
    var n = neighbors(w, cur, u, nb)
    for (var k = 0; k < n; k++) {
      var nx = nb[k], ng = pf.g[cur] + 1
      if (pf.stamp[nx] === run && ng >= pf.g[nx]) continue
      pf.g[nx] = ng; pf.stamp[nx] = run; pf.from[nx] = cur
      hpush(nx, ng + dist(nx, hint))
    }
  }
  return null
}
function pathTo(w, u, target, limit) { return findPath(w, u.i, function (i) { return i === target }, target, u, limit) }
function adjacent(a, b) {
  if (iz(a) !== iz(b)) return false
  var dx = Math.abs(ix(a) - ix(b)), dy = Math.abs(iy(a) - iy(b))
  return dx + dy === 1
}
// Cells from which a dwarf can work on cell i.
function workSpots(w, i, forStair) {
  return function (c) {
    if (c === i) return passable(w, i)
    if (adjacent(c, i)) return true
    if (forStair && c === i + N && iz(i) < D - 1 && passable(w, c)) return true
    return false
  }
}

// ---- designations (the player's half) --------------------------------------
function canDesignate(w, i, tool, bt) {
  var t = w.tile[i]
  switch (tool) {
    case "dig": return solid(t) && t !== T_TREE && t !== T_SHRUB && t !== T_FUNGUS
    case "stair":
      if (t === T_OPEN && w.build[i] === B_STAIR) return iz(i) > 0 && solid(w.tile[i - N]) && w.tile[i - N] !== T_TREE && w.tile[i - N] !== T_FUNGUS && w.desig[i - N] === DG_NONE
      return (solid(t) && t !== T_TREE && t !== T_FUNGUS && t !== T_SHRUB) || (t === T_OPEN && w.floor[i] !== F_NONE && w.build[i] === B_NONE)
    case "chop": return t === T_TREE || t === T_FUNGUS || t === T_SHRUB
    case "build":
      if (t !== T_OPEN || w.floor[i] === F_NONE || w.build[i] !== B_NONE) return false
      if (bt === B_FARM) return w.floor[i] === F_SOIL || w.floor[i] === F_MOSS || w.floor[i] === F_GRASS
      return true
    case "cancel": return w.desig[i] !== DG_NONE
    case "remove": return w.build[i] !== B_NONE
  }
  return false
}
function designate(w, i, tool, bt) {
  if (!canDesignate(w, i, tool, bt)) return false
  if (tool === "cancel") { clearDesig(w, i); return true }
  if (tool === "remove") { removeBuilding(w, i, true); return true }
  var d = { dig: DG_DIG, stair: DG_STAIR, chop: DG_CHOP, build: DG_BUILD }[tool]
  // "s" on a floor means "dig a staircase down from here": mark the cell and
  // the rock under it in one go, so a single order makes a working descent
  if (d === DG_STAIR && w.tile[i] === T_OPEN && iz(i) > 0) {
    var under = i - N
    if (solid(w.tile[under]) && w.tile[under] !== T_TREE && w.tile[under] !== T_FUNGUS && w.tile[under] !== T_SHRUB && w.desig[under] === DG_NONE) { w.desig[under] = DG_STAIR; w.dbuild[under] = 0; delete w.unreach[under]; w.dirty = true }
    if (w.build[i] === B_STAIR) return true   // already a stair here: the order was "go deeper"
  }
  if (w.desig[i] === d && (d !== DG_BUILD || w.dbuild[i] === bt)) return false
  // a dig area drawn over a planned staircase keeps the staircase: without it
  // nothing on the level below can be reached, and the whole area goes idle
  if (d === DG_DIG && w.desig[i] === DG_STAIR) return false
  clearDesig(w, i)
  w.desig[i] = d; w.dbuild[i] = d === DG_BUILD ? bt : 0
  delete w.unreach[i]; w.dirty = true
  return true
}
function designateRect(w, a, b, tool, bt) {
  var z = iz(a), n = 0
  var x0 = Math.min(ix(a), ix(b)), x1 = Math.max(ix(a), ix(b)), y0 = Math.min(iy(a), iy(b)), y1 = Math.max(iy(a), iy(b))
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (designate(w, idx(x, y, z), tool, bt)) n++
  return n
}
function clearDesig(w, i) {
  if (w.desig[i] === DG_NONE) return
  w.desig[i] = DG_NONE; w.dbuild[i] = 0; w.dirty = true
  // a dwarf on their way here should give up
  for (var k = 0; k < w.units.length; k++) { var u = w.units[k]; if (u.job && u.job.i === i && u.job.k !== "mood") dropJob(w, u) }
  if (w.claim) w.claim[i] = 0
}
function removeBuilding(w, i, byPlayer) {
  var b = w.build[i]; if (b === B_NONE) return
  w.build[i] = B_NONE; w.grow[i] = 0; w.dirty = true
  var info = BUILD_INFO[b]
  if (info && info.mat && byPlayer) addItem(w, info.mat, i)
  for (var k = 0; k < w.units.length; k++) { var u = w.units[k]; if (u.k === "dwarf" && u.bed === i) u.bed = -1 }
}

// ---- cache ------------------------------------------------------------------
// Where things are, rebuilt only after the map changed. Scanning all 11520
// cells per idle dwarf per tick was most of the cost of a tick.
function cache(w) {
  if (w.cache && !w.dirty) return w.cache
  var c = { stills: [], shops: [], farms: [], beds: [], stocks: [], tables: [], statues: [], shrubs: [], water: [], desigs: [],
            kitchens: [], smelters: [], forges: [], torches: [], trainings: [], jewelers: [] }
  var minG = 255, maxG = 0
  for (var gq = 0; gq < N; gq++) { var gv = w.ground[gq]; if (gv < minG) minG = gv; if (gv > maxG) maxG = gv }
  c.minGround = minG; c.maxGround = maxG
  for (var i = 0; i < NN; i++) {
    var b = w.build[i]
    if (b) {
      if (b === B_STILL) c.stills.push(i); else if (b === B_WORKSHOP) c.shops.push(i); else if (b === B_FARM) c.farms.push(i)
      else if (b === B_BED) c.beds.push(i); else if (b === B_STOCK) c.stocks.push(i); else if (b === B_TABLE) c.tables.push(i)
      else if (b === B_STATUE) c.statues.push(i); else if (b === B_KITCHEN) c.kitchens.push(i); else if (b === B_SMELTER) c.smelters.push(i)
      else if (b === B_FORGE) c.forges.push(i); else if (b === B_TORCH) c.torches.push(i); else if (b === B_TRAINING) c.trainings.push(i)
      else if (b === B_JEWELER) c.jewelers.push(i)
    }
    var t = w.tile[i]
    if (t === T_SHRUB) c.shrubs.push(i); else if (t === T_WATER) c.water.push(i)
    if (w.desig[i]) c.desigs.push(i)
  }
  // light: each torch throws light that fades with distance and is stopped by
  // rock and walls (a line from the torch to the cell must be clear), so a
  // torch in a corridor does not light the room behind the wall. The sun is
  // added per tick for cells under the sky; see cellLight().
  // magma glows too: only pool cells that touch open ground matter
  var fires = []
  for (var fi = 0; fi < NN; fi++) if (w.tile[fi] === T_MAGMA) {
    var fx = ix(fi), fy = iy(fi)
    if ((fx > 0 && w.tile[fi - 1] === T_OPEN) || (fx < W - 1 && w.tile[fi + 1] === T_OPEN) || (fy > 0 && w.tile[fi - W] === T_OPEN) || (fy < H - 1 && w.tile[fi + W] === T_OPEN)) fires.push(fi)
  }
  c.fires = fires
  c.light = lightField(w, c.torches, fires, null)
  c.fire = lightField(w, fires, [], null, 3, 0.9)
  w.cache = c; w.dirty = false
  return c
}
// Everything a walking dwarf can stand on, starting from the gate and from
// wherever everyone already is. Seeding from several places matters when a
// dwarf ends up cut off: the cells around them still count as workable.
//
// Nothing in the simulation needs this - the dwarves just try to path and note
// what failed - so it is built on demand and kept for as long as the cache
// generation lives. A hold ticking in the background never pays for it.
function reachField(w) {
  var c = cache(w)
  if (c.reach) return c.reach
  var starts = [w.depot]
  for (var uq = 0; uq < w.units.length; uq++) if (w.units[uq].k === "dwarf") starts.push(w.units[uq].i)
  c.reach = reachableFrom(w, starts, null)
  return c.reach
}
// Designations that can be worked eventually: adjacent to floor a dwarf can
// actually reach, or chained to one through other designations (a dig area is
// dug from its edge inward; a staircase is dug down from the one above it).
// The old test only asked whether the neighbour was walkable, so a level with
// no stair down to it looked workable and the map never went red.
function desigOk(w) {
  var c = cache(w)
  if (c.desigOk) return c.desigOk
  var reach = reachField(w), ok = {}, queue = [], q
  function standable(ci) { return passable(w, ci) && reach[ci] }
  for (q = 0; q < c.desigs.length; q++) {
    var di = c.desigs[q], dx0 = ix(di), dy0 = iy(di), dz0 = iz(di), seed = false
    if (standable(di)) seed = true
    if (!seed && dx0 > 0 && standable(di - 1)) seed = true
    if (!seed && dx0 < W - 1 && standable(di + 1)) seed = true
    if (!seed && dy0 > 0 && standable(di - W)) seed = true
    if (!seed && dy0 < H - 1 && standable(di + W)) seed = true
    if (!seed && w.desig[di] === DG_STAIR && dz0 < D - 1 && standable(di + N)) seed = true
    if (seed) { ok[di] = true; queue.push(di) }
  }
  while (queue.length) {
    var cur = queue.pop(), cxq = ix(cur), cyq = iy(cur), czq = iz(cur), nbrs = []
    if (cxq > 0) nbrs.push(cur - 1); if (cxq < W - 1) nbrs.push(cur + 1); if (cyq > 0) nbrs.push(cur - W); if (cyq < H - 1) nbrs.push(cur + W)
    if (w.desig[cur] === DG_STAIR && czq > 0 && w.desig[cur - N] === DG_STAIR) nbrs.push(cur - N)
    for (var nq = 0; nq < nbrs.length; nq++) { var nn = nbrs[nq]; if (w.desig[nn] && !ok[nn] && (w.desig[nn] === DG_DIG || w.desig[nn] === DG_STAIR || w.desig[nn] === DG_CHOP)) { ok[nn] = true; queue.push(nn) } }
  }
  c.desigOk = ok
  return ok
}
// Sum of light from point sources with linear falloff, eased, and shadows.
// `flicker(i, k)` may return a per-source intensity (torches waver; the sim
// uses 1 everywhere, the renderer animates).
function lightField(w, sources, extra, flicker, radius, power, out) {
  var light = out || new Float32Array(NN), RAD = radius || TORCH_RADIUS, R = Math.ceil(RAD), pw = power || 1
  if (out) out.fill(0)
  var all = extra && extra.length ? sources.concat(extra) : sources
  for (var tq = 0; tq < all.length; tq++) {
    var ti = all[tq], tx = ix(ti), ty = iy(ti), tz = iz(ti)
    var amp = (flicker ? flicker(ti, tq) : 1) * pw
    for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
      if (!inb(tx + dx, ty + dy, tz)) continue
      var dd = Math.sqrt(dx * dx + dy * dy)
      if (dd >= RAD) continue
      var ci = idx(tx + dx, ty + dy, tz)
      // rock and walls only light up on the face that touches open ground:
      // that is what draws the outline of a room
      if (opaque(w, ci) && !facesOpen(w, ci)) continue
      if (dd > 1 && !lineClear(w, tx, ty, tx + dx, ty + dy, tz)) continue
      var v = (1 - dd / RAD); v = v * (2 - v) * amp
      if (v > light[ci]) light[ci] = Math.min(1, v)
      else light[ci] = Math.min(1, light[ci] + v * 0.35)
    }
  }
  return light
}
// Torch intensity for a given tick: a slow breath plus a quick jitter, each
// torch with its own phase. Deterministic, so the peek and the panel agree.
function flickerAt(w, ti, tick) {
  var ph = hash(ti) % 628 / 100
  var slow = 0.5 + 0.5 * Math.sin(tick * 0.35 + ph)
  var fast = (hash(ti * 31 + tick) & 255) / 255
  return 0.72 + 0.16 * slow + 0.14 * fast
}
// The panel and the corner window both paint from this, several times per tick
// (Canvas coalesces, the signals do not). Recomputing two full 11520-cell fields
// per paint - and allocating them - was pure waste on an old laptop, so the
// result is memoized per (world, tick, cache generation) and written into two
// buffers that outlive the frame. `cache(w)` returns a fresh object whenever the
// map changed, which is exactly when the field has to be redrawn.
var rlTorch = null, rlFire = null
var rlMemo = { w: null, tick: -1, gen: null, torch: null, fire: null }
function renderLight(w, tick) {
  var c = cache(w)
  if (rlMemo.w === w && rlMemo.tick === tick && rlMemo.gen === c) return rlMemo
  if (!rlTorch) { rlTorch = new Float32Array(NN); rlFire = new Float32Array(NN) }
  rlMemo.torch = lightField(w, c.torches, [], function (ti) { return flickerAt(w, ti, tick) }, 0, 0, rlTorch)
  rlMemo.fire = lightField(w, c.fires, [], function (ti) { return 0.8 + 0.2 * ((hash(ti * 17 + tick) & 255) / 255) }, 3, 0.9, rlFire)
  rlMemo.w = w; rlMemo.tick = tick; rlMemo.gen = c
  return rlMemo
}
function opaque(w, i) { return w.tile[i] !== T_OPEN || w.build[i] === B_WALL }
function facesOpen(w, i) {
  var x = ix(i), y = iy(i)
  return (x > 0 && !opaque(w, i - 1)) || (x < W - 1 && !opaque(w, i + 1)) || (y > 0 && !opaque(w, i - W)) || (y < H - 1 && !opaque(w, i + W))
}
// Cells between (x0,y0) and (x1,y1) on level z, excluding both ends, must be
// open (not rock, not a constructed wall) for light to pass. Bresenham, and a
// diagonal step may not squeeze between two blocked corners.
function lineClear(w, x0, y0, x1, y1, z) {
  var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy, x = x0, y = y0
  for (var guard = 0; guard < 64; guard++) {
    if (x === x1 && y === y1) return true
    var e2 = 2 * err, px = x, py = y
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
    if (x !== px && y !== py) {
      // corner cut: both orthogonal neighbours blocked means no light gets through
      if (opaque(w, idx(x, py, z)) && opaque(w, idx(px, y, z))) return false
    }
    if (x === x1 && y === y1) return true
    if (opaque(w, idx(x, y, z))) return false
  }
  return true
}
// Sunlight 0..1 by hour, season and weather. Days are long in summer and short
// in winter; there is a little moonlight at night so the surface never goes black.
function sunLevel(w) {
  var h = ((w.tick % DAY) / DAY) * 24, season = date(w).season
  var rise = season === 1 ? 5 : season === 3 ? 7.5 : 6, set = season === 1 ? 21 : season === 3 ? 17.5 : 19
  var s = 0
  if (h > rise && h < set) s = Math.sin(Math.PI * (h - rise) / (set - rise))
  s = Math.pow(s, 0.6)
  if (w.weather === 1) s *= 0.65; else if (w.weather === 2) s *= 0.8
  return 0.1 + 0.9 * s
}
function outdoor(w, i) { return iz(i) >= w.ground[i % N] }
// Light reaching a cell, 0..1: sun if it is under the sky, torches anywhere.
function cellLight(w, i, sun) {
  var c = cache(w), t = Math.max(c.light[i], c.fire[i])
  if (outdoor(w, i)) { if (sun === undefined) sun = sunLevel(w); return Math.max(sun, t) }
  return t
}
function isLit(w, i) { return cellLight(w, i) >= 0.3 }
// Nearest building of a kind that no other dwarf has claimed.
function freeBuilding(w, list, u) {
  var best = -1, bd = 1e9
  for (var k = 0; k < list.length; k++) { var i = list[k]; if (w.claim[i] && w.claim[i] !== u.id) continue; var d = dist(i, u.i); if (d < bd) { bd = d; best = i } }
  return best
}
function nearestOf(list, from) {
  var best = -1, bd = 1e9
  for (var k = 0; k < list.length; k++) { var d = dist(list[k], from); if (d < bd) { bd = d; best = list[k] } }
  return best
}
function recount(w) {
  var c = {}
  for (var k = 0; k < w.items.length; k++) { var t = w.items[k].t; c[t] = (c[t] || 0) + 1 }
  w.counts = c
}

// ---- items helpers ----------------------------------------------------------
function itemsAt(w, i) { var r = []; for (var k = 0; k < w.items.length; k++) if (w.items[k].i === i && !w.items[k].by) r.push(w.items[k]); return r }
function countItems(w, type) { if (!w.counts) recount(w); return w.counts[type] || 0 }
function freeItem(w, type, from, u, ignoreUnreach) {
  // Nearest unreserved, not carried, reachable item of `type`.
  var best = null, bd = 1e9
  for (var k = 0; k < w.items.length; k++) {
    var it = w.items[k]
    if (it.t !== type || it.res || it.by) continue
    var d = dist(it.i, from)
    if (d < bd && (ignoreUnreach || !w.unreach["i" + it.id])) { bd = d; best = it }
  }
  return best
}
function stockpileSpot(w, from) {
  var stocks = cache(w).stocks
  if (stocks.length === 0) return -1
  var load = {}
  for (var k = 0; k < w.items.length; k++) { var it = w.items[k]; if (!it.by && w.build[it.i] === B_STOCK) load[it.i] = (load[it.i] || 0) + 1 }
  var best = -1, bd = 1e9
  for (var q = 0; q < stocks.length; q++) {
    var i = stocks[q]
    if ((load[i] || 0) >= 6) continue
    var d = dist(i, from); if (d < bd) { bd = d; best = i }
  }
  return best
}
function onStockpile(w, it) { return w.build[it.i] === B_STOCK }
function findBuilding(w, b, from) {
  var c = cache(w)
  var list = b === B_STILL ? c.stills : b === B_WORKSHOP ? c.shops : b === B_TABLE ? c.tables : b === B_BED ? c.beds : b === B_STATUE ? c.statues
    : b === B_KITCHEN ? c.kitchens : b === B_SMELTER ? c.smelters : b === B_FORGE ? c.forges : b === B_TRAINING ? c.trainings : b === B_JEWELER ? c.jewelers : null
  if (list) return nearestOf(list, from)
  var best = -1, bd = 1e9
  for (var i = 0; i < NN; i++) if (w.build[i] === b) { var d = dist(i, from); if (d < bd) { bd = d; best = i } }
  return best
}

// ---- jobs -------------------------------------------------------------------
function dropJob(w, u) {
  var j = u.job; if (!j) return
  if (j.item) { var it = itemById(w, j.item); if (it && it.res === u.id) it.res = 0 }
  if (j.i >= 0 && w.claim && w.claim[j.i] === u.id) w.claim[j.i] = 0
  if (u.carry) { var c = itemById(w, u.carry); if (c) { c.by = 0; c.res = 0; c.i = u.i } u.carry = 0 }
  u.job = null; u.path = null; u.pi = 0
}
function setJob(w, u, job) { dropJob(w, u); u.job = job; if (job.i >= 0 && job.claims) w.claim[job.i] = u.id }
function go(w, u, goalFn, hint, limit) {
  var p = findPath(w, u.i, goalFn, hint, u, limit)
  if (!p) return false
  u.path = p; u.pi = 0; return true
}
// One step along the path. Returns -1 when the next cell is blocked, 0 while
// still walking, 1 when the end is reached (the path is cleared then).
// The first version returned a boolean and callers read "not there yet" as
// "blocked": every eat and drink job was dropped after its first step and
// dwarves starved next to full larders.
function step(w, u) {
  if (!u.path) return 1
  if (u.pi >= u.path.length) { u.path = null; return 1 }
  var nx = u.path[u.pi]
  if (!passableFor(w, nx, u)) { u.path = null; return -1 }
  u.i = nx; u.pi++
  if (u.carry) { var c = itemById(w, u.carry); if (c) c.i = u.i }
  if (u.pi >= u.path.length) { u.path = null; return 1 }
  return 0
}
function pickUp(w, u, it) { it.by = u.id; it.res = u.id; u.carry = it.id; it.i = u.i }
function putDown(w, u) { if (!u.carry) return null; var it = itemById(w, u.carry); if (it) { it.by = 0; it.res = 0; it.i = u.i } u.carry = 0; return it }
function consumeCarried(w, u) { if (!u.carry) return; var id = u.carry; u.carry = 0; removeItem(w, id) }
function removeItem(w, id) { for (var k = 0; k < w.items.length; k++) if (w.items[k].id === id) { w.items.splice(k, 1); return } }

function skillMul(u, s) {
  var m = 1 + 0.12 * (u.skills[s] || 0) * (u.trait === "preguiçoso" ? 0.7 : 1)
  if (s === "mine" && u.tool === "pick") m *= 1.6
  if (s === "wood" && u.tool === "axe") m *= 1.6
  return m
}
function gainSkill(w, u, s, n) {
  u.xp = u.xp || {}
  u.xp[s] = (u.xp[s] || 0) + (n || 1)
  var lvl = u.skills[s] || 0
  if (u.xp[s] >= (lvl + 1) * 6 && lvl < 15) {
    u.skills[s] = lvl + 1; u.xp[s] = 0
    if (lvl + 1 === 12) announce(w, u.name + " tornou-se lendário em " + SKILL_NAME[s] + "!", 1)
  }
}
function skillTitle(u) {
  var best = "", bl = -1
  for (var k in u.skills) if (u.skills[k] > bl) { bl = u.skills[k]; best = k }
  var pre = bl >= 12 ? "Lendário " : bl >= 8 ? "Mestre " : bl >= 4 ? "" : "Aprendiz de "
  var names = { mine: "minerador", wood: "lenhador", farm: "fazendeiro", build: "pedreiro", craft: "artesão", fight: "guerreiro", brew: "cervejeiro" }
  return bl <= 0 ? "camponês" : pre + names[best]
}

// Pick the nearest designation this dwarf could plausibly do.
function findDesignation(w, u) {
  var ds = cache(w).desigs, cands = []
  for (var q = 0; q < ds.length; q++) {
    var i = ds[q], d = w.desig[i]
    if (d === DG_NONE) continue
    if (w.claim[i] && w.claim[i] !== u.id) continue
    var ur = w.unreach[i]; if (ur && ur > w.tick) continue
    var dd = dist(i, u.i)
    if (d === DG_DIG || d === DG_STAIR) dd -= u.skills.mine * 1.5
    else if (d === DG_CHOP) dd -= u.skills.wood * 1.5
    else if (d === DG_BUILD) dd -= u.skills.build * 1.5
    cands.push([dd, i, d])
  }
  if (cands.length === 0) return false
  cands.sort(function (a, b) { return a[0] - b[0] })
  for (var t = 0; t < Math.min(3, cands.length); t++) {
    var i2 = cands[t][1], kind = cands[t][2]
    if (kind === DG_BUILD) {
      var info = BUILD_INFO[w.dbuild[i2]]
      var job = { k: "build", i: i2, claims: true, bt: w.dbuild[i2], stage: info.mat ? "fetch" : "go", item: 0, prog: 0 }
      if (info.mat) {
        var it = freeItem(w, info.mat, u.i, u)
        if (!it) { w.unreach[i2] = w.tick + 120; continue }
        if (!go(w, u, function (c) { return c === it.i }, it.i)) { w.unreach["i" + it.id] = true; w.unreach[i2] = w.tick + 80; continue }
        it.res = u.id; job.item = it.id
      } else if (!go(w, u, workSpots(w, i2, false), i2)) { w.unreach[i2] = w.tick + 150; continue }
      setJob(w, u, job); return true
    }
    var forStair = kind === DG_STAIR
    if (!go(w, u, workSpots(w, i2, forStair), i2)) { w.unreach[i2] = w.tick + 150; continue }
    setJob(w, u, { k: kind === DG_CHOP ? "chop" : "dig", i: i2, claims: true, prog: 0, stair: forStair })
    return true
  }
  return false
}

function finishDig(w, u, i, stair) {
  var t = w.tile[i]
  if (t === T_STONE) addItem(w, "stone", i)
  else if (t === T_ORE) addItem(w, "ore", i)
  else if (t === T_GEM) { addItem(w, "gem", i); thought(w, u, "encontrou uma gema", 4) }
  if (t !== T_OPEN) w.floor[i] = t === T_SOIL ? F_SOIL : F_STONE
  w.tile[i] = T_OPEN
  if (stair) {
    w.build[i] = B_STAIR
    var above = i + N
    if (iz(i) < D - 1 && w.tile[above] === T_OPEN && w.floor[above] !== F_NONE && (w.build[above] === B_NONE || w.build[above] === B_STOCK)) w.build[above] = B_STAIR
  }
  w.desig[i] = DG_NONE; w.claim[i] = 0; w.dirty = true
  w.stats.dug++
  gainSkill(w, u, "mine", 1)
  // digging next to a liquid lets it in. This is the whole point of z-levels.
  checkBreach(w, i)
}
function checkBreach(w, i) {
  var x = ix(i), y = iy(i), z = iz(i), ns = [], k
  if (x > 0) ns.push(i - 1); if (x < W - 1) ns.push(i + 1); if (y > 0) ns.push(i - W); if (y < H - 1) ns.push(i + W)
  if (z < D - 1) ns.push(i + N)
  for (k = 0; k < ns.length; k++) {
    var t = w.tile[ns[k]]
    if (t === T_WATER || t === T_MAGMA) {
      w.tile[i] = t; if (w.floor[i] === F_NONE) w.floor[i] = F_STONE
      w.build[i] = B_NONE; w.desig[i] = DG_NONE; w.dirty = true
      if (t === T_WATER) announce(w, "Água! A escavação rompeu o riacho.", 2)
      else announce(w, "Magma! A escavação rompeu o mar de magma.", 2)
      legend(w, t === T_WATER ? "Inundação em " + w.name + "." : "Magma invadiu " + w.name + ".")
      return
    }
  }
}
// Liquids creep into open cells one at a time until their budget runs out.
// Not hydraulics — just enough to make a breach matter.
function spreadLiquids(w) {
  if (w.tick % 2 !== 0) return
  var budget = w.liquidBudget
  if (budget.water <= 0 && budget.magma <= 0) return
  var start = ri(w, NN)
  for (var s = 0; s < NN; s += 7) {
    var i = (start + s) % NN, t = w.tile[i]
    if (t !== T_WATER && t !== T_MAGMA) continue
    var key = t === T_WATER ? "water" : "magma"
    if (budget[key] <= 0) continue
    var x = ix(i), y = iy(i), z = iz(i), cands = []
    if (z > 0 && w.tile[i - N] === T_OPEN && w.floor[i - N] !== F_NONE && w.floor[i] === F_NONE) cands.push(i - N)
    if (x > 0 && w.tile[i - 1] === T_OPEN && w.floor[i - 1] !== F_NONE) cands.push(i - 1)
    if (x < W - 1 && w.tile[i + 1] === T_OPEN && w.floor[i + 1] !== F_NONE) cands.push(i + 1)
    if (y > 0 && w.tile[i - W] === T_OPEN && w.floor[i - W] !== F_NONE) cands.push(i - W)
    if (y < H - 1 && w.tile[i + W] === T_OPEN && w.floor[i + W] !== F_NONE) cands.push(i + W)
    // only spread from a breach: natural bodies at the surface stay put
    // unless a dug cell touches them (dug cells have no grass)
    var open = []
    for (var c = 0; c < cands.length; c++) {
      var ci = cands[c]
      if (w.floor[ci] === F_GRASS || w.floor[ci] === F_MOSS) continue
      if (iz(ci) === w.ground[iy(ci) * W + ix(ci)] && w.floor[ci] === F_SOIL && w.build[ci] === B_NONE && w.desig[ci] === DG_NONE) continue
      open.push(ci)
    }
    if (open.length === 0) continue
    var target = pick(w, open)
    w.tile[target] = t; w.build[target] = B_NONE; w.desig[target] = DG_NONE; w.grow[target] = 0; w.claim[target] = 0; w.dirty = true
    budget[key]--
    // items drown or burn
    for (var k = w.items.length - 1; k >= 0; k--) if (w.items[k].i === target && !w.items[k].by) { if (t === T_MAGMA) w.items.splice(k, 1) }
    return
  }
}

// ---- needs ------------------------------------------------------------------
function needJob(w, u) {
  if (u.thirst > 65) {
    var b = freeItem(w, "booze", u.i, u, true)
    if (b && go(w, u, function (c) { return c === b.i }, b.i)) { b.res = u.id; setJob(w, u, { k: "drink", i: b.i, item: b.id, prog: 0 }); return true }
    // water: stand next to a water tile
    if (go(w, u, function (c) { return touchesWater(w, c) }, nearestTile(w, u.i, T_WATER), 7000)) { setJob(w, u, { k: "drinkwater", i: -1, prog: 0 }); return true }
  }
  if (u.hunger > 65) {
    var f = freeItem(w, "meal", u.i, u, true) || freeItem(w, "food", u.i, u, true)
    if (f && go(w, u, function (c) { return c === f.i }, f.i)) { f.res = u.id; setJob(w, u, { k: "eat", i: f.i, item: f.id, prog: 0 }); return true }
    if (go(w, u, function (c) { return touchesTile(w, c, T_SHRUB) }, nearestTile(w, u.i, T_SHRUB), 7000)) { setJob(w, u, { k: "forage", i: -1, prog: 0 }); return true }
  }
  if (u.sleep > 75) {
    if (u.bed < 0 || w.build[u.bed] !== B_BED) { u.bed = -1; var bi = claimBed(w, u); if (bi >= 0) u.bed = bi }
    if (u.bed >= 0 && go(w, u, function (c) { return c === u.bed }, u.bed)) { setJob(w, u, { k: "sleep", i: u.bed, prog: 0, bed: true }); return true }
    setJob(w, u, { k: "sleep", i: u.i, prog: 0, bed: false }); return true
  }
  return false
}
function claimBed(w, u) {
  var taken = {}
  for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "dwarf" && w.units[k].bed >= 0) taken[w.units[k].bed] = true
  var best = -1, bd = 1e9, beds = cache(w).beds
  for (var q = 0; q < beds.length; q++) { var i = beds[q]; if (taken[i]) continue; var d = dist(i, u.i); if (d < bd) { bd = d; best = i } }
  return best
}
function touchesTile(w, c, tt) {
  var x = ix(c), y = iy(c)
  return (x > 0 && w.tile[c - 1] === tt) || (x < W - 1 && w.tile[c + 1] === tt) || (y > 0 && w.tile[c - W] === tt) || (y < H - 1 && w.tile[c + W] === tt)
}
function touchesWater(w, c) { return touchesTile(w, c, T_WATER) }
function nearestTile(w, from, tt) {
  var c = cache(w), list = tt === T_WATER ? c.water : tt === T_SHRUB ? c.shrubs : null
  if (list) { var n = nearestOf(list, from); return n < 0 ? from : n }
  var best = from, bd = 1e9
  for (var i = 0; i < NN; i++) if (w.tile[i] === tt) { var d = dist(i, from); if (d < bd) { bd = d; best = i } }
  return best
}
function nearBuilding(w, c, b, r) {
  var x = ix(c), y = iy(c), z = iz(c)
  for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
    var xx = x + dx, yy = y + dy
    if (inb(xx, yy, z) && w.build[idx(xx, yy, z)] === b) return true
  }
  return false
}

// ---- economy jobs -----------------------------------------------------------
// What the forge should make next, in order of need.
function forgeWant(w) {
  var ds = dwarves(w), miners = 0, cutters = 0, militia = 0, picks = countItems(w, "pick"), axes = countItems(w, "axe")
  var weapons = countItems(w, "weapon"), armors = countItems(w, "armor")
  for (var k = 0; k < ds.length; k++) {
    var u = ds[k]
    if (u.tool === "pick") picks++; else if (u.skills.mine >= 2) miners++
    if (u.tool === "axe") axes++; else if (u.skills.wood >= 2) cutters++
    if (u.militia) { militia++; if (u.weapon) weapons++; if (u.armor) armors++ }
  }
  if (picks < Math.min(4, miners)) return "pick"
  if (weapons < militia) return "weapon"
  if (armors < militia) return "armor"
  if (axes < Math.min(2, cutters)) return "axe"
  if (countItems(w, "bar") > 6) return "craft"
  return null
}
function gearJob(w, u) {
  var want = null
  if (u.militia && !u.weapon) want = "weapon"
  else if (u.militia && !u.armor) want = "armor"
  else if (!u.tool && !u.militia && u.skills.mine >= 2) want = "pick"
  else if (!u.tool && !u.militia && u.skills.wood >= 2) want = "axe"
  if (!want) return false
  var it = freeItem(w, want, u.i, u)
  if (!it || !go(w, u, function (c) { return c === it.i }, it.i)) return false
  it.res = u.id; setJob(w, u, { k: "equip", i: -1, item: it.id, slot: want }); return true
}
function economyJob(w, u) {
  var i, it, c = cache(w)
  if (gearJob(w, u)) return true
  // farming
  var farms = c.farms
  for (var fq = 0; fq < farms.length; fq++) {
    i = farms[fq]
    if (w.claim[i] && w.claim[i] !== u.id) continue
    if (w.unreach[i] && w.unreach[i] > w.tick) continue
    if (w.grow[i] === 0 || w.grow[i] >= 200) {
      if (go(w, u, workSpots(w, i, false), i, 1500)) { setJob(w, u, { k: w.grow[i] === 0 ? "plant" : "harvest", i: i, claims: true, prog: 0 }); return true }
      w.unreach[i] = w.tick + 200
    }
  }
  // brewing first: a dry hold is an unhappy hold. Keep a raw-food reserve.
  var still = freeBuilding(w, c.stills, u)
  if (still >= 0 && countItems(w, "food") >= 5 && countItems(w, "booze") < pop(w) * 3 + 6) {
    it = freeItem(w, "food", u.i, u)
    if (it && go(w, u, function (q) { return q === it.i }, it.i)) { it.res = u.id; setJob(w, u, { k: "brew", i: still, claims: true, item: it.id, stage: "fetch", prog: 0 }); return true }
  }
  // cooking: raw food into meals (two per pot)
  var kitchen = freeBuilding(w, c.kitchens, u)
  if (kitchen >= 0 && countItems(w, "food") >= 8 && countItems(w, "meal") < pop(w) + 6) {
    it = freeItem(w, "food", u.i, u)
    if (it && go(w, u, function (q) { return q === it.i }, it.i)) { it.res = u.id; setJob(w, u, { k: "cook", i: kitchen, claims: true, item: it.id, stage: "fetch", prog: 0 }); return true }
  }
  // gathering: when the larder runs low, pick shrubs
  if (countItems(w, "food") < pop(w) + 2 && c.shrubs.length > 0) {
    var sh = nearestTile(w, u.i, T_SHRUB)
    if (w.tile[sh] === T_SHRUB && !(w.claim[sh] && w.claim[sh] !== u.id) && dist(sh, u.i) < 40 && go(w, u, workSpots(w, sh, false), sh, 5000)) {
      setJob(w, u, { k: "chop", i: sh, claims: true, prog: 0 }); return true
    }
  }
  // smelting: ore into bars while there is ore
  var smelter = freeBuilding(w, c.smelters, u)
  if (smelter >= 0 && countItems(w, "ore") > 0 && countItems(w, "bar") < 12) {
    it = freeItem(w, "ore", u.i, u)
    if (it && go(w, u, function (q) { return q === it.i }, it.i)) { it.res = u.id; setJob(w, u, { k: "smelt", i: smelter, claims: true, item: it.id, stage: "fetch", prog: 0 }); return true }
  }
  // forging: bars into tools, weapons and armor, by need
  var forge = freeBuilding(w, c.forges, u)
  if (forge >= 0 && countItems(w, "bar") > 0) {
    var product = forgeWant(w)
    if (product) {
      it = freeItem(w, "bar", u.i, u)
      if (it && go(w, u, function (q) { return q === it.i }, it.i)) { it.res = u.id; setJob(w, u, { k: "forge", i: forge, claims: true, item: it.id, stage: "fetch", product: product, prog: 0 }); return true }
    }
  }
  // jeweler: rough gems are cut, cut gems set into jewelry
  var jeweler = freeBuilding(w, c.jewelers, u)
  if (jeweler >= 0) {
    var gemJob = countItems(w, "gem") > 0 ? "cut" : (countItems(w, "cutgem") > 0 && countItems(w, "jewel") < 24 ? "setgem" : null)
    if (gemJob) {
      it = freeItem(w, gemJob === "cut" ? "gem" : "cutgem", u.i, u)
      if (it && go(w, u, function (q) { return q === it.i }, it.i)) { it.res = u.id; setJob(w, u, { k: gemJob, i: jeweler, claims: true, item: it.id, stage: "fetch", prog: 0 }); return true }
    }
  }
  // crafting: trade goods from spare stone and wood
  var shop = freeBuilding(w, c.shops, u)
  if (shop >= 0 && countItems(w, "craft") < 40) {
    var mat = null
    if (countItems(w, "stone") > 4) mat = "stone"
    else if (countItems(w, "log") > 6) mat = "log"
    if (mat) {
      it = freeItem(w, mat, u.i, u)
      if (it && go(w, u, function (q) { return q === it.i }, it.i)) { it.res = u.id; setJob(w, u, { k: "craft", i: shop, claims: true, item: it.id, stage: "fetch", prog: 0 }); return true }
    }
  }
  // training: the militia drills when there is nothing else to do
  if (u.militia) {
    var yard = freeBuilding(w, c.trainings, u)
    if (yard >= 0 && chance(w, 0.5) && go(w, u, workSpots(w, yard, false), yard, 1500)) { setJob(w, u, { k: "train", i: yard, claims: true, prog: 0 }); return true }
  }
  // hauling
  var spot = stockpileSpot(w, u.i)
  if (spot >= 0) {
    var best = null, bd = 1e9
    for (var k = 0; k < w.items.length; k++) {
      var ci = w.items[k]
      if (ci.res || ci.by || onStockpile(w, ci) || ci.t === "remains") continue
      if (w.unreach["i" + ci.id]) continue
      var d = dist(ci.i, u.i); if (d < bd) { bd = d; best = ci }
    }
    if (best && go(w, u, function (c2) { return c2 === best.i }, best.i)) { best.res = u.id; setJob(w, u, { k: "haul", i: spot, item: best.id, stage: "fetch", prog: 0 }); return true }
    if (best) w.unreach["i" + best.id] = true
  }
  return false
}

function idle(w, u) {
  // Wander a little; drift toward tables (the meeting hall) when there is one.
  if (u.wait > 0) { u.wait--; return }
  u.wait = 3 + ri(w, 8)
  var target = -1
  if (chance(w, 0.35)) { var t = findBuilding(w, B_TABLE, u.i); if (t >= 0 && dist(t, u.i) < 25) target = t }
  if (target < 0) {
    var x = ix(u.i) + ri(w, 7) - 3, y = iy(u.i) + ri(w, 7) - 3
    if (inb(x, y, iz(u.i))) target = idx(x, y, iz(u.i))
  }
  if (target >= 0 && passable(w, target)) go(w, u, function (c) { return c === target }, target, 400)
  // socializing
  if (nearBuilding(w, u.i, B_TABLE, 2) && chance(w, 0.08)) {
    for (var k = 0; k < w.units.length; k++) { var o = w.units[k]; if (o !== u && o.k === "dwarf" && dist(o.i, u.i) <= 2) { thought(w, u, "conversou com " + o.name.split(" ")[0], 2); break } }
  }
  if (nearBuilding(w, u.i, B_STATUE, 2) && chance(w, 0.05)) thought(w, u, "admirou uma bela estátua", 3)
}

// ---- job execution ----------------------------------------------------------
function work(w, u) {
  var j = u.job, it
  if (!j) return
  // walking phase
  if (u.path) { var r = step(w, u); if (r < 0) { if (!repath(w, u)) dropJob(w, u); return } if (r === 0) return }
  switch (j.k) {
    case "dig":
      if (w.desig[j.i] === DG_NONE && !j.stair) { dropJob(w, u); return }
      j.prog += skillMul(u, "mine")
      if (j.prog >= 14) {
        var wasSolid = solid(w.tile[j.i])
        if (!j.stair && !wasSolid) { w.desig[j.i] = DG_NONE; dropJob(w, u); return }
        finishDig(w, u, j.i, j.stair)
        dropJob(w, u)
      }
      return
    case "chop":
      j.prog += skillMul(u, "wood")
      if (j.prog >= 16) {
        var t = w.tile[j.i]
        w.tile[j.i] = T_OPEN; if (w.floor[j.i] === F_NONE) w.floor[j.i] = F_GRASS
        w.desig[j.i] = DG_NONE; w.dirty = true
        if (t === T_SHRUB) addItem(w, "food", j.i)
        else { addItem(w, "log", j.i); if (chance(w, 0.5)) addItem(w, "log", j.i) }
        w.stats.chopped++; gainSkill(w, u, "wood", 1)
        dropJob(w, u)
      }
      return
    case "build":
      if (w.desig[j.i] !== DG_BUILD) { dropJob(w, u); return }
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (!go(w, u, workSpots(w, j.i, false), j.i)) { w.unreach[j.i] = w.tick + 150; dropJob(w, u) }
        return
      }
      var info = BUILD_INFO[j.bt]
      j.prog += skillMul(u, "build")
      if (j.prog >= info.work) {
        if (info.mat) consumeCarried(w, u)
        w.build[j.i] = j.bt; w.desig[j.i] = DG_NONE; w.dbuild[j.i] = 0; w.grow[j.i] = 0; w.dirty = true
        w.stats.built++; gainSkill(w, u, "build", 1)
        if (j.bt === B_STOCK || j.bt === B_FARM) {} else thought(w, u, "construiu " + info.name, 1)
        if (j.bt === B_WALL && u.i === j.i) u.i = nearestPassable(w, u.i)
        dropJob(w, u)
      }
      return
    case "plant":
      if (w.build[j.i] !== B_FARM) { dropJob(w, u); return }
      j.prog += skillMul(u, "farm")
      if (j.prog >= 10) { w.grow[j.i] = 1; gainSkill(w, u, "farm", 1); dropJob(w, u) }
      return
    case "harvest":
      if (w.build[j.i] !== B_FARM) { dropJob(w, u); return }
      j.prog += skillMul(u, "farm")
      if (j.prog >= 10) {
        w.grow[j.i] = 0; addItem(w, "food", j.i); if (u.skills.farm >= 4 || chance(w, 0.5)) addItem(w, "food", j.i)
        gainSkill(w, u, "farm", 1); dropJob(w, u)
      }
      return
    case "equip":
      it = itemById(w, j.item)
      if (!it || it.i !== u.i) { dropJob(w, u); return }
      removeItem(w, it.id)
      if (j.slot === "weapon") u.weapon = true; else if (j.slot === "armor") u.armor = true; else u.tool = j.slot
      thought(w, u, j.slot === "weapon" ? "pegou em armas" : j.slot === "armor" ? "vestiu uma armadura" : "ganhou uma " + ITEM_NAME[j.slot] + " nova", 2)
      dropJob(w, u); return
    case "train":
      if (w.build[j.i] !== B_TRAINING) { dropJob(w, u); return }
      j.prog++
      if (j.prog >= 20) { gainSkill(w, u, "fight", 2); if (chance(w, 0.3)) thought(w, u, "treinou com os companheiros", 1); dropJob(w, u) }
      return
    case "cut": case "setgem":
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (!go(w, u, workSpots(w, j.i, false), j.i)) dropJob(w, u)
        return
      }
      j.prog += skillMul(u, "craft")
      if (j.prog >= (j.k === "cut" ? 26 : 34)) {
        consumeCarried(w, u)
        if (j.k === "cut") { addItem(w, "cutgem", j.i); w.stats.cut = (w.stats.cut || 0) + 1; thought(w, u, "lapidou uma gema", 2) }
        else { addItem(w, "jewel", j.i); w.stats.jewels = (w.stats.jewels || 0) + 1; u.made++; thought(w, u, "fez uma joia", 3) }
        gainSkill(w, u, "craft", 1)
        dropJob(w, u)
      }
      return
    case "cook": case "smelt": case "forge":
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (!go(w, u, workSpots(w, j.i, false), j.i)) dropJob(w, u)
        return
      }
      j.prog += skillMul(u, j.k === "cook" ? "brew" : "craft")
      if (j.prog >= (j.k === "cook" ? 16 : j.k === "smelt" ? 24 : 30)) {
        consumeCarried(w, u)
        if (j.k === "cook") { addItem(w, "meal", j.i); addItem(w, "meal", j.i); w.stats.cooked = (w.stats.cooked || 0) + 1; gainSkill(w, u, "brew", 1) }
        else if (j.k === "smelt") { addItem(w, "bar", j.i); w.stats.smelted = (w.stats.smelted || 0) + 1; gainSkill(w, u, "craft", 1) }
        else { addItem(w, j.product, j.i); w.stats.forged = (w.stats.forged || 0) + 1; u.made++; gainSkill(w, u, "craft", 1); if (j.product !== "craft") thought(w, u, "forjou uma " + ITEM_NAME[j.product], 2) }
        dropJob(w, u)
      }
      return
    case "brew": case "craft":
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (!go(w, u, workSpots(w, j.i, false), j.i)) dropJob(w, u)
        return
      }
      var isBrew = j.k === "brew"
      j.prog += skillMul(u, isBrew ? "brew" : "craft")
      if (j.prog >= (isBrew ? 22 : 30)) {
        var mat = itemById(w, j.item); var matType = mat ? mat.t : "stone"
        consumeCarried(w, u)
        if (isBrew) { for (var q = 0; q < 3; q++) addItem(w, "booze", j.i); w.stats.brewed++; gainSkill(w, u, "brew", 1) }
        else {
          addItem(w, "craft", j.i); w.stats.crafted++; u.made++; gainSkill(w, u, "craft", 1)
          if (u.skills.craft >= 8 && chance(w, 0.2)) thought(w, u, "criou uma obra-prima", 4)
        }
        dropJob(w, u)
      }
      return
    case "haul":
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (w.build[j.i] !== B_STOCK || !go(w, u, function (c) { return c === j.i }, j.i)) dropJob(w, u)
        return
      }
      putDown(w, u); dropJob(w, u); return
    case "eat":
      it = itemById(w, j.item)
      if (!it || it.i !== u.i) { dropJob(w, u); return }
      j.prog++
      if (j.prog >= 6) {
        var cooked = it.t === "meal"
        removeItem(w, it.id); u.hunger = 0
        var table = nearBuilding(w, u.i, B_TABLE, 1), litHere = isLit(w, u.i)
        if (cooked && table) thought(w, u, litHere ? "jantou uma refeição preparada à luz de tochas" : "comeu uma refeição preparada à mesa", litHere ? 6 : 5)
        else if (table) thought(w, u, litHere ? "comeu à mesa, num salão iluminado" : "comeu à mesa no escuro", litHere ? 3 : 2)
        else thought(w, u, cooked ? "comeu uma refeição preparada sem mesa" : "comeu sem mesa", cooked ? 2 : -1)
        dropJob(w, u)
      }
      return
    case "forage":
      j.prog++
      if (j.prog >= 8) { u.hunger = Math.max(0, u.hunger - 60); thought(w, u, "comeu frutinhas do mato", -1); dropJob(w, u) }
      return
    case "drink":
      it = itemById(w, j.item)
      if (!it || it.i !== u.i) { dropJob(w, u); return }
      j.prog++
      if (j.prog >= 5) { removeItem(w, it.id); u.thirst = 0; thought(w, u, "bebeu cerveja de cogumelo", 4); dropJob(w, u) }
      return
    case "drinkwater":
      j.prog++
      if (j.prog >= 5) { u.thirst = 0; thought(w, u, "teve que beber água", -2); dropJob(w, u) }
      return
    case "sleep":
      j.prog++
      u.sleep = Math.max(0, u.sleep - (j.bed ? 3.5 : 2.5))
      if (u.sleep <= 0) {
        var bedLit = isLit(w, u.i)
        if (j.bed) thought(w, u, bedLit ? "dormiu numa cama, num quarto iluminado" : "dormiu numa cama no escuro", bedLit ? 4 : 2)
        else thought(w, u, "dormiu no chão", -3)
        dropJob(w, u)
      }
      return
    case "flee":
      dropJob(w, u); return
    case "mood":
      strangeMoodWork(w, u); return
    case "leave":
      // merchants and kobolds walking off the map
      removeUnit(w, u); return
    case "trade":
      return
  }
}
function repath(w, u) {
  var j = u.job; if (!j) return false
  if (j.k === "dig" || j.k === "chop") return go(w, u, workSpots(w, j.i, j.stair), j.i)
  if (j.k === "build" || j.k === "plant" || j.k === "harvest" || j.k === "cook" || j.k === "smelt" || j.k === "forge" || j.k === "brew" || j.k === "craft" || j.k === "cut" || j.k === "setgem") {
    if (j.stage === "fetch") { var it = itemById(w, j.item); return !!it && go(w, u, function (c) { return c === it.i }, it.i) }
    return go(w, u, workSpots(w, j.i, false), j.i)
  }
  return false
}
function nearestPassable(w, i) {
  var x = ix(i), y = iy(i), z = iz(i)
  for (var r = 1; r < 4; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
    if (!inb(x + dx, y + dy, z)) continue
    var c = idx(x + dx, y + dy, z); if (passable(w, c)) return c
  }
  return i
}

// ---- strange moods ----------------------------------------------------------
function maybeStrangeMood(w) {
  if (w.tick - w.lastMoodTick < YEAR / 3 || w.tick < YEAR / 8) return
  if (!chance(w, 0.0025)) return
  var ds = dwarves(w).filter(function (u) { return !u.mood_state && !(u.job && u.job.k === "sleep") })
  if (ds.length === 0) return
  var u = pick(w, ds)
  w.lastMoodTick = w.tick
  var mats = ["log", "stone", "gem", "ore"]
  var want = pick(w, mats)
  u.mood_state = "strange"; u.moodWant = want; u.moodSince = w.tick
  setJob(w, u, { k: "mood", i: -1, stage: "claim", want: want, prog: 0, since: w.tick })
  announce(w, u.name + " foi tomado por um humor estranho!", 1)
}
function strangeMoodWork(w, u) {
  var j = u.job
  if (j.stage === "claim") {
    var shop = findBuilding(w, B_WORKSHOP, u.i)
    if (shop < 0) {
      if (w.tick - j.since > DAY * 2) { announce(w, u.name + " não encontrou uma oficina e mergulhou na melancolia.", 2); u.mood_state = "melancholy"; dropJob(w, u) }
      return
    }
    if (!go(w, u, function (c) { return c === shop }, shop)) { if (w.tick - j.since > DAY * 2) { u.mood_state = "melancholy"; dropJob(w, u) } return }
    j.i = shop; j.stage = "goclaim"; return
  }
  if (j.stage === "goclaim") {
    w.claim[j.i] = u.id
    announce(w, u.name + " reivindicou a oficina e resmunga sobre '" + ITEM_NAME[j.want] + "'.", 1)
    j.stage = "fetch"; j.since = w.tick; return
  }
  if (j.stage === "fetch") {
    if (u.carry) { j.stage = "back"; if (!go(w, u, function (c) { return c === j.i }, j.i)) j.stage = "fetch"; return }
    var it = freeItem(w, j.want, u.i, u)
    if (it && go(w, u, function (c) { return c === it.i }, it.i)) { it.res = u.id; j.item = it.id; j.stage = "pick"; return }
    if (w.tick - j.since > DAY * 3) {
      w.claim[j.i] = 0
      if (chance(w, 0.5)) { announce(w, u.name + " enlouqueceu! Correu berrando pela fortaleza.", 2); u.mood_state = "berserk" }
      else { announce(w, u.name + " caiu em melancolia sem seu " + ITEM_NAME[j.want] + ".", 2); u.mood_state = "melancholy" }
      legend(w, u.name + " perdeu a razão num humor estranho.")
      dropJob(w, u)
    }
    return
  }
  if (j.stage === "pick") {
    var it2 = itemById(w, j.item)
    if (!it2 || it2.i !== u.i) { j.stage = "fetch"; return }
    pickUp(w, u, it2); j.stage = "back"
    if (!go(w, u, function (c) { return c === j.i }, j.i)) j.stage = "fetch"
    return
  }
  if (j.stage === "back") {
    if (u.i !== j.i) { j.stage = "fetch"; return }
    j.stage = "work"; j.prog = 0
    announce(w, u.name + " trabalha furiosamente na oficina.", 0)
    return
  }
  if (j.stage === "work") {
    j.prog++
    if (j.prog >= DAY) {
      consumeCarried(w, u)
      var nm = artifactName(w, j.want).split("|")
      var art = addItem(w, "artifact", j.i); art.name = nm[0]; art.title = nm[1]; art.desc = nm[2]; art.maker = u.name
      w.artifacts.push({ name: nm[0], title: nm[1], desc: nm[2], maker: u.name, t: w.tick })
      w.stats.artifacts++
      u.skills.craft = Math.max(u.skills.craft, 12)
      u.mood_state = ""; thought(w, u, "criou um artefato lendário", 25)
      w.claim[j.i] = 0
      announce(w, u.name + " criou " + nm[0] + ", '" + nm[1] + "', " + nm[2], 1)
      legend(w, u.name + " criou o artefato " + nm[0] + ", '" + nm[1] + "'.")
      dropJob(w, u)
    }
  }
}

// ---- moods & tantrums -------------------------------------------------------
function moodTick(w, u) {
  // drift toward a baseline the trait sets
  var base = u.trait === "alegre" ? 58 : u.trait === "melancólico" ? 42 : u.trait === "rabugento" ? 46 : 50
  if (w.tick % 12 === 0) u.mood += u.mood > base ? -1 : 1
  if (u.hunger > 90 && w.tick % 25 === 0) thought(w, u, "está faminto", -3)
  if (u.thirst > 90 && w.tick % 25 === 0) thought(w, u, "está morrendo de sede", -3)
  if (u.sleep > 95 && w.tick % 25 === 0) thought(w, u, "está exausto", -2)
  if (u.mood_state === "melancholy") {
    if (w.tick % 30 === 0) u.mood = Math.max(0, u.mood - 1)
    if (chance(w, 0.0004)) die(w, u, "definhou de melancolia")
    return
  }
  if (u.mood_state === "berserk") {
    if (chance(w, 0.003)) die(w, u, "morreu de exaustão em fúria")
    return
  }
  if (u.mood_state === "strange") return
  if (u.mood <= 12 && chance(w, 0.01)) tantrum(w, u)
  if (u.mood <= 3 && chance(w, 0.002)) { u.mood_state = "melancholy"; announce(w, u.name + " afundou na melancolia.", 2); dropJob(w, u) }
}
function tantrum(w, u) {
  u.mood += 15
  dropJob(w, u)
  // break something nearby, or hit someone
  var x = ix(u.i), y = iy(u.i), z = iz(u.i), targets = []
  for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
    if (!inb(x + dx, y + dy, z)) continue
    var c = idx(x + dx, y + dy, z), b = w.build[c]
    if (b === B_BED || b === B_TABLE || b === B_DOOR || b === B_STATUE) targets.push(c)
  }
  var victim = null
  for (var k = 0; k < w.units.length; k++) { var o = w.units[k]; if (o !== u && o.k === "dwarf" && dist(o.i, u.i) <= 2) { victim = o; break } }
  if (victim && chance(w, 0.5)) {
    victim.hp -= 2; thought(w, victim, "foi agredido por " + u.name.split(" ")[0], -8)
    announce(w, u.name + " teve um acesso de fúria e agrediu " + victim.name + "!", 2)
    if (victim.hp <= 0) die(w, victim, "foi morto por " + u.name + " num acesso de fúria")
  } else if (targets.length > 0) {
    var c2 = pick(w, targets); var nm = BUILD_INFO[w.build[c2]].name
    removeBuilding(w, c2, false)
    announce(w, u.name + " teve um acesso de fúria e destruiu uma " + nm + "!", 2)
  } else announce(w, u.name + " teve um acesso de fúria!", 2)
  // witnesses
  for (var k2 = 0; k2 < w.units.length; k2++) { var o2 = w.units[k2]; if (o2 !== u && o2.k === "dwarf" && dist(o2.i, u.i) <= 6) thought(w, o2, "presenciou um acesso de fúria", -3) }
}

// ---- death ------------------------------------------------------------------
function die(w, u, how) {
  if (u.k === "dwarf") {
    announce(w, u.name + " " + how + ".", 2)
    legend(w, u.name + ", " + skillTitle(u) + ", " + how + ".")
    w.dead.push({ name: u.name, t: w.tick, how: how })
    if (w.dead.length > 200) w.dead.splice(0, w.dead.length - 200)
    w.stats.deaths++
    if (w.raid) w.raid.lost++
    for (var k = 0; k < w.units.length; k++) { var o = w.units[k]; if (o !== u && o.k === "dwarf") thought(w, o, "perdeu " + u.name.split(" ")[0], o.trait === "melancólico" ? -12 : -7) }
    if (w.tile[u.i] === T_OPEN) {
      addItem(w, "remains", u.i)
      if (u.weapon) addItem(w, "weapon", u.i)
      if (u.armor) addItem(w, "armor", u.i)
      if (u.tool) addItem(w, u.tool, u.i)
    }
  }
  removeUnit(w, u)
}
function removeUnit(w, u) {
  dropJob(w, u)
  if (u.carry) { var c = itemById(w, u.carry); if (c) { c.by = 0; c.res = 0; c.i = u.i } }
  // dropJob above releases the job's claim; the sweep catches anything a mood
  // or an interrupted stage left behind. Only dwarves ever claim, and goblins
  // die by the dozen, so skipping them saves an 11520-cell scan per kill.
  if (u.k === "dwarf") for (var i = 0; i < NN; i++) if (w.claim[i] === u.id) w.claim[i] = 0
  var k = w.units.indexOf(u); if (k >= 0) w.units.splice(k, 1)
}

// ---- combat -----------------------------------------------------------------
function hostile(u) { return u.k === "goblin" || u.k === "wolf" || (u.k === "dwarf" && u.mood_state === "berserk") }
function nearestUnit(w, from, pred, maxd) {
  var best = null, bd = maxd || 1e9
  for (var k = 0; k < w.units.length; k++) { var o = w.units[k]; if (!pred(o)) continue; var d = dist(o.i, from); if (d < bd) { bd = d; best = o } }
  return best
}
function attack(w, a, b) {
  var as = a.k === "dwarf" ? a.skills.fight + (a.weapon ? 3 : 0) + (a.trait === "valente" ? 1 : 0) : (a.k === "goblin" ? 1 + (a.elite ? 2 : 0) : a.k === "wolf" ? 2 : 1)
  var ds = b.k === "dwarf" ? b.skills.fight + (b.weapon ? 1 : 0) + (b.armor ? 1 : 0) : 2
  if (chance(w, Math.max(0.15, Math.min(0.9, 0.5 + 0.06 * (as - ds))))) {
    var dmg = 1 + ri(w, 3) + (a.weapon ? 1 : 0) + (a.elite ? 1 : 0)
    if (b.k === "dwarf" && b.armor) dmg = Math.max(0, dmg - 1 - (chance(w, 0.4) ? 1 : 0))
    b.hp -= dmg
    if (b.k === "goblin" && b.hp <= 0) w.stats.goblinsKilled = (w.stats.goblinsKilled || 0) + 1
    if (a.k === "dwarf") gainSkill(w, a, "fight", 1)
    if (b.hp <= 0) {
      if (a.k === "dwarf") { a.kills++; thought(w, a, "matou um " + (b.k === "goblin" ? "goblin" : b.k === "wolf" ? "lobo" : "inimigo") + " em combate", 6) }
      if (b.k === "dwarf") die(w, b, "foi morto por " + (a.k === "goblin" ? "um goblin" : a.k === "wolf" ? "um lobo" : a.name || a.k))
      else { announce(w, (b.k === "goblin" ? "Um goblin" : b.k === "wolf" ? "Um lobo" : "Um " + b.k) + " foi morto" + (a.k === "dwarf" ? " por " + a.name : "") + ".", 1); removeUnit(w, b) }
    }
  }
}
function fightOrFlee(w, u) {
  var foe = nearestUnit(w, u.i, function (o) { return o !== u && hostile(o) }, 9)
  if (!foe) return false
  var brave = u.militia || u.weapon || u.skills.fight >= 3 || u.trait === "valente" || u.mood_state === "berserk"
  if (u.job && u.job.k === "sleep") dropJob(w, u)
  if (!brave && (adjacent(u.i, foe.i) || u.i === foe.i)) { if (u.cool <= 0) { attack(w, u, foe); u.cool = 2 } return true }
  if (brave) {
    if (adjacent(u.i, foe.i) || u.i === foe.i) { if (u.cool <= 0) { attack(w, u, foe); u.cool = 2 } return true }
    if (!u.path || u.job === null || u.job.k !== "fight") { if (go(w, u, function (c) { return adjacent(c, foe.i) }, foe.i, 800)) setJob(w, u, { k: "fight", i: -1 }); else return false }
    step(w, u); return true
  }
  // flee: pick the neighbor that increases distance
  if (dist(foe.i, u.i) > 5) return false
  dropJob(w, u)
  var n = neighbors(w, u.i, u, nb), best = u.i, bd = dist(foe.i, u.i)
  for (var k = 0; k < n; k++) { var d = dist(foe.i, nb[k]); if (d > bd) { bd = d; best = nb[k] } }
  u.i = best
  return true
}
function grabWeapon(w, u) {
  if (u.weapon) return
  var it = freeItem(w, "weapon", u.i, u)
  if (it && dist(it.i, u.i) <= 12 && go(w, u, function (c) { return c === it.i }, it.i, 600)) { it.res = u.id; setJob(w, u, { k: "arm", i: -1, item: it.id }) }
}

// ---- other units ------------------------------------------------------------
function actHostile(w, u) {
  u.cool--
  var target = nearestUnit(w, u.i, function (o) { return o.k === "dwarf" || o.k === "merchant" }, 1e9)
  if (!target) { leaveMap(w, u); return }
  if (adjacent(u.i, target.i) || u.i === target.i) { if (u.cool <= 0) { attack(w, u, target); u.cool = 2 } return }
  if (!u.path || (w.tick + u.id) % 15 === 0) {
    // straight for the nearest dwarf; failing that, for the gate (the wagon
    // spot / stair top) and try again from inside
    if (!go(w, u, function (c) { return adjacent(c, target.i) }, target.i, 4000)
        && !(u.i !== w.depot && dist(u.i, w.depot) > 1 && go(w, u, function (c) { return c === w.depot || adjacent(c, w.depot) }, w.depot, 4000))) {
      // can't reach anyone: mill around; give up after a while
      u.wait++
      if (u.wait > DAY) { leaveMap(w, u); return }
      var x = ix(u.i) + ri(w, 5) - 2, y = iy(u.i) + ri(w, 5) - 2
      if (inb(x, y, iz(u.i)) && passableFor(w, idx(x, y, iz(u.i)), u)) go(w, u, function (c) { return c === idx(x, y, iz(u.i)) }, idx(x, y, iz(u.i)), 200)
      return
    }
  }
  step(w, u)
}
function leaveMap(w, u) {
  if (!u.path || u.job === null || u.job.k !== "leave") {
    var edge = edgeSurface(w)
    if (edge < 0 || !go(w, u, function (c) { return ix(c) === 0 || iy(c) === 0 || ix(c) === W - 1 || iy(c) === H - 1 }, edge, 2000)) { removeUnit(w, u); return }
    u.job = { k: "leave", i: -1 }
  }
  if (step(w, u) === 1) removeUnit(w, u)
}
function actDeer(w, u) {
  if (u.wait > 0) { u.wait--; return }
  var foe = nearestUnit(w, u.i, function (o) { return o.k !== "deer" }, 4)
  if (foe) { var n = neighbors(w, u.i, u, nb), best = u.i, bd = dist(foe.i, u.i); for (var k = 0; k < n; k++) { var d = dist(foe.i, nb[k]); if (d > bd) { bd = d; best = nb[k] } } u.i = best; return }
  if (u.path) { step(w, u); return }
  u.wait = 4 + ri(w, 12)
  var x = ix(u.i) + ri(w, 9) - 4, y = iy(u.i) + ri(w, 9) - 4
  if (inb(x, y, 0)) { var t = surfaceIdx(w, x, y); if (passable(w, t) && iz(t) === iz(u.i)) go(w, u, function (c) { return c === t }, t, 200) }
}
function actKobold(w, u) {
  // sneak to the nearest stockpiled item, grab it, run
  if (u.carry) { leaveMap(w, u); return }
  var seen = nearestUnit(w, u.i, function (o) { return o.k === "dwarf" }, 3)
  if (seen && !u.spotted) { u.spotted = true; announce(w, "Um kobold ladrão foi visto por " + seen.name + "!", 1); leaveMap(w, u); return }
  if (u.spotted) { leaveMap(w, u); return }
  if (!u.path) {
    var best = null, bd = 1e9
    for (var k = 0; k < w.items.length; k++) { var it = w.items[k]; if (it.by || it.t === "remains") continue; var d = dist(it.i, u.i); if (d < bd && (onStockpile(w, it) || it.t === "gem" || it.t === "craft")) { bd = d; best = it } }
    if (!best || !go(w, u, function (c) { return c === best.i }, best.i, 2000)) { leaveMap(w, u); return }
    u.target = best.id
  }
  if (step(w, u) === 1) {
    var it2 = itemById(w, u.target)
    if (it2 && it2.i === u.i && !it2.by) { pickUp(w, u, it2); announce(w, "Um kobold roubou " + ITEM_NAME[it2.t] + "!", 1) }
    u.path = null
  }
}
function actMerchant(w, u) {
  var c = w.caravan
  if (!c) { leaveMap(w, u); return }
  if (c.stage === "arrive") {
    if (!u.path && u.i !== c.spot) { if (!go(w, u, function (x) { return dist(x, c.spot) <= 2 }, c.spot, 3000)) { u.wait++; if (u.wait > 40) { c.stage = "leave" } return } }
    if (step(w, u) === 1) { c.arrived++; }
    return
  }
  if (c.stage === "trade") { if (u.wait > 0) { u.wait--; return } u.wait = 5 + ri(w, 10); var x = ix(c.spot) + ri(w, 5) - 2, y = iy(c.spot) + ri(w, 5) - 2; if (inb(x, y, iz(c.spot)) && passable(w, idx(x, y, iz(c.spot)))) go(w, u, function (q) { return q === idx(x, y, iz(c.spot)) }, idx(x, y, iz(c.spot)), 200); if (u.path) step(w, u); return }
  leaveMap(w, u)
}

// ---- events -----------------------------------------------------------------
function seasonStart(w, d) {
  var name = d.seasonName
  announce(w, "Chegou " + (name === "verão" || name === "outono" || name === "inverno" ? "o " : "a ") + name + ".", 0)
  w.weather = name === "inverno" ? 2 : 0
  if (w.fallen) return
  // migrants
  if (name !== "inverno" && w.tick > YEAR / 8) {
    var p = pop(w)
    if (p < w.popCap) {
      var n = 1 + ri(w, Math.min(4, 1 + Math.floor(w.wealth / 250)))
      n = Math.min(n, w.popCap - p)
      var sp = edgeSurface(w); if (sp < 0) sp = w.depot
      if (n > 0) {
        for (var k = 0; k < n; k++) addDwarf(w, nearFree(w, sp, 2))
        w.stats.migrants += n
        announce(w, n === 1 ? "Um migrante chegou." : n + " migrantes chegaram.", 1)
        legend(w, n + " migrante(s) na " + name + " do ano " + d.year + ".")
      }
    } else if (p >= w.popCap && chance(w, 0.5)) announce(w, "Migrantes deram meia-volta: a fortaleza está cheia.", 0)
  }
  // wolves in winter
  if (!w.peaceful && name === "inverno" && w.tick > YEAR / 2 && chance(w, 0.35)) {
    var ws = edgeSurface(w); if (ws >= 0) { var nw = 1; for (var q = 0; q < nw; q++) addUnit(w, "wolf", nearFree(w, ws, 1)); announce(w, "Lobos rondam a superfície.", 1) }
  }
}
// The best fighters form the militia: a third of the hold, never fewer than
// two once there are four dwarves. They pick up weapons and armor and train
// when idle; everyone else keeps to their trade and runs from trouble.
function rosterMilitia(w) {
  var ds = dwarves(w)
  if (ds.length < 3) { for (var q = 0; q < ds.length; q++) ds[q].militia = false; return }
  var want = Math.max(ds.length >= 4 ? 2 : 1, Math.ceil(ds.length / 3))
  ds.sort(function (a, b) { return (b.skills.fight + (b.weapon ? 2 : 0) + (b.armor ? 1 : 0) + (b.trait === "valente" ? 1 : 0)) - (a.skills.fight + (a.weapon ? 2 : 0) + (a.armor ? 1 : 0) + (a.trait === "valente" ? 1 : 0)) })
  for (var k = 0; k < ds.length; k++) ds[k].militia = k < want
}
// Scenario upkeep: when the ore runs out, designate the nearest vein with an
// L-shaped tunnel from the closest open cell on that level; when logs run low,
// mark trees near the gate for felling. The hold keeps mining and cutting
// without anyone giving orders, which is what makes the loops watchable.
function prospect(w) {
  var c = cache(w), hasDig = false
  for (var q = 0; q < c.desigs.length; q++) if (w.desig[c.desigs[q]] === DG_DIG) { hasDig = true; break }
  if (!hasDig && countItems(w, "ore") < 3) {
    var cz = iz(w.depot), best = -1, bd = 1e9, bx = ix(w.depot), by = iy(w.depot)
    for (var z = Math.max(2, cz - 4); z <= cz - 3; z++) for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = idx(x, y, z), t = w.tile[i]
      if (t !== T_ORE && t !== T_GEM) continue
      var d = Math.abs(x - bx) + Math.abs(y - by); if (d < bd) { bd = d; best = i }
    }
    if (best >= 0) {
      var vz = iz(best), vx = ix(best), vy = iy(best), ox = -1, oy = -1, od = 1e9
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) { var oi = idx(xx, yy, vz); if (!passable(w, oi)) continue; var dd = Math.abs(xx - vx) + Math.abs(yy - vy); if (dd < od) { od = dd; ox = xx; oy = yy } }
      if (ox >= 0) {
        designate(w, best, "dig")
        var sx = ox < vx ? 1 : -1, sy = oy < vy ? 1 : -1, px, py
        for (px = ox; px !== vx; px += sx) { var ti = idx(px, oy, vz); if (canDesignate(w, ti, "dig")) designate(w, ti, "dig") }
        for (py = oy; py !== vy; py += sy) { var tj = idx(vx, py, vz); if (canDesignate(w, tj, "dig")) designate(w, tj, "dig") }
        announce(w, "Prospecção: um novo veio foi marcado para escavação.", 0)
      }
    }
  }
  if (countItems(w, "log") < 8) {
    var hasChop = false
    for (var q2 = 0; q2 < c.desigs.length; q2++) if (w.desig[c.desigs[q2]] === DG_CHOP) { hasChop = true; break }
    if (!hasChop) {
      var trees = [], gx = ix(w.depot), gy = iy(w.depot)
      for (var ty = 0; ty < H; ty++) for (var tx = 0; tx < W; tx++) { var si = surfaceIdx(w, tx, ty); if (w.tile[si] === T_TREE) trees.push([Math.abs(tx - gx) + Math.abs(ty - gy), si]) }
      trees.sort(function (a, b) { return a[0] - b[0] })
      for (var k = 0; k < Math.min(6, trees.length); k++) designate(w, trees[k][1], "chop")
      if (trees.length) announce(w, "Lenhadores: " + Math.min(6, trees.length) + " árvores marcadas perto do portão.", 0)
    }
  }
}
// The last dwarf is dead. Losing is fun, but the world should stop pretending
// there is a fortress here: no more waves, caravans, thieves or migrants.
function checkFall(w) {
  if (w.fallen || w.tick < 10 || pop(w) > 0) return
  w.fallen = true
  announce(w, w.name + " caiu. Não resta nenhum anão.", 2)
  legend(w, w.name + " caiu no ano " + date(w).year + ". " + w.stats.deaths + " anões perdidos.")
}
function dayStart(w, d) {
  rosterMilitia(w)
  if (w.scenario && !w.fallen) prospect(w)
  if (w.scenario && !w.peaceful && !w.fallen && !w.raid && !w.caravan && w.tick >= w.scenario.nextRaid) spawnRaid(w, d, w.scenario.wave)
  // weather
  if (d.seasonName === "primavera" || d.seasonName === "outono") w.weather = chance(w, 0.3) ? 1 : 0
  else if (d.seasonName === "inverno") w.weather = chance(w, 0.8) ? 2 : 0
  else w.weather = chance(w, 0.08) ? 1 : 0
  // caravan
  if (d.seasonName === "outono" && d.day === 3 && !w.caravan && !w.raid && !w.fallen) {
    var sp = edgeSurface(w)
    if (sp >= 0) {
      w.caravan = { stage: "arrive", spot: w.depot, arrived: 0, days: 0, n: 3 }
      for (var k = 0; k < 3; k++) { var m = addUnit(w, "merchant", nearFree(w, sp, 1)); m.wait = 0 }
      announce(w, "Uma caravana das Montanhas-Lar chegou!", 1)
      w.stats.caravans++
    }
  }
  if (w.fallen) return
  if (w.caravan) caravanDay(w)
  // goblins
  if (!w.peaceful && !w.scenario && !w.raid && !w.caravan && w.tick > YEAR * 1.4 && chance(w, 0.006 + Math.min(0.03, w.wealth / 60000))) {
    spawnRaid(w, d, 0)
  }
  // kobold thieves
  if (!w.peaceful && !w.raid && w.tick > YEAR / 4 && chance(w, 0.05)) { var ks = edgeSurface(w); if (ks >= 0) addUnit(w, "kobold", ks) }
  // deer replenish, trees regrow
  var deer = 0; for (var u = 0; u < w.units.length; u++) if (w.units[u].k === "deer") deer++
  if (deer < 3 && chance(w, 0.3)) { var dsp = edgeSurface(w); if (dsp >= 0) addUnit(w, "deer", dsp) }
  for (var t = 0; t < 6; t++) {
    var x = ri(w, W), y = ri(w, H), i = surfaceIdx(w, x, y)
    if (w.tile[i] === T_OPEN && w.floor[i] === F_GRASS && w.build[i] === B_NONE && w.desig[i] === DG_NONE && touchesTile(w, i, T_TREE) && chance(w, 0.5)) { w.tile[i] = T_TREE; w.dirty = true }
  }
}
// wave 0: an ordinary ambush sized by wealth. wave >= 1: the scenario's
// escalating waves - more goblins, then elites with better gear.
function spawnRaid(w, d, wave) {
  var gs = edgeSurface(w); if (gs < 0) return false
  var sc = w.scenario || {}, mul = w.waveMul || 1
  var n = wave > 0 ? Math.min(sc.cap || 12, Math.round(((sc.base || 3) + Math.floor(wave * (sc.step || 1.5))) * mul)) : Math.max(1, Math.round((2 + Math.min(5, Math.floor(w.wealth / 900)) + ri(w, 2)) * mul))
  var eliteFrom = sc.eliteFrom || 4
  for (var g = 0; g < n; g++) { var gob = addUnit(w, "goblin", nearFree(w, gs, 2)); if (wave >= eliteFrom && g % 3 === 0) { gob.elite = true; gob.hp = 9; gob.maxhp = 9 } }
  w.raid = { since: w.tick, n: n, wave: wave, lost: 0 }
  w.stats.raids++
  announce(w, (wave > 0 ? "Onda " + wave + ": " : "Uma emboscada! ") + "Goblins! " + n + " invasores na superfície!" + (wave >= eliteFrom ? " Há veteranos entre eles." : ""), 2)
  legend(w, (wave > 0 ? "Onda goblin " + wave : "Emboscada goblin") + " (" + n + ") no ano " + d.year + ".")
  var ds = dwarves(w); for (var q = 0; q < ds.length; q++) grabWeapon(w, ds[q])
  if (w.scenario) { w.scenario.wave = wave + 1; w.scenario.nextRaid = w.tick + w.scenario.raidEvery }
  return true
}
function caravanDay(w) {
  var c = w.caravan
  var merchants = w.units.filter(function (u) { return u.k === "merchant" })
  if (merchants.length === 0) { announce(w, "Os mercadores se foram.", 0); w.caravan = null; return }
  if (c.stage === "arrive" && c.arrived >= merchants.length) { c.stage = "trade"; announce(w, "Os mercadores montaram acampamento junto ao depósito.", 0) }
  if (c.stage === "trade") {
    c.days++
    // they buy crafts, gems and ore; they sell food, drink and logs
    var bought = 0, sold = 0, worth = 0
    for (var k = w.items.length - 1; k >= 0 && bought < 4; k--) {
      var it = w.items[k]
      if (it.by || it.res) continue
      var wgt = it.t === "jewel" ? 4 : it.t === "cutgem" ? 2 : (it.t === "craft" || it.t === "gem" || (it.t === "ore" && countItems(w, "ore") > 3)) ? 1 : 0
      if (wgt) { w.items.splice(k, 1); bought++; worth += wgt }
    }
    var give = ["food", "booze", "log"]
    for (var q = 0; q < worth * 2; q++) { addItem(w, pick(w, give), nearFree(w, c.spot, 2)); sold++ }
    if (bought > 0) announce(w, "Comércio: os mercadores levaram " + bought + " bens e deixaram " + sold + " suprimentos.", 1)
    else if (c.days === 1) announce(w, "Os mercadores não encontraram nada que valesse a pena comprar.", 0)
    if (c.days >= 4) { c.stage = "leave"; announce(w, "Os mercadores partiram.", 0) }
  }
  if (w.raid && c.stage !== "leave") { c.stage = "leave"; announce(w, "Os mercadores fogem da emboscada!", 1) }
}
function raidTick(w) {
  if (!w.raid) return
  // nobody left to repel anything: the raid just ends, unremarked
  if (w.fallen) { w.raid = null; return }
  var n = 0; for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "goblin") n++
  if (n === 0) {
    w.stats.repelled = (w.stats.repelled || 0) + 1
    announce(w, (w.raid.wave ? "Onda " + w.raid.wave + " repelida. " : "A emboscada terminou. ") + w.name + " resiste" + (w.raid.lost ? ", com " + w.raid.lost + " baixa(s)." : " sem baixas."), 1)
    legend(w, (w.raid.wave ? "Onda " + w.raid.wave : "Emboscada") + " repelida" + (w.raid.lost ? " (" + w.raid.lost + " anões perdidos)." : " sem baixas."))
    w.raid = null
    var ds = dwarves(w); for (var q = 0; q < ds.length; q++) thought(w, ds[q], "sobreviveu a uma emboscada", 2)
  }
}

// ---- the tick ---------------------------------------------------------------
function ensureScratch(w) {
  if (!w.claim) w.claim = new Int32Array(NN)
  if (!w.unreach) w.unreach = {}
}
function tick(w) {
  ensureScratch(w)
  w.tick++
  var d = date(w)
  if (w.tick % DAY === 0) dayStart(w, d)
  if (w.tick % (DAY * SEASON_DAYS) === 0) seasonStart(w, d)
  if (w.tick % 300 === 0) { w.unreach = {} }
  // crops
  if (w.tick % 5 === 0) { var fm = cache(w).farms; for (var fi = 0; fi < fm.length; fi++) { var fc = fm[fi]; if (w.grow[fc] > 0 && w.grow[fc] < 200) w.grow[fc] += (w.floor[fc] === F_MOSS ? 6 : 5) } }
  recount(w)
  spreadLiquids(w)
  maybeStrangeMood(w)
  raidTick(w)
  // units (copy: acts may remove units)
  var us = w.units.slice()
  w.hostiles = 0
  for (var h = 0; h < us.length; h++) if (hostile(us[h])) w.hostiles++
  for (var k = 0; k < us.length; k++) {
    var u = us[k]
    if (w.units.indexOf(u) < 0) continue
    if (u.k === "dwarf") actDwarf(w, u)
    else if (hostile(u)) actHostile(w, u)
    else if (u.k === "deer") actDeer(w, u)
    else if (u.k === "kobold") actKobold(w, u)
    else if (u.k === "merchant") actMerchant(w, u)
    // liquids
    var t = w.tile[u.i]
    if (t === T_MAGMA) { if (u.k === "dwarf") die(w, u, "queimou até a morte no magma"); else removeUnit(w, u) }
    else if (t === T_WATER) { u.drown = (u.drown || 0) + 1; if (u.drown > 6) { if (u.k === "dwarf") die(w, u, "afogou-se"); else removeUnit(w, u) } else { var esc = neighbors(w, u.i, u, nb); if (esc > 0) u.i = nb[0] } }
    else u.drown = 0
  }
  checkFall(w)
  if (w.tick % 50 === 0) w.wealth = computeWealth(w)
}
function actDwarf(w, u) {
  u.cool--
  var g = u.trait === "guloso" ? 1.3 : 1
  u.hunger += 0.22 * g; u.thirst += 0.33; u.sleep += (u.job && u.job.k === "sleep") ? 0 : 0.7
  if (u.hunger > 140 && w.tick % 12 === 0) { u.hp -= 1; if (u.hp <= 0) { die(w, u, "morreu de fome"); return } }
  if (u.thirst > 140 && w.tick % 12 === 0) { u.hp -= 1; if (u.hp <= 0) { die(w, u, "morreu de sede"); return } }
  if (u.hp < u.maxhp && w.tick % 40 === 0 && u.hunger < 80) u.hp++
  moodTick(w, u)
  if (w.units.indexOf(u) < 0) return
  if (u.mood_state === "berserk") {
    if (u.hp <= 0) { die(w, u, "foi abatido em fúria pelos companheiros"); return }
    var v = nearestUnit(w, u.i, function (o) { return o !== u && o.k === "dwarf" }, 1e9)
    if (v) { if (adjacent(u.i, v.i) || v.i === u.i) { if (u.cool <= 0) { attack(w, u, v); u.cool = 3 } } else if (!u.path || w.tick % 10 === 0) go(w, u, function (c) { return adjacent(c, v.i) }, v.i, 600); step(w, u) }
    return
  }
  if (u.mood_state === "melancholy") {
    if (u.mood >= 45) { u.mood_state = ""; announce(w, u.name + " saiu da melancolia.", 1) }
    else if (u.job) { work(w, u); return }
    else if ((u.thirst > 95 || u.hunger > 95 || u.sleep > 110) && needJob(w, u)) return
    else { if (chance(w, 0.1)) { var n = neighbors(w, u.i, u, nb); if (n > 0) u.i = nb[ri(w, n)] } return }
  }
  if (u.mood_state === "strange") {
    if (!u.job) { u.job = u.moodJob || { k: "mood", i: -1, stage: "claim", want: u.moodWant, prog: 0, since: u.moodSince || w.tick }; u.moodJob = null }
    if (u.job && u.job.k === "mood" && (u.thirst > 100 || u.hunger > 100)) {
      var mj = u.job; u.job = null; u.path = null
      if (needJob(w, u)) { u.moodJob = mj; return }
      u.job = mj
    }
  }
  if (w.hostiles > 0 && fightOrFlee(w, u)) return
  if (u.job && u.job.k === "fight") dropJob(w, u)
  if (u.job && u.job.k === "arm") {
    if (u.path) { if (step(w, u) < 0) dropJob(w, u); return }
    var wi = itemById(w, u.job.item); if (wi && wi.i === u.i) { removeItem(w, wi.id); u.weapon = true; thought(w, u, "pegou em armas", 1) }
    dropJob(w, u); return
  }
  if (u.job) { work(w, u); return }
  if (u.mood_state === "strange") return
  if (needJob(w, u)) return
  if (u.jobCool > 0) u.jobCool--
  else {
    if (findDesignation(w, u)) return
    if (economyJob(w, u)) return
    u.jobCool = 4 + ri(w, 8)
  }
  idle(w, u)
  if (u.path) step(w, u)
}
function computeWealth(w) {
  var v = 0, i
  for (var k = 0; k < w.items.length; k++) v += ITEM_VALUE[w.items[k].t] || 0
  for (i = 0; i < NN; i++) { var b = w.build[i]; if (b) v += BUILD_INFO[b].value }
  return v
}

// ---- scenario: a ready-made hold -------------------------------------------
// Everything the simulation can do, already set up: a stair down from a walled
// gate; a farm level; a dining level with kitchen and still; a dormitory and
// industry level with smelter, forge, workshop and training yard; a mine level
// with ore veins designated; full stockpiles; dwarves with trades and gear;
// and goblin waves on a schedule, each larger than the last. Built to watch
// the loops run and to see how much the hold can take.
function carve(w, i) {
  var t = w.tile[i]
  if (t === T_WATER || t === T_MAGMA) return false
  if (t !== T_OPEN) w.floor[i] = t === T_SOIL ? F_SOIL : F_STONE
  w.tile[i] = T_OPEN; w.build[i] = B_NONE; w.desig[i] = DG_NONE; w.grow[i] = 0
  return true
}
function carveRect(w, cx, cy, z, x0, y0, x1, y1) {
  for (var y = cy + y0; y <= cy + y1; y++) for (var x = cx + x0; x <= cx + x1; x++) if (inb(x, y, z)) carve(w, idx(x, y, z))
}
function place(w, cx, cy, z, dx, dy, b) {
  var x = cx + dx, y = cy + dy
  if (!inb(x, y, z)) return -1
  var i = idx(x, y, z)
  if (w.tile[i] !== T_OPEN || w.floor[i] === F_NONE) return -1
  if (b === B_FARM && w.floor[i] !== F_SOIL && w.floor[i] !== F_MOSS && w.floor[i] !== F_GRASS) return -1
  w.build[i] = b; return i
}
function stockAt(w, list, type, n) {
  if (list.length === 0) return
  for (var k = 0; k < n; k++) addItem(w, type, list[k % list.length])
}
function scenario(w, n, opts) {
  opts = opts || {}
  n = Math.max(4, Math.min(24, n || 12))
  // start over on the population and goods the plain start placed
  w.units = w.units.filter(function (u) { return u.k !== "dwarf" })
  w.items = []
  var best = pickDepot(w, 5, 9)
  var cx = best % W, cy = (best - cx) / W, cz = w.ground[best]
  var z1 = cz - 1, z2 = cz - 2, z3 = cz - 3, zm = Math.max(2, cz - 4)
  if (z3 < 2) z3 = 2
  w.depot = idx(cx, cy, cz)
  var dx, dy, k
  // gate: clear the 5x5, wall the ring around the stair, one door facing south
  for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) { var gi = surfaceIdx(w, cx + dx, cy + dy); if (w.tile[gi] === T_TREE || w.tile[gi] === T_SHRUB) w.tile[gi] = T_OPEN }
  for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue
    var ri_ = idx(cx + dx, cy + dy, cz)
    if (w.ground[(cy + dy) * W + cx + dx] !== cz || w.tile[ri_] !== T_OPEN) continue
    w.build[ri_] = (dx === 0 && dy === 1) ? B_DOOR : B_WALL
  }
  for (var gd = -1; gd <= 1; gd += 2) { var gt = idx(cx + gd, cy + 2, cz); if (inb(cx + gd, cy + 2, cz) && w.ground[(cy + 2) * W + cx + gd] === cz && w.tile[gt] === T_OPEN && w.build[gt] === B_NONE) w.build[gt] = B_TORCH }
  // the stair column is set after the rooms are carved (carving clears buildings)
  var stairZ = []
  for (var z = cz; z >= zm; z--) stairZ.push(z)
  // level 1: farms west, stockpile east, torches
  carveRect(w, cx, cy, z1, -6, -3, 6, 3)
  for (dy = -3; dy <= 3; dy++) for (dx = -6; dx <= -2; dx++) if (dy !== 0 && dy !== -3 && dy !== 3 && dx !== -4) place(w, cx, cy, z1, dx, dy, B_FARM)
  var stock1 = []
  for (dy = -3; dy <= 3; dy++) for (dx = 2; dx <= 6; dx++) if (dy !== 0) { var s1 = place(w, cx, cy, z1, dx, dy, B_STOCK); if (s1 >= 0) stock1.push(s1) }
  place(w, cx, cy, z1, -4, 0, B_TORCH); place(w, cx, cy, z1, 4, 0, B_TORCH); place(w, cx, cy, z1, -1, 0, B_TORCH); place(w, cx, cy, z1, 1, 0, B_TORCH)
  // level 2: dining hall, kitchen, still, statue
  carveRect(w, cx, cy, z2, -8, -4, 8, 4)
  var tx = [-6, -4, -2, 2, 4, 6]
  for (k = 0; k < tx.length; k++) { place(w, cx, cy, z2, tx[k], -2, B_TABLE); place(w, cx, cy, z2, tx[k], 2, B_TABLE) }
  place(w, cx, cy, z2, -7, -4, B_KITCHEN); place(w, cx, cy, z2, -5, -4, B_STILL); place(w, cx, cy, z2, 7, -4, B_STILL)
  place(w, cx, cy, z2, 0, -4, B_STATUE); place(w, cx, cy, z2, 0, 4, B_STATUE)
  place(w, cx, cy, z2, -7, 0, B_TORCH); place(w, cx, cy, z2, -3, 0, B_TORCH); place(w, cx, cy, z2, 3, 0, B_TORCH); place(w, cx, cy, z2, 7, 0, B_TORCH)
  place(w, cx, cy, z2, -7, 4, B_TORCH); place(w, cx, cy, z2, 7, 4, B_TORCH)
  // level 3: dormitory west, industry east, training yard, stockpile for ore and bars
  carveRect(w, cx, cy, z3, -8, -4, 8, 4)
  var beds = 0, bedRows = [-4, -2, 2, 4]
  for (var r = 0; r < bedRows.length && beds < n + 4; r++) for (dx = -8; dx <= -1 && beds < n + 4; dx++) if (place(w, cx, cy, z3, dx, bedRows[r], B_BED) >= 0) beds++
  place(w, cx, cy, z3, 2, -4, B_SMELTER); place(w, cx, cy, z3, 4, -4, B_FORGE); place(w, cx, cy, z3, 6, -4, B_WORKSHOP); place(w, cx, cy, z3, 8, -4, B_WORKSHOP)
  place(w, cx, cy, z3, 3, 2, B_TRAINING); place(w, cx, cy, z3, 5, 2, B_TRAINING); place(w, cx, cy, z3, 7, 2, B_STATUE); place(w, cx, cy, z3, 8, -2, B_JEWELER)
  var stock3 = []
  for (dx = 2; dx <= 8; dx++) for (dy = 3; dy <= 4; dy++) { var s3 = place(w, cx, cy, z3, dx, dy, B_STOCK); if (s3 >= 0) stock3.push(s3) }
  place(w, cx, cy, z3, -6, 0, B_TORCH); place(w, cx, cy, z3, -2, 0, B_TORCH); place(w, cx, cy, z3, 2, 0, B_TORCH); place(w, cx, cy, z3, 6, 0, B_TORCH)
  place(w, cx, cy, z3, -4, -3, B_TORCH); place(w, cx, cy, z3, -4, 3, B_TORCH)
  // mine level: a cross of galleries, then every vein within reach designated with its own access tunnel
  var mineLevels = zm < z3 ? [zm, z3] : [z3]
  for (var ml = 0; ml < mineLevels.length; ml++) {
    var mz = mineLevels[ml], span = mz === z3 ? 9 : 0
    if (mz !== z3) { carveRect(w, cx, cy, mz, -10, 0, 10, 0); carveRect(w, cx, cy, mz, 0, -8, 0, 8) }
    else { carveRect(w, cx, cy, mz, 9, 0, 16, 0); carveRect(w, cx, cy, mz, -16, 0, -9, 0) }
    for (dy = -10; dy <= 10; dy++) for (dx = -16; dx <= 16; dx++) {
      var vx = cx + dx, vy = cy + dy
      if (!inb(vx, vy, mz)) continue
      if (mz === z3 && Math.abs(dx) <= 8 && Math.abs(dy) <= 4) continue
      var vi = idx(vx, vy, mz), vt = w.tile[vi]
      if (vt !== T_ORE && vt !== T_GEM) continue
      if (Math.abs(dx) > 10 + span) continue
      designate(w, vi, "dig")
      // tunnel: straight up/down from the east-west gallery
      var step_ = dy > 0 ? -1 : 1
      for (var ty = dy + step_; ty !== 0 && Math.abs(ty) <= 10; ty += step_) {
        var ti = idx(vx, cy + ty, mz)
        if (w.tile[ti] === T_OPEN) break
        if (canDesignate(w, ti, "dig")) designate(w, ti, "dig")
      }
    }
  }
  // the stair column goes in last: every carve above clears the buildings in the
  // cells it opens, and the mine galleries run straight through (cx, cy). Cutting
  // the column before them used to erase the bottom step whenever the hold got a
  // separate deep mine level (ground height 6), stranding the whole ore layer.
  for (var sq = 0; sq < stairZ.length; sq++) { var si = idx(cx, cy, stairZ[sq]); carve(w, si); w.build[si] = B_STAIR }
  // stockpiles: the pantry upstairs, materials downstairs, spare gear
  stockAt(w, stock1, "food", 40); stockAt(w, stock1, "meal", 12); stockAt(w, stock1, "booze", 40)
  stockAt(w, stock3, "log", 20); stockAt(w, stock3, "stone", 24); stockAt(w, stock3, "ore", 12); stockAt(w, stock3, "bar", 8)
  stockAt(w, stock3, "pick", 1); stockAt(w, stock3, "axe", 1); stockAt(w, stock3, "weapon", 2); stockAt(w, stock3, "armor", 2); stockAt(w, stock3, "gem", 4)
  // the dwarves: a militia of a third, the rest by trade
  var roles = ["miner", "miner", "woodcutter", "farmer", "brewer", "smith", "builder", "farmer", "miner", "woodcutter", "crafter", "farmer", "smith", "miner", "brewer", "builder"]
  var militia = opts.militia !== undefined ? Math.min(n, opts.militia) : Math.max(2, Math.ceil(n / 3)), ri2 = 0
  var hall = idx(cx, cy, z2)
  for (k = 0; k < n; k++) {
    var spot = -1
    for (var t2 = 0; t2 < 40 && spot < 0; t2++) { var hx = cx + ri(w, 15) - 7, hy = cy + ri(w, 7) - 3; var hi = idx(hx, hy, z2); if (inb(hx, hy, z2) && passable(w, hi)) spot = hi }
    var u = addDwarf(w, spot < 0 ? hall : spot)
    for (var sk = 0; sk < SKILLS.length; sk++) u.skills[SKILLS[sk]] = ri(w, 2)
    if (k < militia) { u.skills.fight = 5 + ri(w, 3); u.weapon = true; u.armor = true; u.militia = true; u.trait = chance(w, 0.5) ? "valente" : u.trait }
    else {
      var role = roles[ri2++ % roles.length]
      if (role === "miner") { u.skills.mine = 5 + ri(w, 3); u.tool = "pick" }
      else if (role === "woodcutter") { u.skills.wood = 5 + ri(w, 3); u.tool = "axe" }
      else if (role === "farmer") u.skills.farm = 5 + ri(w, 3)
      else if (role === "brewer") u.skills.brew = 5 + ri(w, 3)
      else if (role === "smith") u.skills.craft = 5 + ri(w, 3)
      else if (role === "builder") u.skills.build = 5 + ri(w, 3)
      else u.skills.craft = 4 + ri(w, 3)
    }
  }
  // Wave sizing for the showcase hold. The old curve (step 1.5, cap 12) wiped the
  // fortress in five seeds out of eight inside two years, which is a fine Dwarf
  // Fortress ending but a poor first impression for a preset named "ready".
  // Garrison and Siege pass their own, harsher numbers.
  w.scenario = { n: n, wave: 1, raidEvery: opts.raidEvery || DAY * 15, nextRaid: w.tick + (opts.firstRaid || DAY * 6),
    base: opts.waveBase || 3, step: opts.waveStep || 1, eliteFrom: opts.eliteFrom || 5, cap: opts.cap || 9 }
  if (opts.peaceful) { w.peaceful = true; w.scenario = null }
  w.preset = opts.name || "Fortaleza pronta"
  w.popCap = Math.max(w.popCap, n + 6)
  w.liquidBudget = { water: 60, magma: 30 }
  w.dirty = true; w.wealth = computeWealth(w)
  w.log = []; w.legends = []
  announce(w, (w.preset || "Cenário") + ": " + w.name + " já está escavada e guarnecida por " + n + " anões (" + militia + " na milícia)." + (w.scenario ? " A primeira onda goblin vem em " + Math.round(w.scenario.nextRaid / DAY) + " dias." : " Não há inimigos neste vale."), 1)
  legend(w, (w.preset || "Cenário") + ": fundada com " + n + " anões.")
  return w
}
function newScenario(seed, n, opts) { var w = newWorld(seed); return scenario(w, n, opts) }
// Starting presets for the menu. `kind` classic = the plain embark.
var PRESETS = [
  { id: "classic", name: "Embarque clássico", desc: "Sete anões, uma carroça de suprimentos e uma colina. Do zero, como manda a tradição.", kind: "classic", n: 7 },
  { id: "ready", name: "Fortaleza pronta", desc: "Doze anões com ofícios e uma fortaleza já escavada em quatro níveis. Ondas goblin a cada quinze dias.", kind: "scenario", n: 12, opts: { name: "Fortaleza pronta" } },
  { id: "garrison", name: "Guarnição", desc: "Dez anões, seis na milícia. Ondas mais cedo e mais frequentes: um teste de defesa.", kind: "scenario", n: 10, opts: { name: "Guarnição", militia: 6, firstRaid: DAY * 3, raidEvery: DAY * 9, waveBase: 4, waveStep: 2, eliteFrom: 3, cap: 14 } },
  { id: "peaceful", name: "Vale tranquilo", desc: "Fortaleza pronta, sem goblins nem lobos. Para ver a economia e os humores sem sangue.", kind: "scenario", n: 12, opts: { name: "Vale tranquilo", peaceful: true } },
  { id: "siege", name: "Cerco", desc: "Oito anões, ondas grandes desde o segundo dia com veteranos. Ninguém espera que dure.", kind: "scenario", n: 8, opts: { name: "Cerco", militia: 4, firstRaid: DAY * 2, raidEvery: DAY * 7, waveBase: 5, waveStep: 2.5, eliteFrom: 2, cap: 16 } }
]
function newFromPreset(seed, presetId, n) {
  var pr = null
  for (var k = 0; k < PRESETS.length; k++) if (PRESETS[k].id === presetId) pr = PRESETS[k]
  if (!pr) pr = PRESETS[0]
  var count = n || pr.n
  if (pr.kind === "classic") { var w = newWorld(seed); w.preset = pr.name; if (count !== 7) { var ds = dwarves(w); while (ds.length > count) { removeUnit(w, ds.pop()) } while (ds.length < count) { ds.push(addDwarf(w, nearFree(w, w.depot, 2))) } } return w }
  return newScenario(seed, count, pr.opts)
}

// Cells a walker starting at `start` can reach (1) — for the access view.
// `u` may be null (a dwarf) or a unit whose rules apply (a goblin under lockdown).
function reachableFrom(w, start, u) {
  var seen = new Uint8Array(NN), stack = [], out = [0, 0, 0, 0, 0, 0]
  var starts = typeof start === "number" ? [start] : start
  for (var sq = 0; sq < starts.length; sq++) {
    var st = starts[sq]
    if (st < 0 || st >= NN) continue
    if (!seen[st]) { seen[st] = 1; stack.push(st) }
    // a start standing on something unwalkable (the wagon spot, a dwarf in a
    // doorway) still opens onto its neighbours
    if (!passableFor(w, st, u)) { var n0 = neighbors(w, st, u, out); for (var q = 0; q < n0; q++) if (!seen[out[q]]) { seen[out[q]] = 1; stack.push(out[q]) } }
  }
  while (stack.length) {
    var cur = stack.pop(), n = neighbors(w, cur, u, out)
    for (var k = 0; k < n; k++) { var nx = out[k]; if (!seen[nx]) { seen[nx] = 1; stack.push(nx) } }
  }
  return seen
}
function setHour(w, h) { var day = Math.floor(w.tick / DAY); w.tick = day * DAY + Math.max(0, Math.min(DAY - 1, Math.round(h / 24 * DAY))) }

// ---- lookups for the UI -----------------------------------------------------
// How far below level z the cell i is seen through open sky: 0 when on the
// level, 1..3 through open air, -1 when something is in the way.
function depthBelow(w, i, z) {
  var k = z - iz(i)
  if (k < 0 || k > 3) return -1
  for (var c = i + N, q = 1; q <= k; q++, c += N) if (w.tile[c] !== T_OPEN || w.floor[c] !== F_NONE) return -1
  return k
}
// For the map: a designation is shown as stranded when nothing walkable
// touches it, directly or through neighbouring designations. Cells the
// dwarves merely have not got to yet are not stranded.
function isStranded(w, i) { return !!w.desig[i] && !desigOk(w)[i] }
function isUnreachable(w, i) { return isStranded(w, i) }
function countUnreachable(w) { var n = 0, ds = cache(w).desigs, ok = desigOk(w); for (var k = 0; k < ds.length; k++) if (ds[k] && !ok[ds[k]]) n++; return n }
function tileName(w, i) {
  var t = w.tile[i], f = w.floor[i], b = w.build[i]
  var names = { 1: "solo", 2: "rocha", 3: "veio de minério", 4: "gemas na rocha", 5: "árvore", 6: "água", 7: "magma", 8: "cogumelo gigante", 9: "arbusto" }
  if (t !== T_OPEN) return names[t]
  var fl = { 0: "céu aberto", 1: "chão de terra", 2: "chão de pedra", 3: "grama", 4: "musgo de caverna" }[f]
  if (b) return BUILD_INFO[b].name + (b === B_FARM ? (w.grow[i] >= 200 ? " (madura)" : w.grow[i] > 0 ? " (crescendo)" : " (vazia)") : "") + " · " + fl
  return fl
}
function jobName(u) {
  if (!u.job) return u.mood_state === "melancholy" ? "melancólico" : u.mood_state === "berserk" ? "enlouquecido" : "ocioso"
  var j = u.job
  var n = { dig: j.stair ? "cavando escada" : "cavando", chop: "cortando", build: "construindo", plant: "plantando", harvest: "colhendo",
    brew: "fermentando", craft: "criando", haul: "carregando", eat: "comendo", forage: "coletando", drink: "bebendo", drinkwater: "bebendo água",
    sleep: "dormindo", fight: "lutando", arm: "pegando arma", mood: "humor estranho", flee: "fugindo",
    equip: "equipando", train: "treinando", cook: "cozinhando", smelt: "fundindo", forge: "forjando", cut: "lapidando", setgem: "fazendo joia" }[j.k] || j.k
  if (j.k === "forge" && j.product) n += " " + ITEM_NAME[j.product]
  if (j.k === "build") n += " " + BUILD_INFO[j.bt].name
  return n
}
function moodWord(u) {
  if (u.mood_state === "melancholy") return "melancólico"
  if (u.mood_state === "berserk") return "furioso"
  if (u.mood_state === "strange") return "possuído"
  return u.mood >= 75 ? "extasiado" : u.mood >= 55 ? "contente" : u.mood >= 35 ? "ok" : u.mood >= 18 ? "infeliz" : "miserável"
}
function summary(w) {
  var ds = dwarves(w), mood = 0, militia = 0
  for (var k = 0; k < ds.length; k++) { mood += ds[k].mood; if (ds[k].militia) militia++ }
  var gob = 0, gobIn = 0
  for (var g = 0; g < w.units.length; g++) if (w.units[g].k === "goblin") { gob++; if (iz(w.units[g].i) < w.ground[w.units[g].i % N]) gobIn++ }
  return { pop: ds.length, mood: ds.length ? Math.round(mood / ds.length) : 0, food: countItems(w, "food") + countItems(w, "meal"), booze: countItems(w, "booze"),
    wealth: w.wealth, raid: !!w.raid, caravan: !!w.caravan, date: date(w), militia: militia, scenario: !!w.scenario, goblins: gob, goblinsInside: gobIn, lockdown: !!w.lockdown, deaths: w.stats.deaths,
    wave: w.scenario ? w.scenario.wave : 0, nextRaidIn: w.scenario ? Math.max(0, w.scenario.nextRaid - w.tick) : -1, fallen: !!w.fallen }
}

// ---- save / load ------------------------------------------------------------
function slotMeta(w) {
  var d = date(w)
  return { name: w.name, preset: w.preset || "", pop: pop(w), date: d.seasonName + ", dia " + d.day + " do ano " + d.year, tick: w.tick, wealth: w.wealth, at: Date.now() }
}
function serialize(w) {
  var o = {}
  for (var k in w) {
    if (k === "claim" || k === "unreach" || k === "cache" || k === "counts" || k === "dirty" || k === "hostiles") continue
    var v = w[k]
    if (k === "scenario" && !v) continue
    if (v && v.buffer && v.BYTES_PER_ELEMENT) o[k] = rle(v)
    else o[k] = v
  }
  return JSON.stringify(o)
}
function deserialize(json) {
  var o = JSON.parse(json)
  if (!o || o.v !== 1) return null
  var w = newWorldEmpty()
  for (var k in o) {
    if (k === "tile" || k === "floor" || k === "build" || k === "desig" || k === "dbuild" || k === "grow" || k === "ground") w[k] = unrle(o[k], k === "ground" ? N : NN)
    else w[k] = o[k]
  }
  w.claim = new Int32Array(NN); w.unreach = {}; w.dirty = true
  if (!w.fallen) w.fallen = false
  // an older save may be missing counters the Legends page prints unguarded
  var st = w.stats || (w.stats = {})
  for (var sk = 0; sk < STAT_KEYS.length; sk++) if (typeof st[STAT_KEYS[sk]] !== "number") st[STAT_KEYS[sk]] = 0
  // units carrying items keep their claims; jobs are dropped so no stale paths survive
  for (var u = 0; u < w.units.length; u++) { var un = w.units[u]; un.path = null; un.pi = 0; un.job = null; if (un.carry) { var it = itemById(w, un.carry); if (it) { it.by = 0; it.res = 0; it.i = un.i } un.carry = 0 } }
  for (var i = 0; i < w.items.length; i++) { w.items[i].res = 0; w.items[i].by = 0 }
  return w
}
function newWorldEmpty() {
  return { v: 1, seed: 0, rs: 0, tick: 0, tile: new Uint8Array(NN), floor: new Uint8Array(NN), build: new Uint8Array(NN), desig: new Uint8Array(NN),
    dbuild: new Uint8Array(NN), grow: new Uint8Array(NN), ground: new Uint8Array(N), items: [], units: [], nextId: 1, log: [], legends: [], artifacts: [],
    dead: [], name: "", wealth: 0, alerts: 0, popCap: 20, liquidBudget: { water: 60, magma: 30 }, caravan: null, raid: null, lockdown: false, depot: -1,
    weather: 0, stats: newStats(), fallen: false, claim: null, unreach: {}, lastMoodTick: 0 }
}
function rle(a) {
  var out = [], i = 0
  while (i < a.length) { var v = a[i], n = 1; while (i + n < a.length && a[i + n] === v && n < 60000) n++; out.push(v, n); i += n }
  return out
}
function unrle(r, len) {
  var a = new Uint8Array(len), p = 0
  for (var k = 0; k < r.length; k += 2) { var v = r[k], n = r[k + 1]; for (var q = 0; q < n && p < len; q++) a[p++] = v }
  return a
}
