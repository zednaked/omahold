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
    B_KITCHEN = 11, B_SMELTER = 12, B_FORGE = 13, B_TORCH = 14, B_TRAINING = 15, B_JEWELER = 16,
    B_GRAVE = 17, B_HEARTH = 18, B_CRYSTAL = 19, B_GAMES = 20, B_TRAP = 21, B_POST = 22,
    B_WELL = 23, B_FLOODGATE = 24, B_HOSPITAL = 25, B_PEN = 26
var TORCH_RADIUS = 4.5   // cells; light fades linearly to nothing at this distance
var BEACON_RADIUS = 7    // a hearth or a crystal column lights a whole hall

// ---- designations -----------------------------------------------------------
var DG_NONE = 0, DG_DIG = 1, DG_STAIR = 2, DG_CHOP = 3, DG_BUILD = 4

// The key each building is looked up by, so a label change is a translation
// and not a rename.
var BUILD_KEY = {}
BUILD_KEY[1] = "stair"; BUILD_KEY[2] = "bed"; BUILD_KEY[3] = "table"; BUILD_KEY[4] = "farm"
BUILD_KEY[5] = "still"; BUILD_KEY[6] = "workshop"; BUILD_KEY[7] = "wall"; BUILD_KEY[8] = "door"
BUILD_KEY[9] = "stock"; BUILD_KEY[10] = "statue"; BUILD_KEY[11] = "kitchen"; BUILD_KEY[12] = "smelter"
BUILD_KEY[13] = "forge"; BUILD_KEY[14] = "torch"; BUILD_KEY[15] = "training"; BUILD_KEY[16] = "jeweler"
BUILD_KEY[17] = "grave"; BUILD_KEY[18] = "hearth"; BUILD_KEY[19] = "crystal"
BUILD_KEY[20] = "games"; BUILD_KEY[21] = "trap"; BUILD_KEY[22] = "post"
BUILD_KEY[23] = "well"; BUILD_KEY[24] = "floodgate"; BUILD_KEY[25] = "hospital"; BUILD_KEY[26] = "pen"

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
// Not built to order: a grave appears where someone was buried.
BUILD_INFO[B_GRAVE]    = { name: "túmulo",     mat: "",      value: 8,  work: 0 }
// Four things a hold builds for its own sake rather than to produce anything.
// A torch lights four cells and that is all it does; these carry an effect,
// which is what makes a hall worth arranging instead of merely lit.
BUILD_INFO[B_HEARTH]   = { name: "lareira",    mat: "log",    value: 25, work: 24 }
BUILD_INFO[B_CRYSTAL]  = { name: "coluna de cristal", mat: "cutgem", value: 90, work: 30 }
BUILD_INFO[B_GAMES]    = { name: "mesa de jogo", mat: "log",  value: 18, work: 20 }
BUILD_INFO[B_TRAP]     = { name: "armadilha",  mat: "bar",    value: 20, work: 20 }
var TRAP_CHARGES = 3     // spikes bend; three foes and the thing is scrap
// Where the militia stands. Building one is how the player says "hold here",
// and it is the only order the militia takes.
BUILD_INFO[B_POST]     = { name: "posto de guarda", mat: "stone", value: 12, work: 20 }
var POST_REACH = 12     // how far from their post a guard will chase something
// A wound was a number that went back up on its own, so being hurt cost nothing
// but time and nobody ever did anything about it. Now a bad one festers: below
// a third of their hit points a dwarf is *wounded*, works at half speed, and
// heals nothing on their own — somebody has to put them in a hospital bed and
// tend them. The fortress that never builds one keeps burying people who were
// only badly hurt.
BUILD_INFO[B_HOSPITAL] = { name: "leito de enfermaria", mat: "log", value: 14, work: 20 }
var WOUND_AT = 0.34     // fraction of max hp below which a dwarf is wounded
var TEND_WORK = 26      // how long tending one takes
// A pen holds animals, and animals are the cheapest way for a fortress to have
// something in it that is nobody's job. A goat eats grass and gives milk that
// the kitchen turns into meals; a cat walks around and gets adopted, which
// matters because the hold already knows how to grieve.
BUILD_INFO[B_PEN]      = { name: "cercado",     mat: "log",   value: 12, work: 18 }
var PEN_MAX = 4         // animals one pen supports
// Water was scenery with one use: a thirsty dwarf walked to the edge of it and
// drank, which is how three of them once died of thirst on the wrong side of a
// regrown tree. A well is drawn from where the hold lives instead, and it is
// the thing that keeps everyone alive the season the still runs dry.
BUILD_INFO[B_WELL]     = { name: "poço",       mat: "stone", value: 25, work: 26 }
// The other half of water: a gate that liquid cannot pass while it is shut.
// Dig a channel, keep it closed, and open it when the corridor is full of
// goblins — which is the oldest trick in this genre and was impossible here.
BUILD_INFO[B_FLOODGATE]= { name: "comporta",   mat: "stone", value: 18, work: 22 }

var ITEM_VALUE = { log: 2, stone: 1, ore: 8, gem: 30, food: 2, booze: 3, craft: 12, weapon: 25, artifact: 400, remains: 0,
                   bar: 15, pick: 30, axe: 28, armor: 40, meal: 5, cutgem: 70, jewel: 130 }
var ITEM_NAME = { log: "tora", stone: "pedra", ore: "minério", gem: "gema", food: "comida", booze: "bebida",
                  craft: "artesanato", weapon: "arma", artifact: "artefato", remains: "restos",
                  bar: "barra de metal", pick: "picareta", axe: "machado", armor: "armadura", meal: "refeição", cutgem: "gema lapidada", jewel: "joia" }

// ---- economy drains ---------------------------------------------------------
// A hold with no way to lose what it makes accumulates until the numbers stop
// meaning anything: without these three the larder reached 2700 meals and half
// the dwarves stood idle. Raw food rots, prepared meals keep (which is what
// makes the kitchen worth building), and tools break from use, so the mine and
// the forge have a reason to keep running after the first year.
var FOOD_PER_DWARF = 10   // how much raw food a hold farms toward, per dwarf
var SPOIL_PER_DAY = 0.012 // chance a raw food item rots each day
var WEAR = { pick: 50, axe: 35, weapon: 60, armor: 20 }

// How long goblins who cannot reach anybody will sit outside before going
// home. It used to be one day, which made locking the doors (`L`) a free win:
// the wave counted as repelled having cost nothing at all. Eight days of siege
// costs the surface — the fields, the shrubs, the woodcutting — and the hold
// has to live on what is already inside.
var SIEGE_DAYS = 8

// ---- kinds of work ----------------------------------------------------------
// Every job belongs to one of these. A dwarf leans toward one and cannot stand
// another, which decides what they reach for, how they feel doing it, and how
// often they ruin it. No labor screen: they sort themselves out.
var WORK_CATS = ["mine", "wood", "farm", "build", "craft", "brew", "fight", "haul"]
var WORK_NAME = { mine: "a mineração", wood: "a lenha", farm: "a lavoura", build: "a construção",
                  craft: "a oficina", brew: "a cervejaria", fight: "o treino", haul: "o transporte" }

// ---- language ---------------------------------------------------------------
// The simulation runs under QML and under node (test/run.js), so it cannot
// import I18n.js the way a .qml file does: World.qml injects it instead, and
// the tests do the same. With nothing injected every label falls back to the
// Portuguese it was written in, which keeps `node test/run.js` readable with
// no wiring at all.
//
// The ids stay Portuguese - `w.date().seasonName` is "outono", a trait is
// "teimoso" - because they are what the save and the game logic compare. Only
// the display goes through here.
var I18N = null, I18N_LANG = "pt"
function setI18n(mod, lang) { I18N = mod || null; if (lang) I18N_LANG = lang }
function setLang(lang) { I18N_LANG = lang || "pt" }
function curLang() { return I18N_LANG }
function L(key, fallback) {
  if (!I18N) return fallback !== undefined ? fallback : key
  return I18N.t(I18N_LANG, key)
}
// Five slots, not four. The scoreboard passes five and `{4}` was reaching the
// chronicle unsubstituted: "1 artefato(s), {4} onda(s) repelida(s)".
function LF(key, fallback) {
  var n = arguments.length
  if (!I18N) {
    var s = fallback !== undefined ? fallback : key
    for (var k = 2; k < n; k++) if (arguments[k] !== undefined) s = s.split("{" + (k - 2) + "}").join(String(arguments[k]))
    return s
  }
  // hand the whole list through: I18N.tf takes however many it is given
  var a = [I18N_LANG, key]
  for (var q = 2; q < n; q++) a.push(arguments[q])
  return I18N.tf.apply(null, a)
}
function LP(n, oneKey, manyKey, oneFall, manyFall) {
  if (!I18N) return n + " " + (n === 1 ? oneFall : manyFall)
  return I18N.plural(I18N_LANG, n, oneKey, manyKey)
}
function seasonName(id) { return L("season." + id, id) }
function seasonIn(id) { return L("season.in." + id, (id === "primavera" ? "na " : "no ") + id) }
function itemName(t) { return L("item." + t, ITEM_NAME[t] || t) }
function workName(c) { return L("work." + c, WORK_NAME[c] || c) }
function skillName(sk) { return L("skill." + sk, SKILL_NAME[sk] || sk) }
function traitName(tr) { return L("trait." + tr, tr) }
function buildName(b) { return L("build." + BUILD_KEY[b], (BUILD_INFO[b] || {}).name || "") }

var SKILLS = ["mine", "wood", "farm", "build", "craft", "fight", "brew"]
var SKILL_NAME = { mine: "mineração", wood: "lenha", farm: "lavoura", build: "construção", craft: "artesanato", fight: "luta", brew: "cervejaria" }

// every counter the UI prints; a save from an older build gets the missing ones
// zeroed on load instead of showing "undefined" in the chronicle
var STAT_KEYS = ["dug", "chopped", "built", "brewed", "crafted", "migrants", "deaths", "artifacts", "raids", "caravans",
                 "cooked", "smelted", "forged", "cut", "jewels", "repelled", "goblinsKilled", "spoiled", "broken", "botched", "buried",
                 "demandsMet", "demandsFailed", "stirred"]
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
var BEAST_NAMES = ["Fuligem", "Barril", "Pedrinha", "Sino", "Nabo", "Trovão", "Pingo", "Bota", "Cinza", "Migalha", "Tocha", "Nuvem"]
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

// A name is given once and then lives in the save: a hold founded in
// Portuguese keeps its Portuguese name, which is right — a dwarf's name is not
// a label. Only new worlds come out in the language that is active.
function tbl(key, fallback) { return I18N && I18N.table ? I18N.table(I18N_LANG, key) : fallback }
function dwarfName(w) { return pick(w, SYL_A) + pick(w, SYL_B) + " " + pick(w, tbl("SUR_A", SUR_A)) + pick(w, tbl("SUR_B", SUR_B)) }
function fortName(w) { return pick(w, tbl("FORT_A", FORT_A)) + " " + pick(w, tbl("FORT_B", FORT_B)) }
function artifactName(w, mat, about) {
  var mats = tbl("ART_MAT", ART_MAT), dflt = tbl("ART_MAT_DEFAULT", "de pedra")
  // When the thing is about somebody, half the time it is named after them —
  // "the Blade of Stoneborn" rather than "the Blade of the Seven".
  var second = (about && about.who && about.k !== "founding" && chance(w, 0.5))
    ? LF("art.of", "de {0}", lastName(about.who))
    : pick(w, tbl("ART_B", ART_B))
  return pick(w, SYL_A).toLowerCase() + pick(w, SYL_B) + pick(w, SYL_A).toLowerCase() + pick(w, SYL_B) + "|"
    + pick(w, tbl("ART_A", ART_A)) + " " + second + "|"
    + pick(w, tbl("ART_KIND", ART_KIND)) + " " + (mats[mat] || dflt) + ". " + artScene(w, about)
}
// The house name: "Rochaviva" out of "Erok Rochaviva". A single-word name (the
// fortress, a relic) is its own last word.
function lastName(n) { var p = String(n || "").split(" "); return p[p.length - 1] }

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
    seen: new Uint8Array(NN), ground: new Uint8Array(N),
    items: [], units: [], nextId: 1,
    log: [], legends: [], artifacts: [], dead: [],
    name: "", wealth: 0, alerts: 0, popCap: 20, graveyard: -1, done: {}, legendary: 0, siege: 0, pressure: 0, woke: {}, stirred: 0, tomb: 0, baron: 0, demand: null, demandSince: 0, siegeSince: 0,
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
  seedSeen(w)
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
  announce(w, LF("msg.founded", "Golpeie a terra! {0} foi fundada com sete anões.", w.name), 1)
  legend(w, LF("lg.founded", "Fundação de {0}.", w.name))
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
// A free cell near `c`, and — this is the part that was missing — one that
// leads somewhere. A passable cell with no passable neighbour is a one-cell
// prison, and on a wooded edge there are plenty: two migrants in sixteen
// fortresses arrived in one and died of thirst in sight of a full cellar, with
// the hold's own "cut off" warning firing correctly and helplessly.
//
// Falls back to a walled cell only if nothing better exists in the radius,
// because arriving somewhere is still better than not arriving.
function nearFree(w, c, r) {
  var fallback = -1
  for (var t = 0; t < 30; t++) {
    var x = ix(c) + ri(w, 2 * r + 1) - r, y = iy(c) + ri(w, 2 * r + 1) - r
    if (!inb(x, y, 0)) continue
    var i = surfaceIdx(w, x, y)
    if (!passable(w, i)) continue
    if (fallback < 0) fallback = i
    // and it has to lead to the hold. `edgeSurface` checks the arrival point,
    // but this spreads the group up to two cells off it, and on a wooded edge
    // a couple of those are pockets with no way out: two migrants in sixteen
    // fortresses landed in one and died of thirst with the cellar full and the
    // hold's "cut off" warning firing correctly and helplessly.
    if (w.depot < 0) return i
    if (findPath(w, i, function (q) { return dist(q, w.depot) <= 2 }, w.depot, null, 4000)) return i
  }
  return fallback >= 0 ? fallback : c
}

// ---- entities ---------------------------------------------------------------
// ---- metal grades -----------------------------------------------------------
// The deeper the ore, the better the metal: copper near the surface, iron
// below it, steel in the last level before the magma. This is what makes
// digging down worth the risk — and it is the same shaft that earns the
// "reach the magma" milestone. Gear of a better grade hits harder and absorbs
// more, so a hold that only scratched the top levels meets the ninth wave in
// copper.
var GRADES = ["", "copper", "iron", "steel"]
function oreGrade(z) { return z <= 1 ? 3 : z === 2 ? 2 : 1 }
function gradeName(q) { return L("grade." + (GRADES[q] || "copper"), GRADES[q] || "copper") }
// The label a player reads: "an iron axe", "uma barra de aço".
function itemLabel(it) {
  if (!it) return ""
  // A relic has a name, and a name outranks a grade: nobody calls it "a lost
  // weapon". Its grade is 5, one above steel, and `GRADES` deliberately stops
  // at steel — there is no metal you can smelt that gets here.
  if (it.nm) return it.title ? it.nm + ", " + it.title : it.nm
  if (!it.q || it.q < 1) return itemName(it.t)
  if (it.t !== "bar" && it.t !== "pick" && it.t !== "axe" && it.t !== "weapon" && it.t !== "armor") return itemName(it.t)
  // a graded bar is a "copper bar", not a "copper metal bar"
  var base = it.t === "bar" ? L("item.bar.plain", "barra") : itemName(it.t)
  return LF("item.of", "{0} de {1}", base, gradeName(it.q))
}
function addItem(w, type, i, grade) {
  var it = { id: w.nextId++, t: type, i: i, res: 0, by: 0 }
  if (grade) it.q = grade
  w.items.push(it); return it
}
function addUnit(w, kind, i) {
  var hp = { dwarf: 12, goblin: 5, deer: 5, wolf: 5, kobold: 4, merchant: 10, crawler: 7, sentinel: 16, envoy: 14,
             king: 30, kingsguard: 20, goat: 6, cat: 4 }[kind] || 6
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
  // what they lean toward and what they cannot stand
  u.likes = pick(w, WORK_CATS)
  u.dislikes = pick(w, WORK_CATS)
  while (u.dislikes === u.likes) u.dislikes = pick(w, WORK_CATS)
  u.frust = 0; u.avoid = ""; u.avoidUntil = 0
  u.bed = -1; u.carry = 0; u.weapon = false; u.armor = false; u.tool = ""; u.militia = false
  u.mood_state = "" // "", "strange", "melancholy", "berserk"
  u.kills = 0; u.made = 0
  u.bonds = {}; u.kin = []; u.grief = 0; u.post = -1
  maybeKin(w, u)
  return u
}
function unitById(w, id) { for (var k = 0; k < w.units.length; k++) if (w.units[k].id === id) return w.units[k]; return null }
function itemById(w, id) { for (var k = 0; k < w.items.length; k++) if (w.items[k].id === id) return w.items[k]; return null }
function dwarves(w) { var r = []; for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "dwarf") r.push(w.units[k]); return r }
function pop(w) { var n = 0; for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "dwarf") n++; return n }

// The chronicle is the part people actually read, so it agrees in number and
// gender: "1 anão perdido" and "no outono", not "1 anões perdidos" and
// "na outono".
function plural(n, one, many) { return n + " " + (n === 1 ? one : many) }
function inSeason(name) { return (name === "primavera" ? "na " : "no ") + name }

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
      // On a built staircase "s" means "go one level deeper", so what matters
      // is the cell below. A dig already pending there must not refuse the
      // order: drawing a room on the level below before cutting the descent is
      // the natural way to play, and refusing silently left the whole level
      // unreachable with no way to fix it. The stair takes that cell over.
      //
      // The cell below does not have to be rock. Descending needs a stair at
      // both ends (see `neighbors`), so a staircase standing over an open
      // cavern floor went nowhere and "s" refused it for having nothing to
      // dig — which left no way at all to reach a cavern directly below a
      // shaft. Now it orders the step built on that floor, and the dwarf who
      // builds it works from the staircase above (see `workSpots`).
      if (t === T_OPEN && w.build[i] === B_STAIR) {
        if (iz(i) <= 0) return false
        var un = i - N, ut = w.tile[un]
        if (w.desig[un] === DG_STAIR || w.build[un] === B_STAIR) return false
        if (solid(ut)) return ut !== T_TREE && ut !== T_FUNGUS
        return ut === T_OPEN && w.floor[un] !== F_NONE && w.build[un] === B_NONE
      }
      return (solid(t) && t !== T_TREE && t !== T_FUNGUS && t !== T_SHRUB) || (t === T_OPEN && w.floor[i] !== F_NONE && w.build[i] === B_NONE)
    case "chop": return t === T_TREE || t === T_FUNGUS || t === T_SHRUB
    case "build":
      if (t !== T_OPEN || w.floor[i] === F_NONE || w.build[i] !== B_NONE) return false
      if (bt === B_FARM) return w.floor[i] === F_SOIL || w.floor[i] === F_MOSS || w.floor[i] === F_GRASS
      // A well has to reach water: it is built on the edge of it, which is
      // also what stops it being a free drink anywhere in the fortress.
      if (bt === B_WELL) return touchesWater(w, i)
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
    var under = i - N, ut2 = w.tile[under]
    var cuttable = solid(ut2) && ut2 !== T_TREE && ut2 !== T_FUNGUS && ut2 !== T_SHRUB
    var buildable = ut2 === T_OPEN && w.floor[under] !== F_NONE && w.build[under] === B_NONE
    if ((cuttable || buildable) && w.desig[under] !== DG_STAIR && w.build[under] !== B_STAIR) {
      w.desig[under] = DG_STAIR; w.dbuild[under] = 0; delete w.unreach[under]; w.dirty = true
    }
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
            kitchens: [], smelters: [], forges: [], torches: [], trainings: [], jewelers: [], graves: [],
            hearths: [], crystals: [], games: [], traps: [], beacons: [], posts: [], wells: [], hospital: [], pens: [] }
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
      else if (b === B_HEARTH) { c.hearths.push(i); c.beacons.push(i) }
      else if (b === B_CRYSTAL) { c.crystals.push(i); c.beacons.push(i) }
      else if (b === B_GAMES) c.games.push(i); else if (b === B_TRAP) c.traps.push(i)
      else if (b === B_POST) c.posts.push(i)
      else if (b === B_WELL) c.wells.push(i)
      else if (b === B_HOSPITAL) c.hospital.push(i)
      else if (b === B_PEN) c.pens.push(i)
      else if (b === B_JEWELER) c.jewelers.push(i)
      else if (b === B_GRAVE) c.graves.push(i)
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
  c.light = lightField(w, c.torches, fires.concat(c.beacons), null)
  c.fire = lightField(w, fires, [], null, 3, 0.9)
  // Beacons are one field rather than two, because the only difference between
  // a hearth and a crystal column is whether the light wavers — and that is a
  // question the flicker function can answer per source.
  c.beacon = lightField(w, c.beacons, [], null, BEACON_RADIUS, 1)
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
var rlTorch = null, rlFire = null, rlBeacon = null
var rlMemo = { w: null, tick: -1, gen: null, torch: null, fire: null, beacon: null }
function renderLight(w, tick) {
  var c = cache(w)
  if (rlMemo.w === w && rlMemo.tick === tick && rlMemo.gen === c) return rlMemo
  if (!rlTorch) { rlTorch = new Float32Array(NN); rlFire = new Float32Array(NN); rlBeacon = new Float32Array(NN) }
  rlMemo.torch = lightField(w, c.torches, [], function (ti) { return flickerAt(w, ti, tick) }, 0, 0, rlTorch)
  rlMemo.fire = lightField(w, c.fires, [], function (ti) { return 0.8 + 0.2 * ((hash(ti * 17 + tick) & 255) / 255) }, 3, 0.9, rlFire)
  // a hearth wavers like the fire it is; cut crystal does not
  rlMemo.beacon = lightField(w, c.beacons, [], function (ti) { return w.build[ti] === B_HEARTH ? flickerAt(w, ti, tick) : 1 }, BEACON_RADIUS, 1, rlBeacon)
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
  var c = cache(w), t = Math.max(c.light[i], c.fire[i], c.beacon[i])
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
// Counts and the haul list, both built once per tick. The haul fallback used
// to scan every item for every idle dwarf; once the farm cap stopped soaking
// up the workforce, enough dwarves reached that fallback to make the tick four
// times more expensive. One pass here, a short list there.
function recount(w) {
  var c = {}, haul = []
  for (var k = 0; k < w.items.length; k++) {
    var it = w.items[k], t = it.t
    c[t] = (c[t] || 0) + 1
    if (!it.res && !it.by && t !== "remains" && !onStockpile(w, it)) haul.push(it)
  }
  w.counts = c; w.haulable = haul
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
// The highest-grade free item of a type, ties broken by distance.
function bestItem(w, type, u) {
  var best = null, bq = -1, bd = 1e9
  for (var k = 0; k < w.items.length; k++) {
    var it = w.items[k]
    if (it.t !== type || it.res || it.by || it.gone) continue
    if (w.unreach["i" + it.id]) continue
    var q = it.q || 1, d = dist(it.i, u.i)
    if (q > bq || (q === bq && d < bd)) { best = it; bq = q; bd = d }
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
  if (u.k === "dwarf") markSeen(w, u.i)
  if (u.carry) { var c = itemById(w, u.carry); if (c) c.i = u.i }
  if (u.pi >= u.path.length) { u.path = null; return 1 }
  return 0
}
function pickUp(w, u, it) { it.by = u.id; it.res = u.id; u.carry = it.id; it.i = u.i }
function putDown(w, u) { if (!u.carry) return null; var it = itemById(w, u.carry); if (it) { it.by = 0; it.res = 0; it.i = u.i } u.carry = 0; return it }
function consumeCarried(w, u) { if (!u.carry) return; var id = u.carry; u.carry = 0; removeItem(w, id) }
function removeItem(w, id) { for (var k = 0; k < w.items.length; k++) if (w.items[k].id === id) { w.items[k].gone = true; w.items.splice(k, 1); return } }

function skillMul(u, s) {
  // everything a badly wounded dwarf does takes twice as long
  var m = (1 + 0.12 * (u.skills[s] || 0) * (u.trait === "preguiçoso" ? 0.7 : 1)) * woundMul(u)
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
    if (lvl + 1 === 12) announce(w, LF("msg.legendary", "{0} tornou-se lendário em {1}!", u.name, skillName(s)), 1)
  }
}
// Which kind of work a job counts as, for inclination and frustration.
function jobCat(kind) {
  if (kind === "dig" || kind === "stair") return "mine"
  if (kind === "chop") return "wood"
  if (kind === "plant" || kind === "harvest") return "farm"
  if (kind === "build") return "build"
  if (kind === "craft" || kind === "forge" || kind === "smelt" || kind === "cut" || kind === "setgem") return "craft"
  if (kind === "brew" || kind === "cook") return "brew"
  if (kind === "train") return "fight"
  if (kind === "haul") return "haul"
  return ""
}
// Is this dwarf steering clear of that kind of work right now? Three botched
// jobs in a row and they want nothing to do with it for a day. Nobody tells
// them to; it is how a hold ends up with everyone doing what they can stand.
function avoiding(w, u, cat) { return !!cat && u.avoid === cat && (u.avoidUntil || 0) > w.tick }
// How much a dwarf wants a kind of work: a bonus for the trade they lean
// toward, a penalty for the one they cannot stand. Used as a distance handicap
// so a hauler will still pick up what is under their nose.
function leaning(u, cat) { return u.likes === cat ? -6 : u.dislikes === cat ? 10 : 0 }
// Skill, mood and inclination decide whether the work comes out right. A
// botch eats the material and yields nothing, which is what makes a master
// smith worth feeding and an apprentice worth training.
function botches(w, u, cat) {
  // A dwarf working the last of the food is careful with it: no ruined batch
  // while the hold is down to its reserve. Lowering the rate instead was the
  // wrong lever - it made no difference the measurement could separate from
  // noise, while the classic embark, which has a single still, was losing its
  // cellar to botched brews and ending three dwarves smaller.
  if (cat === "brew" && countItems(w, "food") < pop(w) * 2) return false
  var p = 0.10 / (1 + (u.skills[cat] || 0) * 0.55)
  if (u.dislikes === cat) p *= 2.2
  if (u.likes === cat) p *= 0.45
  if (u.mood < 30) p *= 1.6
  if (u.trait === "preguiçoso") p *= 1.3
  if (u.hunger > 100 || u.thirst > 100 || u.sleep > 110) p *= 1.5
  return chance(w, Math.min(0.5, p))
}
// The work went wrong: material gone, nothing made, and it stings.
function botch(w, u, cat, what) {
  w.stats.botched++
  u.frust = (u.frust || 0) + 1
  thought(w, u, LF("th.botched", "estragou {0}", what), -3)
  if (u.frust >= 3) {
    u.frust = 0; u.avoid = cat; u.avoidUntil = w.tick + DAY
    thought(w, u, LF("th.gaveup", "largou {0} por hoje", workName(cat)), -2)
    announce(w, LF("msg.gaveup", "{0} largou {1} de frustração.", u.name, workName(cat)), 0)
  }
}
// It came out right: a little pride if it is the work they love, and the
// frustration eases.
function wellDone(w, u, cat) {
  if (u.frust > 0) u.frust--
  if (u.likes === cat && chance(w, 0.12)) thought(w, u, LF("th.likes", "passou o dia fazendo o que gosta: {0}", workName(cat)), 4)
  else if (u.dislikes === cat && chance(w, 0.10)) thought(w, u, LF("th.dislikes", "detesta {0}", workName(cat)), -2)
}

function skillTitle(u) {
  var best = "", bl = -1
  for (var k in u.skills) if (u.skills[k] > bl) { bl = u.skills[k]; best = k }
  var pre = bl >= 12 ? L("title.legendary", "Lendário ") : bl >= 8 ? L("title.master", "Mestre ") : bl >= 4 ? "" : L("title.apprentice", "Aprendiz de ")
  var names = { mine: "minerador", wood: "lenhador", farm: "fazendeiro", build: "pedreiro", craft: "artesão", fight: "guerreiro", brew: "cervejeiro" }
  return bl <= 0 ? L("title.peasant", "camponês") : pre + L("title." + best, names[best])
}

// Pick the nearest designation this dwarf could plausibly do.
function findDesignation(w, u) {
  var ds = cache(w).desigs, cands = [], sieged = besieged(w)
  for (var q = 0; q < ds.length; q++) {
    var i = ds[q], d = w.desig[i]
    if (d === DG_NONE) continue
    if (w.claim[i] && w.claim[i] !== u.id) continue
    var ur = w.unreach[i]; if (ur && ur > w.tick) continue
    if (sieged && outdoor(w, i)) continue
    var dd = dist(i, u.i), dcat = (d === DG_DIG || d === DG_STAIR) ? "mine" : d === DG_CHOP ? "wood" : "build"
    if (avoiding(w, u, dcat)) continue

    if (d === DG_DIG || d === DG_STAIR) dd -= u.skills.mine * 1.5
    else if (d === DG_CHOP) dd -= u.skills.wood * 1.5
    else if (d === DG_BUILD) dd -= u.skills.build * 1.5
    dd += leaning(u, dcat)
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
  var zBefore = digDepth(w)
  if (t === T_STONE) addItem(w, "stone", i)
  else if (t === T_ORE) addItem(w, "ore", i, oreGrade(iz(i)))
  else if (t === T_GEM) { addItem(w, "gem", i); thought(w, u, L("th.gem", "encontrou uma gema"), 4) }
  if (t !== T_OPEN) w.floor[i] = t === T_SOIL ? F_SOIL : F_STONE
  w.tile[i] = T_OPEN
  // greed has a price now: opening floor on a level nobody had reached may
  // wake what has been asleep down there since before the hold
  revealRoom(w, i)
  var zNow = iz(i)
  w.deepest = Math.min(zBefore, zNow)
  if (zNow < zBefore) maybeWake(w, zNow)
  if (zNow <= 1) maybeTomb(w, u, i)
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
      if (t === T_WATER) announce(w, L("msg.water", "Água! A escavação rompeu o riacho."), 2)
      else announce(w, L("msg.magma", "Magma! A escavação rompeu o mar de magma."), 2)
      legend(w, t === T_WATER ? LF("lg.flood", "Inundação em {0}.", w.name) : LF("lg.magma", "Magma invadiu {0}.", w.name))
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
      // a shut floodgate is rock as far as water and magma are concerned, and a
      // well is a sealed shaft rather than a hole in the floor
      if (w.build[ci] === B_FLOODGATE && !w.gatesOpen) continue
      if (w.build[ci] === B_WELL) continue
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
  // A dwarf who is desperate and cannot reach a single drop while the cellar
  // is full is cut off, and the player has no way of knowing. Three of them
  // died of thirst in a real hold with 59 drinks in a stockpile six cells
  // away, and the game said nothing at all. It says something now.
  if ((u.thirst > 95 || u.hunger > 95) && !u.cutoff && w.tick > DAY) {
    var has = countItems(w, "booze") + countItems(w, "food") + countItems(w, "meal")
    if (has > 0 && !freeItemReachable(w, u)) {
      u.cutoff = w.tick
      announce(w, LF("msg.cutoff", "{0} não alcança comida nem bebida: está isolado do resto da fortaleza.", u.name), 2)
      legend(w, LF("lg.cutoff", "{0} ficou isolado no ano {1}.", u.name, date(w).year))
    }
  }
  if (u.thirst > 65) {
    var b = freeItem(w, "booze", u.i, u, true)
    if (b && go(w, u, function (c) { return c === b.i }, b.i)) { b.res = u.id; setJob(w, u, { k: "drink", i: b.i, item: b.id, prog: 0 }); return true }
    // A well, if the hold has one: it is reachable, it is indoors, and nobody
    // has to stand at the edge of open water to use it.
    var well = freeBuilding(w, cache(w).wells, u)
    if (well >= 0 && go(w, u, workSpots(w, well, false), well, 4000)) { setJob(w, u, { k: "drinkwater", i: well, claims: true, prog: 0 }); return true }
    // otherwise: stand next to a water tile
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
// Is there anything to eat or drink this dwarf can actually walk to? Only asked
// when one of them is already desperate, so the path search is rare.
function freeItemReachable(w, u) {
  var types = ["booze", "meal", "food"]
  for (var t = 0; t < types.length; t++) {
    var it = freeItem(w, types[t], u.i, u, true)
    if (it && pathTo(w, u, it.i, 4000)) return true
  }
  // water counts: standing next to the stream is a drink. `findPath` rather
  // than `go`, which would assign the path and quietly send them walking.
  if (findPath(w, u.i, function (c) { return touchesWater(w, c) }, nearestTile(w, u.i, T_WATER), u, 4000)) return true
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
function unitAt(w, i) {
  for (var k = 0; k < w.units.length; k++) if (w.units[k].i === i) return w.units[k]
  return null
}
// How many of the four sides can be walked from here. Two or fewer means this
// cell is a corridor, and closing it can isolate whatever is behind it.
function openNeighbours(w, i) {
  var n = 0, x = ix(i), y = iy(i)
  if (x > 0 && passable(w, i - 1)) n++
  if (x < W - 1 && passable(w, i + 1)) n++
  if (y > 0 && passable(w, i - W)) n++
  if (y < H - 1 && passable(w, i + W)) n++
  return n
}
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
// The same question asked of the cache instead of the map. `nearBuilding`
// walks (2r+1)² cells whether or not the building exists anywhere, which is
// fine under a `chance()` and ruinous once something asks it every tick for
// every dwarf: the hearth's mending bonus alone took the tick from 102 µs to
// 171. A hold has a handful of hearths and two game tables, so scanning the
// list is a handful of comparisons and usually none at all.
function nearAny(w, list, c, r) {
  if (!list.length) return false
  var x = ix(c), y = iy(c), z = iz(c)
  for (var k = 0; k < list.length; k++) {
    var j = list[k]
    if (iz(j) !== z) continue
    if (Math.abs(ix(j) - x) <= r && Math.abs(iy(j) - y) <= r) return true
  }
  return false
}

// ---- the dead ---------------------------------------------------------------
// Remains left lying where someone fell weigh on everyone who walks past. The
// dwarves pick their own burial ground: somewhere they can walk to, out of the
// way of the beds, the tables and the workshops - a quiet corner, which is
// what a graveyard is. Nobody is told where; if the hold leaves no quiet
// reachable corner, the dead stay unburied and it shows in every mood.
function graveyard(w) {
  if (w.graveyard >= 0 && passable(w, w.graveyard)) {
    var r = reachField(w)
    if (r[w.graveyard]) return w.graveyard
  }
  w.graveyard = pickGraveyard(w)
  if (w.graveyard >= 0) {
    announce(w, L("msg.graveyard", "Os anões escolheram um lugar para os seus mortos, num canto quieto."), 1)
    legend(w, L("lg.graveyard", "Um cemitério foi aberto num canto afastado da fortaleza."))
  }
  return w.graveyard
}
function pickGraveyard(w) {
  var c = cache(w), reach = reachField(w), best = -1, bs = -1e9
  // the busy places a graveyard should keep away from
  var busy = c.beds.concat(c.tables, c.stills, c.shops, c.kitchens, c.smelters, c.forges, c.jewelers, c.trainings, c.stocks, c.farms)
  for (var i = 0; i < NN; i++) {
    if (!reach[i] || w.build[i] !== B_NONE || w.desig[i] !== DG_NONE) continue
    if (w.tile[i] !== T_OPEN || w.floor[i] === F_NONE) continue
    var dd = dist(i, w.depot)
    if (dd < 6 || dd > 34) continue          // not on the doorstep, not a hike
    var quiet = 1e9
    for (var q = 0; q < busy.length; q++) { var bq = dist(busy[q], i); if (bq < quiet) quiet = bq }
    if (quiet > 14) quiet = 14                // past a point, quiet is quiet
    var score = quiet * 4 - dd               // quiet first, then near enough to carry
    if (score > bs) { bs = score; best = i }
  }
  return best
}
// A free cell at the burial ground for one more grave.
function graveSpot(w, g) {
  if (w.build[g] === B_NONE && w.tile[g] === T_OPEN && w.floor[g] !== F_NONE) return g
  for (var r = 1; r <= 4; r++) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
      var x = ix(g) + dx, y = iy(g) + dy, z = iz(g)
      if (!inb(x, y, z)) continue
      var i = idx(x, y, z)
      if (w.build[i] === B_NONE && w.desig[i] === DG_NONE && w.tile[i] === T_OPEN && w.floor[i] !== F_NONE && passable(w, i)) return i
    }
  }
  return -1
}
// Carrying a fallen companion to the burial ground.
function branchBury(w, u) {
  if (countItems(w, "remains") === 0) return false
  var g = graveyard(w)
  if (g < 0 || graveSpot(w, g) < 0) return false
  var rem = freeItem(w, "remains", u.i, u)
  if (!rem) return false
  if (!go(w, u, function (q) { return q === rem.i }, rem.i)) return false
  rem.res = u.id
  setJob(w, u, { k: "bury", i: g, item: rem.id, stage: "fetch", prog: 0 })
  return true
}

// ---- who knows whom ---------------------------------------------------------
// A dwarf had a trait, a trade and a mood, and was alone in the world. Every
// loss cost every survivor the same -7 whoever died, so "3 dwarves lost" was
// arithmetic and never a story. These are the ties: kin, who arrive already
// related, and the friendships and rivalries that come out of standing next to
// the same people for a year.
//
// A dwarf keeps four ties, plus their kin. Four is not a budget — it is what
// makes a tie mean anything: remember everyone and a death is diluted into
// twenty small sorrows, remember four and it lands on somebody.
var BOND_KEEP = 4, BOND_FRIEND = 30, BOND_RIVAL = -25, KIN_BOND = 40
function first(n) { return String(n || "").split(" ")[0] }
function bondMap(u) { if (!u.bonds) u.bonds = {}; return u.bonds }
function isKin(u, id) { return !!(u.kin && u.kin.indexOf(id) >= 0) }
// What one dwarf's death is worth to another: the tie they built, plus blood.
function bondTotal(u, id) { return (bondMap(u)[id] || 0) + (isKin(u, id) ? KIN_BOND : 0) }
function trimBonds(u) {
  var b = bondMap(u), ks = Object.keys(b)
  if (ks.length <= BOND_KEEP) return
  // the strongest feelings stay, in either direction; acquaintance goes
  ks.sort(function (p, q) { return Math.abs(b[q]) - Math.abs(b[p]) })
  for (var k = BOND_KEEP; k < ks.length; k++) delete b[ks[k]]
}
// Ties are symmetric, which is one of the few places this game is kinder than
// life. Crossing either threshold is announced once, from the pair's side, so
// it cannot fire again every time the bond wobbles over the line.
function shiftBond(w, a, b, n) {
  var wasA = bondTotal(a, b.id), wasB = bondTotal(b, a.id)
  var ma = bondMap(a), mb = bondMap(b)
  ma[b.id] = Math.max(-100, Math.min(100, (ma[b.id] || 0) + n))
  mb[a.id] = Math.max(-100, Math.min(100, (mb[a.id] || 0) + n))
  trimBonds(a); trimBonds(b)
  var now = bondTotal(a, b.id)
  if (wasA < BOND_FRIEND && wasB < BOND_FRIEND && now >= BOND_FRIEND) {
    thought(w, a, LF("th.friend", "tem em {0} um amigo", first(b.name)), 5)
    thought(w, b, LF("th.friend", "tem em {0} um amigo", first(a.name)), 5)
    legend(w, LF("lg.friend", "{0} e {1} tornaram-se inseparáveis no ano {2}.", a.name, b.name, date(w).year))
  } else if (wasA > BOND_RIVAL && wasB > BOND_RIVAL && now <= BOND_RIVAL) {
    thought(w, a, LF("th.rival", "não suporta mais {0}", first(b.name)), -3)
    thought(w, b, LF("th.rival", "não suporta mais {0}", first(a.name)), -3)
    announce(w, LF("msg.rival", "{0} e {1} não se falam mais.", a.name, b.name), 0)
    legend(w, LF("lg.rival", "{0} e {1} romperam no ano {2}.", a.name, b.name, date(w).year))
  }
}
// Some arrive with family already in the hold. It is the one tie that exists
// before anyone has done anything together, and it is what makes the first
// death of a young fortress hurt.
function maybeKin(w, u) {
  var ds = dwarves(w), pool = []
  for (var k = 0; k < ds.length; k++) if (ds[k] !== u && (!ds[k].kin || ds[k].kin.length < 3)) pool.push(ds[k])
  if (!pool.length || !chance(w, 0.25)) return
  var o = pick(w, pool)
  u.kin = (u.kin || []).concat([o.id])
  o.kin = (o.kin || []).concat([u.id])
}
// Everyone, every two hours of game time, and only against whoever is nearest:
// one tie per dwarf per round, so time spent together concentrates on the
// person actually beside them instead of spreading a thin acquaintance over
// the whole hold. Doing one dwarf per round was tried first and was too slow
// to matter — over two years the strongest tie in the fortress reached 15 of
// the 30 a friendship needs, and nobody was ever anybody's friend.
//
// The cost is a fifth of a distance check per dwarf per tick.
function socialTick(w) {
  var ds = dwarves(w)
  if (ds.length < 2 || w.hostiles > 0) return
  for (var q = 0; q < ds.length; q++) {
    var u = ds[q]
    if (u.mood_state === "berserk" || u.mood_state === "melancholy") continue
    var near = null, nd = 3
    for (var k = 0; k < ds.length; k++) {
      var o = ds[k]
      if (o === u || o.mood_state === "berserk") continue
      var dd = dist(o.i, u.i)
      if (dd < nd) { nd = dd; near = o }
    }
    if (!near) continue
    // Where they are standing decides how fast this goes: a game table is the
    // fastest, then a hearth, then the meeting hall, then a corridor.
    var cc = cache(w)
    // A guard post counts, at the rate of a table: two dwarves standing a watch
    // together talk. Without it, posting the militia cost the hold eight points
    // of mood — soldiers at a post neither drink in the hall nor play at the
    // table, and the fortress felt it.
    var rate = nearAny(w, cc.games, u.i, 1) ? 4 : nearAny(w, cc.hearths, u.i, 2) ? 3
             : nearAny(w, cc.tables, u.i, 2) || nearAny(w, cc.posts, u.i, 1) ? 2 : 1
    shiftBond(w, u, near, rate)
    if (rate >= 2 && bondTotal(u, near.id) >= BOND_FRIEND && chance(w, 0.06))
      thought(w, u, LF("th.withfriend", "bebeu a noite toda com {0}", first(near.name)), 3)
  }
}
// A game of something, at a table built for it. This is the only job in the
// hold whose whole output is a tie between two dwarves — which is why it is
// the last branch tried: nobody plays while there is work, and an idle hold
// with a game table turns its idleness into friendships instead of wandering.
function branchPlay(w, u) {
  var gs = cache(w).games
  if (!gs.length || u.mood >= 92 || w.hostiles > 0) return false
  var g = nearestOf(gs, u.i)
  if (g < 0 || dist(g, u.i) > 30) return false
  if (!go(w, u, function (q) { return q === g || adjacent(q, g) }, g, 600)) return false
  setJob(w, u, { k: "play", i: g, prog: 0 })
  return true
}
// Standing at the grave. The one job in the hold that nobody ordered and that
// produces nothing — which is the point: grief is work, and it is the
// graveyard the hold chose that makes it possible to finish.
function branchMourn(w, u) {
  if (!u.grief || u.grief <= 0) return false
  if (graveyard(w) < 0) return false
  var gs = cache(w).graves
  if (!gs.length) return false
  var gr = nearestOf(gs, u.i)
  if (gr < 0) return false
  if (!go(w, u, function (q) { return q === gr || adjacent(q, gr) }, gr, 800)) return false
  setJob(w, u, { k: "mourn", i: gr, prog: 0 })
  return true
}

// ---- work orders ------------------------------------------------------------
// One queue that the hold and the player both write to. The hold files what it
// notices missing every morning, so a hold with a still and barley brews
// without being told; the player files what they want, and theirs come first.
// There is no labor screen: a dwarf takes the first order they can stand and
// are near, which is what their inclination decides.
var ORDER_SPEC = {
  booze:  { job: "brew",   b: B_STILL,    mat: "food",   min: 5, cat: "brew",  name: "cerveja" },
  meal:   { job: "cook",   b: B_KITCHEN,  mat: "food",   min: 8, cat: "brew",  name: "refeições" },
  bar:    { job: "smelt",  b: B_SMELTER,  mat: "ore",            cat: "craft", name: "barras de metal" },
  pick:   { job: "forge",  b: B_FORGE,    mat: "bar",            cat: "craft", name: "picaretas",  product: "pick" },
  axe:    { job: "forge",  b: B_FORGE,    mat: "bar",            cat: "craft", name: "machados",   product: "axe" },
  weapon: { job: "forge",  b: B_FORGE,    mat: "bar",            cat: "craft", name: "armas",      product: "weapon" },
  armor:  { job: "forge",  b: B_FORGE,    mat: "bar",            cat: "craft", name: "armaduras",  product: "armor" },
  craft:  { job: "craft",  b: B_WORKSHOP, mat: "stone", mat2: "log", cat: "craft", name: "artesanato" },
  cutgem: { job: "cut",    b: B_JEWELER,  mat: "gem",            cat: "craft", name: "gemas lapidadas" },
  jewel:  { job: "setgem", b: B_JEWELER,  mat: "cutgem",         cat: "craft", name: "joias" },
  // spare bars become trade goods at the forge, not at the workshop: without
  // this the metal had no consumer once everyone was equipped and the bars sat
  // at twelve while the mine quietly stopped
  metalcraft: { job: "craft", b: B_FORGE, mat: "bar",            cat: "craft", name: "artesanato de metal" }
}
var ORDER_KINDS = ["booze", "meal", "bar", "pick", "axe", "weapon", "armor", "craft", "metalcraft", "cutgem", "jewel"]

function orderName(what) { var sp = ORDER_SPEC[what]; return L("order." + what, sp ? sp.name : what) }
function orderList(w) { if (!w.orders) w.orders = []; return w.orders }
function buildingsFor(w, b) {
  var c = cache(w)
  return b === B_STILL ? c.stills : b === B_KITCHEN ? c.kitchens : b === B_SMELTER ? c.smelters
       : b === B_FORGE ? c.forges : b === B_WORKSHOP ? c.shops : b === B_JEWELER ? c.jewelers : []
}
// How many of a kind are still owed across the whole queue.
function orderPending(w, what) {
  var list = orderList(w), n = 0
  for (var k = 0; k < list.length; k++) if (list[k].what === what) n += Math.max(0, list[k].n - list[k].done)
  return n
}
function fileOrder(w, what, n, byPlayer) {
  if (!ORDER_SPEC[what] || n <= 0) return null
  var list = orderList(w), mine = byPlayer ? 1 : 0
  for (var k = 0; k < list.length; k++) if (list[k].what === what && list[k].by === mine) { list[k].n += n; return list[k] }
  var o = { id: w.nextId++, what: what, n: n, done: 0, by: mine, at: w.tick }
  list.push(o); return o
}
function cancelOrder(w, id) {
  var list = orderList(w)
  for (var k = 0; k < list.length; k++) if (list[k].id === id) { list.splice(k, 1); return true }
  return false
}
// The player taking an order back off the queue.
function dropPlayerOrder(w, what, n) {
  var list = orderList(w)
  for (var k = list.length - 1; k >= 0; k--) {
    if (list[k].what !== what || !list[k].by) continue
    list[k].n -= (n || 1)
    if (list[k].n - list[k].done <= 0) list.splice(k, 1)
    return true
  }
  return false
}
function clearPlayerOrders(w) {
  var list = orderList(w), keep = []
  for (var k = 0; k < list.length; k++) if (!list[k].by) keep.push(list[k])
  w.orders = keep
}
// What the player has asked for and what the hold noticed, for the panel.
function orderCounts(w, what) {
  var list = orderList(w), r = { mine: 0, hold: 0 }
  for (var k = 0; k < list.length; k++) {
    if (list[k].what !== what) continue
    var left = Math.max(0, list[k].n - list[k].done)
    if (list[k].by) r.mine += left; else r.hold += left
  }
  return r
}

function orderDone(w, j) {
  if (!j || !j.order) return
  var list = orderList(w)
  for (var k = 0; k < list.length; k++) {
    if (list[k].id !== j.order) continue
    list[k].done++
    if (list[k].done >= list[k].n) {
      if (list[k].by) announce(w, LF("msg.order.done", "Ordem cumprida: {0} × {1}.", list[k].n, orderName(list[k].what)), 1)
      list.splice(k, 1)
    }
    return
  }
}
// The hold's own orders, rewritten every morning so they always say what is
// missing now. The player's are left exactly as they filed them.
function holdOrders(w) {
  var list = orderList(w), keep = []
  for (var k = 0; k < list.length; k++) if (list[k].by) keep.push(list[k])
  w.orders = keep
  var c = cache(w), p = pop(w), food = countItems(w, "food")
  function want(what, short, ok) {
    if (!ok || short <= 0) return
    var gap = short - orderPending(w, what)
    if (gap > 0) fileOrder(w, what, Math.min(gap, 8), false)
  }
  want("booze", p * 3 + 6 - countItems(w, "booze"), c.stills.length > 0 && food >= 5)
  want("meal", p * 2 - countItems(w, "meal"), c.kitchens.length > 0 && food >= 8)
  want("bar", Math.min(12 - countItems(w, "bar"), countItems(w, "ore")), c.smelters.length > 0)
  var fw = forgeWant(w)
  if (fw && c.forges.length > 0) want(fw === "craft" ? "metalcraft" : fw, fw === "craft" ? 2 : 1, true)
  want("cutgem", countItems(w, "gem"), c.jewelers.length > 0)
  want("jewel", Math.min(countItems(w, "cutgem"), 24 - countItems(w, "jewel")), c.jewelers.length > 0)
  want("craft", 40 - countItems(w, "craft"), c.shops.length > 0 && (countItems(w, "stone") > 4 || countItems(w, "log") > 6))
}
// Try to take this order: a free workshop, material in reach, and a path.
function startOrder(w, u, o, spec) {
  var b = freeBuilding(w, buildingsFor(w, spec.b), u)
  if (b < 0) return false
  if (spec.min && countItems(w, spec.mat) < spec.min) return false
  var mat = null
  // Arms and armor get the best bar in the hold, not the nearest one. Without
  // this the steel sat in the stockpile while the militia was equipped in
  // copper: the grade average was 1.32 out of 3, and the whole point of
  // digging deep never reached the people doing the fighting.
  if (spec.product === "weapon" || spec.product === "armor") mat = bestItem(w, spec.mat, u)
  if (!mat) mat = freeItem(w, spec.mat, u.i, u)
  if (!mat && spec.mat2) mat = freeItem(w, spec.mat2, u.i, u)
  if (!mat) return false
  if (!go(w, u, function (q) { return q === mat.i }, mat.i)) return false
  mat.res = u.id
  var job = { k: spec.job, i: b, claims: true, item: mat.id, stage: "fetch", prog: 0, order: o.id }
  if (spec.product) job.product = spec.product
  if (mat.q) job.grade = mat.q      // the grade travels with the material
  setJob(w, u, job)
  return true
}
// The order this dwarf reaches for: the player's before the hold's, and among
// those, the work they lean toward before the work they cannot stand.
function takeOrder(w, u) {
  var orders = orderList(w), cands = []
  // Subsistence outranks taste and outranks the player: with the old scoring a
  // dwarf who leaned toward the workshop took ore to the smelter while the
  // cellar ran dry, and a hold with no beer sinks. Food and drink first,
  // everything else after.
  var dry = countItems(w, "booze") < pop(w)
  var hungry = countItems(w, "food") + countItems(w, "meal") < pop(w) * 2
  for (var q = 0; q < orders.length; q++) {
    var o = orders[q], spec = ORDER_SPEC[o.what]
    if (!spec || o.done >= o.n) continue
    if (avoiding(w, u, spec.cat)) continue
    var urgent = (o.what === "booze" && dry) || (o.what === "meal" && hungry)
    cands.push([(urgent ? -100 : 0) + (o.by ? 0 : 60) + q + leaning(u, spec.cat), o, spec])
  }
  if (!cands.length) return false
  cands.sort(function (a, b) { return a[0] - b[0] })
  for (var t = 0; t < cands.length; t++) if (startOrder(w, u, cands[t][1], cands[t][2])) return true
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
  // The best one, not the nearest: a relic on the floor is worth the walk, and
  // so is steel over copper. Tools stay nearest-first — a pick is a pick.
  var it = (want === "weapon" || want === "armor") ? bestItem(w, want, u) : freeItem(w, want, u.i, u)
  if (!it || !go(w, u, function (c) { return c === it.i }, it.i)) return false
  it.res = u.id; setJob(w, u, { k: "equip", i: -1, item: it.id, slot: want }); return true
}
// Each kind of work a dwarf can find on their own, as a branch that either
// takes a job or declines. They are separate functions because the *order*
// they are tried in is the whole point: a fixed ladder meant a dwarf who
// loves hauling still went to the fields first, and measuring showed
// inclination changing nothing at all (11.7% of work in the trade they love,
// against 12.5% by pure chance).
function branchFarm(w, u) {
  var c = cache(w), i
  // toward a larder of FOOD_PER_DWARF per dwarf and no further. This used to
  // run first and unconditionally, so the fields ate the whole workforce and
  // the larder climbed past 2700 while nobody mined or built. A field left
  // ripe keeps; only planting stops at the cap.
  var larder = countItems(w, "food") + countItems(w, "meal") * 2, foodCap = pop(w) * FOOD_PER_DWARF
  var farms = c.farms, sieged = besieged(w)
  for (var fq = 0; fq < farms.length && larder < foodCap * 1.5; fq++) {
    i = farms[fq]
    if (sieged && outdoor(w, i)) continue
    if (w.claim[i] && w.claim[i] !== u.id) continue
    if (w.unreach[i] && w.unreach[i] > w.tick) continue
    var ripe = w.grow[i] >= 200
    if (ripe || (w.grow[i] === 0 && larder < foodCap)) {
      if (go(w, u, workSpots(w, i, false), i, 1500)) { setJob(w, u, { k: ripe ? "harvest" : "plant", i: i, claims: true, prog: 0 }); return true }
      w.unreach[i] = w.tick + 200
    }
  }
  return false
}
// when the larder runs low, pick shrubs
// Under siege nobody works above ground: the fields, the shrubs and the trees
// are all out there with the goblins. This is what the siege actually costs,
// and it is why a hold with its plots on the surface feels it and one with
// them underground does not.
function besieged(w) { return !!w.siege && w.hostiles > 0 }
function branchGather(w, u) {
  var c = cache(w)
  if (besieged(w)) return false
  if (countItems(w, "food") >= pop(w) + 2 || c.shrubs.length === 0) return false
  // A cooldown of its own: sharing one with the eating-a-shrub search in
  // needJob meant a dwarf who failed to find a shrub to *harvest* was then
  // barred from finding one to *eat*, and eleven holds in sixteen starved.
  // No cooldown on this search, tempting as it is: it expands up to 5000 cells
  // and a starving hold runs it 1632 times in two years, which is most of the
  // tick cost when the larder is empty. But resting after a failure - by any
  // of the three rules tried - starved the cave-moss gatherers and cost ten
  // or eleven holds in sixteen. A hungry dwarf gets to keep looking.
  var sh = nearestTile(w, u.i, T_SHRUB)
  if (w.tile[sh] === T_SHRUB && !(w.claim[sh] && w.claim[sh] !== u.id) && dist(sh, u.i) < 40 && go(w, u, workSpots(w, sh, false), sh, 5000)) {
    setJob(w, u, { k: "chop", i: sh, claims: true, prog: 0 }); return true
  }
  return false
}
// the militia drills when there is nothing else to do
function branchTrain(w, u) {
  if (!u.militia) return false
  var yard = freeBuilding(w, cache(w).trainings, u)
  if (yard < 0) return false
  // A guard trains at a yard near their post, or not at all: a drill yard on
  // the other side of the hold is how a post empties out for half a day.
  if (u.post >= 0 && w.build[u.post] === B_POST && dist(yard, u.post) > POST_REACH) return false
  if (chance(w, 0.5) && go(w, u, workSpots(w, yard, false), yard, 1500)) { setJob(w, u, { k: "train", i: yard, claims: true, prog: 0 }); return true }
  return false
}
function branchHaul(w, u) {
  var spot = stockpileSpot(w, u.i)
  if (spot < 0) return false
  var best = null, bd = 1e9, hl = w.haulable || w.items
  for (var k = 0; k < hl.length; k++) {
    var ci = hl[k]
    if (ci.gone || ci.res || ci.by || onStockpile(w, ci) || ci.t === "remains") continue
    if (w.unreach["i" + ci.id]) continue
    var d = dist(ci.i, u.i); if (d < bd) { bd = d; best = ci }
  }
  if (best && go(w, u, function (c2) { return c2 === best.i }, best.i)) { best.res = u.id; setJob(w, u, { k: "haul", i: spot, item: best.id, stage: "fetch", prog: 0 }); return true }
  if (best) w.unreach["i" + best.id] = true
  return false
}

// The branches in their default order, with the kind of work each one is, so
// a leaning can move it up or down the list.
var BRANCHES = [
  { cat: "",      fn: branchRest },     // the badly hurt lie down
  { cat: "haul",  fn: branchTend },     // and somebody sees to them
  { cat: "fight", fn: branchStation },  // a guard with a post holds it
  { cat: "haul",  fn: branchBury },  // the dead first: everyone walks past them
  { cat: "",      fn: branchMourn }, // then whoever cannot work for grieving
  { cat: "farm",  fn: branchFarm },
  { cat: "",      fn: takeOrder },   // orders carry their own kind; takeOrder sorts them
  { cat: "farm",  fn: branchGather },
  { cat: "fight", fn: branchTrain },
  { cat: "haul",  fn: branchTrade },  // the caravan leaves on the fifth day
  { cat: "haul",  fn: branchHaul },
  { cat: "",      fn: branchPlay }   // last: only ever instead of idling
]
function economyJob(w, u) {
  if (gearJob(w, u)) return true
  // A posted guard does not take work. Letting them pick up a hauling job
  // meant they held the post 12% of the time and were somewhere across the
  // fortress the rest of it, which is the same as having no post at all. The
  // labour it costs is the price of the order: post six dwarves and the hold
  // is six workers short, which is the decision the player is making.
  if (u.militia && u.post >= 0 && w.build[u.post] === B_POST) {
    if (branchStation(w, u)) return true
    return branchTrain(w, u)
  }
  // An empty larder overrides taste: nobody sets gems while there is nothing
  // to eat, however much they hate the fields.
  if (countItems(w, "food") + countItems(w, "meal") < pop(w) + 2) {
    if (branchFarm(w, u)) return true
    if (branchGather(w, u)) return true
  }
  var list = []
  for (var k = 0; k < BRANCHES.length; k++) {
    var b = BRANCHES[k]
    if (b.cat && avoiding(w, u, b.cat)) continue
    list.push([k * 2 + leaning(u, b.cat), b.fn])
  }
  list.sort(function (a, b2) { return a[0] - b2[0] })
  for (var t = 0; t < list.length; t++) if (list[t][1](w, u)) return true
  return false
}

function idle(w, u) {
  // Wander a little; drift toward tables (the meeting hall) when there is one.
  if (u.wait > 0) { u.wait--; return }
  u.wait = 3 + ri(w, 8)
  var target = -1
  if (u.militia && u.post >= 0 && w.build[u.post] === B_POST && dist(u.i, u.post) > 2) target = u.post
  if (target < 0 && chance(w, 0.35)) { var t = findBuilding(w, B_TABLE, u.i); if (t >= 0 && dist(t, u.i) < 25) target = t }
  // a fire pulls harder than a table, and at night hardest of all
  if (target < 0 && chance(w, isNight(w) ? 0.5 : 0.3)) { var hh = findBuilding(w, B_HEARTH, u.i); if (hh >= 0 && dist(hh, u.i) < 25) target = hh }
  if (target < 0) {
    var x = ix(u.i) + ri(w, 7) - 3, y = iy(u.i) + ri(w, 7) - 3
    if (inb(x, y, iz(u.i))) target = idx(x, y, iz(u.i))
  }
  if (target >= 0 && passable(w, target)) go(w, u, function (c) { return c === target }, target, 400)
  // socializing
  if (nearBuilding(w, u.i, B_TABLE, 2) && chance(w, 0.08)) {
    for (var k = 0; k < w.units.length; k++) { var o = w.units[k]; if (o !== u && o.k === "dwarf" && dist(o.i, u.i) <= 2) { thought(w, u, LF("th.talked", "conversou com {0}", o.name.split(" ")[0]), 2); break } }
  }
  if (nearBuilding(w, u.i, B_STATUE, 2) && chance(w, 0.05)) thought(w, u, L("th.statue", "admirou uma bela estátua"), 3)
  if (nearAny(w, cache(w).crystals, u.i, 3) && chance(w, 0.05)) thought(w, u, L("th.crystal", "ficou olhando a luz dentro do cristal"), 5)
  if (nearAny(w, cache(w).hearths, u.i, 2) && chance(w, 0.06)) thought(w, u, L("th.hearth", "esquentou-se junto ao fogo"), 3)
  if (nearBuilding(w, u.i, B_GRAVE, 2) && chance(w, 0.06)) thought(w, u, L("th.grave", "prestou respeito aos mortos da fortaleza"), 2)
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
        if (u.tool === "pick") wearOut(w, u, "pick")
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
        if (t !== T_SHRUB && u.tool === "axe") wearOut(w, u, "axe")
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
        if (j.bt === B_TRAP) armTrap(w, j.i)
        w.stats.built++; gainSkill(w, u, "build", 1)
        if (j.bt === B_STOCK || j.bt === B_FARM) {} else thought(w, u, LF("th.built", "construiu {0}", buildName(j.bt)), 1)
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
      if (j.slot === "weapon") { u.weapon = true; u.weaponQ = it.q || 1; u.wnm = it.nm || ""; u.wtitle = it.title || "" }
      else if (j.slot === "armor") { u.armor = true; u.armorQ = it.q || 1 }
      else { u.tool = j.slot; u.toolQ = it.q || 1 }
      if (j.slot === "weapon" && it.nm) {
        thought(w, u, LF("th.bore.relic", "empunha {0}", it.nm), 10)
        announce(w, LF("msg.bore.relic", "{0} empunha {1}, {2}.", u.name, it.nm, it.title), 1)
        legend(w, LF("lg.bore.relic", "{0} empunhou {1} no ano {2}.", u.name, it.nm, date(w).year))
      } else thought(w, u, j.slot === "weapon" ? L("th.armed", "pegou em armas") : j.slot === "armor" ? L("th.armored", "vestiu uma armadura") : j.slot === "pick" ? L("th.newpick", "ganhou uma picareta nova") : L("th.newaxe", "ganhou um machado novo"), 2)
      dropJob(w, u); return
    case "train":
      if (w.build[j.i] !== B_TRAINING) { dropJob(w, u); return }
      j.prog++
      if (j.prog >= 20) { gainSkill(w, u, "fight", 2); if (chance(w, 0.3)) thought(w, u, L("th.trained", "treinou com os companheiros"), 1); dropJob(w, u) }
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
        if (botches(w, u, "craft")) { consumeCarried(w, u); botch(w, u, "craft", j.k === "cut" ? L("botch.gem", "a gema ao lapidar") : L("botch.jewel", "a joia")); dropJob(w, u); return }
        consumeCarried(w, u)
        if (j.k === "cut") { addItem(w, "cutgem", j.i); w.stats.cut = (w.stats.cut || 0) + 1; thought(w, u, L("th.cutgem", "lapidou uma gema"), 2) }
        else { addItem(w, "jewel", j.i); w.stats.jewels = (w.stats.jewels || 0) + 1; u.made++; thought(w, u, L("th.jewel", "fez uma joia"), 3) }
        gainSkill(w, u, "craft", 1); wellDone(w, u, "craft"); orderDone(w, j)
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
      var ccat = jobCat(j.k)
      j.prog += skillMul(u, j.k === "cook" ? "brew" : "craft")
      if (j.prog >= (j.k === "cook" ? 16 : j.k === "smelt" ? 24 : 30)) {
        if (botches(w, u, ccat)) {
          consumeCarried(w, u)
          botch(w, u, ccat, j.k === "cook" ? L("botch.meal", "a refeição") : j.k === "smelt" ? L("botch.smelt", "a fundição e perdeu o minério") : L("botch.forge", "o trabalho na forja"))
          dropJob(w, u); return
        }
        consumeCarried(w, u)
        if (j.k === "cook") { addItem(w, "meal", j.i); addItem(w, "meal", j.i); w.stats.cooked = (w.stats.cooked || 0) + 1; gainSkill(w, u, "brew", 1) }
        else if (j.k === "smelt") { addItem(w, "bar", j.i, j.grade || 1); w.stats.smelted = (w.stats.smelted || 0) + 1; gainSkill(w, u, "craft", 1) }
        else {
          var made = addItem(w, j.product, j.i, j.product === "craft" ? 0 : (j.grade || 1))
          w.stats.forged = (w.stats.forged || 0) + 1; u.made++; gainSkill(w, u, "craft", 1)
          if (j.product !== "craft") thought(w, u, LF("th.forged", "forjou uma {0}", itemLabel(made)), 2)
        }
        wellDone(w, u, ccat); orderDone(w, j)
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
      var isBrew = j.k === "brew", bcat = jobCat(j.k)
      j.prog += skillMul(u, isBrew ? "brew" : "craft")
      if (j.prog >= (isBrew ? 22 : 30)) {
        if (botches(w, u, bcat)) {
          consumeCarried(w, u)
          botch(w, u, bcat, isBrew ? L("botch.brew", "a fornada de cerveja") : L("botch.craft", "a peça na oficina"))
          dropJob(w, u); return
        }
        var mat = itemById(w, j.item); var matType = mat ? mat.t : "stone"
        consumeCarried(w, u)
        if (isBrew) { for (var q = 0; q < 3; q++) addItem(w, "booze", j.i); w.stats.brewed++; gainSkill(w, u, "brew", 1) }
        else {
          addItem(w, "craft", j.i); w.stats.crafted++; u.made++; gainSkill(w, u, "craft", 1)
          if (u.skills.craft >= 8 && chance(w, 0.2)) thought(w, u, L("th.masterwork", "criou uma obra-prima"), 4)
        }
        wellDone(w, u, bcat); orderDone(w, j)
        dropJob(w, u)
      }
      return
    case "bury":
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (!go(w, u, function (c) { return c === j.i || adjacent(c, j.i) }, j.i)) dropJob(w, u)
        return
      }
      j.prog++
      if (j.prog >= 12) {
        var gs = graveSpot(w, j.i)
        consumeCarried(w, u)
        if (gs >= 0) { w.build[gs] = B_GRAVE; w.dirty = true }
        w.stats.buried++
        thought(w, u, L("th.buried", "sepultou um companheiro como se deve"), 3)
        announce(w, LF("msg.buried", "{0} sepultou um companheiro no cemitério.", u.name), 0)
        dropJob(w, u)
      }
      return
    case "station":
      // Holding a post is not work that finishes; it ends when they are there,
      // and `idle` keeps them near it from then on.
      //
      // Both of these releases are load-bearing. `work()` runs before
      // `needJob()`, so a guard who cannot reach their post keeps the job
      // forever and never eats or drinks again: posting the militia put five
      // deaths of thirst into sixteen fortresses that had none.
      if (w.build[j.i] !== B_POST) { u.post = -1; dropJob(w, u); return }
      if (u.thirst > 65 || u.hunger > 65 || u.sleep > 75) { dropJob(w, u); return }
      if (!u.path && dist(u.i, j.i) > 2) { dropJob(w, u); return }
      if (dist(u.i, j.i) <= 2) { if (chance(w, 0.02)) thought(w, u, L("th.station", "montou guarda no posto"), 1); dropJob(w, u) }
      return
    case "rest":
      if (w.build[j.i] !== B_HOSPITAL) { dropJob(w, u); return }
      if (u.i !== j.i) { if (!u.path) dropJob(w, u); return }
      j.prog++
      // Lying down alone does not mend a bad wound — that is what the tending
      // is for. It keeps them from making it worse, and keeps them findable.
      if (!wounded(u)) { thought(w, u, L("th.mended", "levantou do leito curado"), 5); dropJob(w, u) }
      return
    case "tend":
      var pat = unitById(w, j.who)
      if (!pat || w.build[j.i] !== B_HOSPITAL || !wounded(pat)) { dropJob(w, u); return }
      if (dist(u.i, j.i) > 1) { if (!u.path) dropJob(w, u); return }
      j.prog += skillMul(u, "craft")
      if (j.prog >= TEND_WORK) {
        pat.hp = Math.min(pat.maxhp, pat.hp + 3 + Math.floor(u.skills.craft / 3))
        pat.tended = w.tick + DAY
        w.stats.tended = (w.stats.tended || 0) + 1
        gainSkill(w, u, "craft", 1)
        thought(w, u, LF("th.tended", "cuidou de {0}", first(pat.name)), 3)
        thought(w, pat, LF("th.was.tended", "foi cuidado por {0}", first(u.name)), 4)
        shiftBond(w, u, pat, 5)
        announce(w, LF("msg.tended", "{0} cuidou de {1} na enfermaria.", u.name, pat.name), 0)
        dropJob(w, u)
      }
      return
    case "trade":
      if (j.stage === "fetch") {
        it = itemById(w, j.item)
        if (!it || it.i !== u.i) { dropJob(w, u); return }
        pickUp(w, u, it); j.stage = "go"
        if (!go(w, u, function (c) { return c === j.i || adjacent(c, j.i) }, j.i)) dropJob(w, u)
        return
      }
      if (!w.caravan || w.caravan.stage !== "trade") { putDown(w, u); dropJob(w, u); return }
      if (dist(u.i, j.i) > 2) { if (!u.path) dropJob(w, u); return }
      consumeCarried(w, u)
      var tr2 = tradeTable(w)
      if (!tr2.delivered) tr2.delivered = {}
      tr2.delivered[j.what] = (tr2.delivered[j.what] || 0) + 1
      w.dirty = true
      gainSkill(w, u, "craft", 1)
      tradeSettle(w)
      dropJob(w, u)
      return
    case "play":
      j.prog++
      // Twelve ticks, not twenty-four. A dwarf at the table does not re-check
      // for work until the game is over, so a long game makes them deaf to a
      // new order: at 24 the hold went from 12.1 dwarves to 10.9 and lost one
      // fortress in sixteen, and at 12 it goes to 15.6 with none lost and the
      // mood up from 55 to 74. Idleness spent on each other is free; idleness
      // that ignores the larder is not.
      if (j.prog < 12) return
      // Whoever else is at the table. Alone it is patience with a set of dice
      // and worth very little; the point is the person across it.
      var mate = null
      for (var pq = 0; pq < w.units.length; pq++) {
        var po = w.units[pq]
        if (po === u || po.k !== "dwarf" || dist(po.i, u.i) > 2) continue
        mate = po; break
      }
      if (!mate) { thought(w, u, L("th.played.alone", "passou um tempo com os dados"), 2); dropJob(w, u); return }
      // Losing badly to somebody is one of the two ways a rivalry starts. The
      // other is a fist in a tantrum, and this one is cheaper for everyone.
      if (chance(w, 0.12)) {
        thought(w, u, LF("th.played.lost", "perdeu feio para {0} e não achou graça", first(mate.name)), -2)
        thought(w, mate, LF("th.played.won", "ganhou de {0} sem piedade", first(u.name)), 4)
        shiftBond(w, u, mate, -6)
      } else {
        thought(w, u, LF("th.played", "jogou com {0}", first(mate.name)), 4)
        thought(w, mate, LF("th.played", "jogou com {0}", first(u.name)), 4)
        shiftBond(w, u, mate, 8)
      }
      dropJob(w, u); return
    case "mourn":
      j.prog++
      if (j.prog >= 20) {
        u.grief = Math.max(0, (u.grief || 0) - 2)
        thought(w, u, L("th.mourned", "ficou um tempo junto aos túmulos"), 6)
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
        if (cooked && table) thought(w, u, litHere ? L("th.meal.lit", "jantou uma refeição preparada à luz de tochas") : L("th.meal.table", "comeu uma refeição preparada à mesa"), litHere ? 6 : 5)
        else if (table) thought(w, u, litHere ? L("th.table.lit", "comeu à mesa, num salão iluminado") : L("th.table.dark", "comeu à mesa no escuro"), litHere ? 3 : 2)
        else thought(w, u, cooked ? L("th.meal.notable", "comeu uma refeição preparada sem mesa") : L("th.notable", "comeu sem mesa"), cooked ? 2 : -1)
        dropJob(w, u)
      }
      return
    case "forage":
      j.prog++
      if (j.prog >= 8) { u.hunger = Math.max(0, u.hunger - 60); thought(w, u, L("th.berries", "comeu frutinhas do mato"), -1); dropJob(w, u) }
      return
    case "drink":
      it = itemById(w, j.item)
      if (!it || it.i !== u.i) { dropJob(w, u); return }
      j.prog++
      if (j.prog >= 5) { removeItem(w, it.id); u.thirst = 0; thought(w, u, L("th.beer", "bebeu cerveja de cogumelo"), 4); dropJob(w, u) }
      return
    case "drinkwater":
      // Water from a well is water all the same, but drawn and clean: it does
      // not carry the indignity of lying down at the edge of a pool.
      if (j.i >= 0 && w.build[j.i] !== B_WELL) { dropJob(w, u); return }
      j.prog++
      if (j.prog >= 5) {
        u.thirst = 0
        thought(w, u, j.i >= 0 ? L("th.wellwater", "bebeu do poço") : L("th.water", "teve que beber água"), j.i >= 0 ? 0 : -2)
        dropJob(w, u)
      }
      return
    case "sleep":
      j.prog++
      u.sleep = Math.max(0, u.sleep - (j.bed ? 3.5 : 2.5))
      if (u.sleep <= 0) {
        var bedLit = isLit(w, u.i)
        if (j.bed) thought(w, u, bedLit ? L("th.bed.lit", "dormiu numa cama, num quarto iluminado") : L("th.bed.dark", "dormiu numa cama no escuro"), bedLit ? 4 : 2)
        else thought(w, u, L("th.floor", "dormiu no chão"), -3)
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
// ---- what inspires them -----------------------------------------------------
// An artifact was a name and a sentence out of a table: "it bears an image of
// cheese." Charming once, and then plainly disconnected from the fortress it
// came out of — the one legendary object the hold would ever make said nothing
// about the hold.
//
// A strange mood now starts from something that actually happened, and the
// thing they make records it. Personal losses weigh most, because they are
// what the dwarf has been thinking about; the founding is always available, so
// there is never nothing to carve.
function inspiration(w, u) {
  var c = [], k, yr = date(w).year
  // Their own dead, first and loudest. Twice in the list, because this is what
  // a dwarf in a strange mood is actually turning over.
  var recent = (w.dead || []).filter(function (d) { return w.tick - d.t < YEAR })
  for (k = recent.length - 1; k >= 0 && k > recent.length - 6; k--) {
    var dn = recent[k].name
    c.push({ k: "lost", who: dn, year: date({ tick: recent[k].t }).year })
    if (u.lostKin === dn) { c.push({ k: "lost_kin", who: dn }); c.push({ k: "lost_kin", who: dn }) }
    else if (u.lostFriend === dn) { c.push({ k: "lost_friend", who: dn }); c.push({ k: "lost_friend", who: dn }) }
  }
  // The living they have feelings about.
  var bm = bondMap(u)
  for (var id in bm) {
    var o = unitById(w, parseInt(id, 10))
    if (!o || o.k !== "dwarf") continue
    if (isKin(u, o.id)) c.push({ k: "kin", who: o.name })
    else if (bm[id] >= BOND_FRIEND) c.push({ k: "friend", who: o.name })
    else if (bm[id] <= BOND_RIVAL) c.push({ k: "rival", who: o.name })
  }
  for (k = 0; k < (u.kin || []).length; k++) { var ku = unitById(w, u.kin[k]); if (ku) c.push({ k: "kin", who: ku.name }) }
  // What the hold as a whole has been through.
  if (w.stats.raids > 0) c.push({ k: "repelled", year: yr })
  if (w.siege || (w.stats.raids || 0) > 3) c.push({ k: "siege" })
  if (w.tomb) c.push({ k: "tomb" })
  if (w.relic) c.push({ k: "relic", who: w.relic.nm })
  if (w.pact) c.push({ k: "pact" })
  if (w.grudge) c.push({ k: "grudge" })
  if (w.stirred) c.push({ k: "depths", year: digDepth(w) })
  if (w.baron) { var bu = unitById(w, w.baron); if (bu) c.push({ k: "baron", who: bu.name }) }
  if ((w.stats.caravans || 0) > 0) c.push({ k: "caravan" })
  if ((w.done || {}).artifact && w.artifacts.length) c.push({ k: "artifact", who: w.artifacts[w.artifacts.length - 1].name })
  if ((w.done || {}).depths) c.push({ k: "magma" })
  if ((w.stats.buried || 0) > 0) c.push({ k: "graves" })
  // always something: the day they got here
  c.push({ k: "founding", who: w.name, year: 1 })
  return pick(w, c)
}
// The sentence on the artifact. Kept here rather than in the name tables
// because it is about the fortress, not about decoration.
function artScene(w, about) {
  if (!about) return pick(w, tbl("ART_TAIL", ART_TAIL))
  var who = about.who || "", yr = about.year || date(w).year
  switch (about.k) {
    case "lost_kin": return LF("art.sc.lost_kin", "Traz a imagem de {0}, do mesmo sangue de quem o fez. {0} está caindo.", first(who))
    case "lost_friend": return LF("art.sc.lost_friend", "Traz a imagem de {0} e de quem o fez, lado a lado. É uma despedida.", first(who))
    case "lost": return LF("art.sc.lost", "Traz a imagem de {0}, que morreu no ano {1}.", first(who), yr)
    case "kin": return LF("art.sc.kin", "Traz a imagem de {0}, da mesma família de quem o fez.", first(who))
    case "friend": return LF("art.sc.friend", "Traz a imagem de {0}. As duas figuras estão rindo.", first(who))
    case "rival": return LF("art.sc.rival", "Traz a imagem de {0}, de costas.", first(who))
    case "repelled": return LF("art.sc.repelled", "Retrata a onda que quebrou no portão no ano {0}.", yr)
    case "siege": return L("art.sc.siege", "Retrata portas trancadas, e o que esperava do outro lado.")
    case "tomb": return L("art.sc.tomb", "Retrata uma tumba aberta e o rei sem nome dentro dela.")
    case "relic": return LF("art.sc.relic", "Retrata {0} mudando de mãos nas profundezas.", who)
    case "pact": return L("art.sc.pact", "Retrata um acordo com algo que mora abaixo da rocha.")
    case "grudge": return L("art.sc.grudge", "Retrata o que esta fortaleza ficou devendo às profundezas.")
    case "depths": return LF("art.sc.depths", "Retrata o nível {0} e a coisa que acordou nele.", yr)
    case "baron": return LF("art.sc.baron", "Retrata {0} de coroa, maior do que deveria ser.", first(who))
    case "caravan": return L("art.sc.caravan", "Retrata mercadores das Montanhas-Lar e o que eles trouxeram.")
    case "artifact": return LF("art.sc.artifact", "Retrata {0}, feito antes dele nesta mesma fortaleza.", who)
    case "magma": return L("art.sc.magma", "Retrata o fogo no fundo do mundo.")
    case "graves": return L("art.sc.graves", "Retrata o canto quieto onde esta fortaleza deita os seus mortos.")
    default: return LF("art.sc.founding", "Traz a imagem da fundação de {0}.", who || w.name)
  }
}
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
  // What they cannot stop thinking about. Decided when the mood strikes, not
  // when the work finishes, so the thing they make is about the thing that set
  // them off — even if the fortress has moved on by the time it is done.
  u.moodAbout = inspiration(w, u)
  setJob(w, u, { k: "mood", i: -1, stage: "claim", want: want, prog: 0, since: w.tick })
  announce(w, LF("msg.mood.struck", "{0} foi tomado por um humor estranho!", u.name), 1)
}
function strangeMoodWork(w, u) {
  var j = u.job
  if (j.stage === "claim") {
    var shop = findBuilding(w, B_WORKSHOP, u.i)
    if (shop < 0) {
      if (w.tick - j.since > DAY * 2) { announce(w, LF("msg.mood.noshop", "{0} não encontrou uma oficina e mergulhou na melancolia.", u.name), 2); u.mood_state = "melancholy"; dropJob(w, u) }
      return
    }
    if (!go(w, u, function (c) { return c === shop }, shop)) { if (w.tick - j.since > DAY * 2) { u.mood_state = "melancholy"; dropJob(w, u) } return }
    j.i = shop; j.stage = "goclaim"; return
  }
  if (j.stage === "goclaim") {
    w.claim[j.i] = u.id
    announce(w, LF("msg.mood.claimed", "{0} reivindicou a oficina e resmunga sobre '{1}'.", u.name, itemName(j.want)), 1)
    j.stage = "fetch"; j.since = w.tick; return
  }
  if (j.stage === "fetch") {
    if (u.carry) { j.stage = "back"; if (!go(w, u, function (c) { return c === j.i }, j.i)) j.stage = "fetch"; return }
    var it = freeItem(w, j.want, u.i, u)
    if (it && go(w, u, function (c) { return c === it.i }, it.i)) { it.res = u.id; j.item = it.id; j.stage = "pick"; return }
    if (w.tick - j.since > DAY * 3) {
      w.claim[j.i] = 0
      if (chance(w, 0.5)) { announce(w, LF("msg.mood.berserk", "{0} enlouqueceu! Correu berrando pela fortaleza.", u.name), 2); u.mood_state = "berserk" }
      else { announce(w, LF("msg.mood.fell", "{0} caiu em melancolia sem seu {1}.", u.name, itemName(j.want)), 2); u.mood_state = "melancholy" }
      legend(w, LF("lg.mood.lost", "{0} perdeu a razão num humor estranho.", u.name))
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
    announce(w, LF("msg.mood.working", "{0} trabalha furiosamente na oficina.", u.name), 0)
    return
  }
  if (j.stage === "work") {
    j.prog++
    if (j.prog >= DAY) {
      consumeCarried(w, u)
      var nm = artifactName(w, j.want, u.moodAbout).split("|")
      var art = addItem(w, "artifact", j.i); art.name = nm[0]; art.title = nm[1]; art.desc = nm[2]; art.maker = u.name
      w.artifacts.push({ name: nm[0], title: nm[1], desc: nm[2], maker: u.name, t: w.tick, about: u.moodAbout || null })
      u.moodAbout = null
      w.stats.artifacts++
      u.skills.craft = Math.max(u.skills.craft, 12)
      u.mood_state = ""; thought(w, u, L("th.artifact", "criou um artefato lendário"), 25)
      w.claim[j.i] = 0
      announce(w, LF("msg.artifact", "{0} criou {1}, '{2}', {3}", u.name, nm[0], nm[1], nm[2]), 1)
      legend(w, LF("lg.artifact", "{0} criou o artefato {1}, '{2}'.", u.name, nm[0], nm[1]))
      dropJob(w, u)
    }
  }
}

// ---- livestock --------------------------------------------------------------
// The hold had deer to hunt and nothing to keep. A pen and a couple of goats
// give the kitchen something that is not the farm, and a cat gives somebody
// something to lose — the grief system already exists, and an animal is the
// cheapest thing in the game that can be loved.
function penSpot(w) {
  var pens = cache(w).pens
  if (!pens.length) return -1
  return pens[ri(w, pens.length)]
}
function livestock(w) {
  var n = 0
  for (var k = 0; k < w.units.length; k++) if (w.units[k].k === "goat" || w.units[k].k === "cat") n++
  return n
}
// Goats eat, and what they give is milk the kitchen can cook. A pen with grass
// or moss under it feeds them; one cut into bare stone does not.
function penTick(w, d) {
  var pens = cache(w).pens
  if (!pens.length) return
  var beasts = livestock(w)
  // a caravan season brings stock to a hold that has somewhere to put it
  if (beasts < pens.length * PEN_MAX && w.caravan && w.caravan.stage === "trade" && chance(w, 0.5)) {
    var sp = penSpot(w)
    if (sp >= 0) {
      var kind = chance(w, 0.75) ? "goat" : "cat"
      var a = addUnit(w, kind, nearFree(w, sp, 1))
      a.name = pick(w, tbl("BEAST", BEAST_NAMES))
      a.home = sp
      announce(w, LF("msg.beast.came", "Os mercadores trouxeram {0}, {1}.", beastName(kind), a.name), 1)
    }
  }
  // milk, from goats standing on something that grows
  var milked = 0
  for (var q = 0; q < w.units.length; q++) {
    var g = w.units[q]
    if (g.k !== "goat") continue
    var fl = w.floor[g.i]
    if (fl !== F_GRASS && fl !== F_MOSS) continue
    if (!chance(w, 0.5)) continue
    addItem(w, "food", nearFree(w, g.home >= 0 ? g.home : g.i, 2))
    milked++
  }
  if (milked) w.stats.milked = (w.stats.milked || 0) + milked
}
function beastName(kind) { return L("unit." + kind, kind === "goat" ? "cabra" : "gato") }
// Animals wander near their pen; a cat wanders wherever it likes and turns up
// next to whoever is standing still, which is how it gets adopted.
function actBeast(w, u) {
  // Once every four ticks, staggered by id. A goat does not need to decide
  // anything sixty times a minute, and every draw an animal makes shifts the
  // whole rng stream — with them deciding every tick the hold lost two dwarves
  // per fortress to nothing but rerolled combat.
  if ((w.tick & 3) !== (u.id & 3)) return
  if (u.wait > 0) { u.wait--; return }
  u.wait = 6 + ri(w, 14)
  if (u.k === "cat") {
    var ds = dwarves(w)
    if (ds.length && chance(w, 0.5)) {
      var who = ds[ri(w, ds.length)]
      if (go(w, u, function (c) { return adjacent(c, who.i) }, who.i, 900)) {
        // being followed around by a cat is one of the few unearned good
        // things that happen in this game
        if (adjacent(u.i, who.i) && chance(w, 0.25)) {
          thought(w, who, LF("th.cat", "foi seguido por {0} a manhã toda", u.name), 3)
          if (!u.owner) { u.owner = who.id; announce(w, LF("msg.cat.adopt", "{0} adotou {1}.", who.name, u.name), 0) }
        }
        step(w, u)
        return
      }
    }
  }
  var home = (typeof u.home === "number" && u.home >= 0) ? u.home : w.depot
  if (dist(u.i, home) > 6) { if (go(w, u, function (c) { return c === home }, home, 900)) step(w, u); return }
  var n = neighbors(w, u.i, u, nb)
  if (n > 0 && chance(w, 0.6)) u.i = nb[ri(w, n)]
}
// A death in the pen lands on whoever kept it.
function beastDied(w, u, how) {
  var nm = u.name || beastName(u.k)
  announce(w, LF("msg.beast.died", "{0} morreu.", nm), 1)
  var ds = dwarves(w)
  for (var k = 0; k < ds.length; k++) {
    var o = ds[k]
    if (u.owner === o.id) { thought(w, o, LF("th.beast.mine", "perdeu {0}", nm), -8); o.grief = (o.grief || 0) + 1 }
    else if (dist(o.i, u.i) < 8) thought(w, o, LF("th.beast.lost", "perdeu {0}, da fortaleza", nm), -2)
  }
  if (u.owner) legend(w, LF("lg.beast", "{0}, da fortaleza, morreu no ano {1}.", nm, date(w).year))
}

// ---- wounds -----------------------------------------------------------------
function wounded(u) { return u.k === "dwarf" && u.hp <= Math.ceil(u.maxhp * WOUND_AT) }
// Work done by someone who should be lying down.
function woundMul(u) { return wounded(u) ? 0.5 : 1 }
// A free hospital bed, and whether anybody is in it.
function hospitalFor(w, u) {
  var beds = cache(w).hospital
  for (var k = 0; k < beds.length; k++) {
    var b = beds[k]
    if (w.claim[b] && w.claim[b] !== u.id) continue
    return b
  }
  return -1
}
// Going to lie down. A wounded dwarf does this instead of working, which is
// the whole cost of the wound: the hold is short a pair of hands until
// somebody has tended them.
function branchRest(w, u) {
  if (!wounded(u) || u.hp >= u.maxhp) return false
  if (u.job && u.job.k === "rest") return false
  var bed = hospitalFor(w, u)
  if (bed < 0) return false
  if (dist(u.i, bed) > 1 && !go(w, u, function (q) { return q === bed }, bed, 2000)) return false
  setJob(w, u, { k: "rest", i: bed, claims: true, prog: 0 })
  return true
}
// Tending someone who is lying there. Anybody can do it; it goes faster for
// whoever has the hands for it.
function branchTend(w, u) {
  var beds = cache(w).hospital
  if (!beds.length) return false
  for (var k = 0; k < beds.length; k++) {
    var b = beds[k], p = unitAt(w, b)
    if (!p || p === u || p.k !== "dwarf" || !wounded(p) || p.tended > w.tick) continue
    if (!go(w, u, function (q) { return q === b || adjacent(q, b) }, b, 1500)) continue
    setJob(w, u, { k: "tend", i: b, who: p.id, prog: 0 })
    return true
  }
  return false
}

// ---- traps ------------------------------------------------------------------
// The one defence the player builds rather than mans. Spikes under the floor,
// a bar of metal each: they fire on whatever hostile steps on them and bend
// doing it, so three foes is the life of one trap. That makes a corridor of
// traps a real cost rather than a permanent wall, and it is the answer to a
// hold whose militia is four dwarves against a wave of nine.
//
// Charges live in `w.grow`, which is per-cell, already saved, and only ever
// read for farms — so a trap needs no new array.
function trapCharges(w, i) { return w.build[i] === B_TRAP ? w.grow[i] : 0 }
function armTrap(w, i) { if (w.build[i] === B_TRAP) { w.grow[i] = TRAP_CHARGES; w.dirty = true } }
function trapFires(w, u) {
  var i = u.i
  if (w.build[i] !== B_TRAP) return false
  // A trap built before charges existed, or one loaded from an old save, gets
  // a full set the first time something walks onto it.
  if (!w.grow[i]) w.grow[i] = TRAP_CHARGES
  var dmg = 3 + ri(w, 4)
  u.hp -= dmg
  w.grow[i]--
  w.stats.trapped = (w.stats.trapped || 0) + 1
  if (u.hp <= 0) {
    announce(w, LF("msg.trap.killed", "{0} morreu numa armadilha.", foeName(u, true)), 1)
    w.stats.goblinsKilled = (w.stats.goblinsKilled || 0) + 1
    removeUnit(w, u)
  } else announce(w, LF("msg.trap.hit", "Uma armadilha acertou {0}.", foeName(u)), 0)
  if (w.grow[i] <= 0) {
    removeBuilding(w, i, false)
    // The hold re-lays its own spikes. A corridor of traps that empties out
    // over one siege and stays empty is a decoration, and asking the player to
    // re-place each one by hand is the labour screen this game does without.
    // Never on the last bar, though: the militia's axes come first.
    if (countItems(w, "bar") >= 2 && designate(w, i, "build", B_TRAP))
      announce(w, L("msg.trap.relay", "Uma armadilha se desmontou; os anões vão refazê-la."), 0)
    else announce(w, L("msg.trap.spent", "Uma armadilha se desmontou depois do terceiro golpe."), 0)
  }
  return true
}

// ---- moods & tantrums -------------------------------------------------------
function moodTick(w, u) {
  // drift toward a baseline the trait sets
  var base = u.trait === "alegre" ? 58 : u.trait === "melancólico" ? 42 : u.trait === "rabugento" ? 46 : 50
  if (w.tick % 12 === 0) u.mood += u.mood > base ? -1 : 1
  if (u.hunger > 90 && w.tick % 25 === 0) thought(w, u, L("th.starving", "está faminto"), -3)
  if (u.thirst > 90 && w.tick % 25 === 0) thought(w, u, L("th.parched", "está morrendo de sede"), -3)
  if (u.sleep > 95 && w.tick % 25 === 0) thought(w, u, L("th.exhausted", "está exausto"), -2)
  // A companion left lying where they fell weighs on whoever walks past
  if (w.tick % 60 === 0 && countItems(w, "remains") > 0) {
    for (var rq = 0; rq < w.items.length; rq++) {
      var ri2 = w.items[rq]
      if (ri2.t !== "remains" || ri2.by) continue
      if (dist(ri2.i, u.i) > 5) continue
      thought(w, u, L("th.unburied", "passou pelos restos de um companheiro sem sepultura"), u.trait === "melancólico" ? -6 : -4)
      break
    }
  }
  // Grief weighs every day it goes unattended, and fades slowly on its own for
  // a hold with nowhere to bury anyone — slowly enough that the graveyard is
  // worth digging.
  if (u.grief > 0) {
    if (w.tick % 90 === 0) u.mood = Math.max(0, u.mood - 2)
    if (w.tick % (DAY * 3) === 0) u.grief--
  }
  if (u.mood_state === "melancholy") {
    if (w.tick % 30 === 0) u.mood = Math.max(0, u.mood - 1)
    if (chance(w, 0.0004)) die(w, u, L("death.melancholy", "definhou de melancolia"))
    return
  }
  if (u.mood_state === "berserk") {
    if (chance(w, 0.003)) die(w, u, L("death.berserk", "morreu de exaustão em fúria"))
    return
  }
  if (u.mood_state === "strange") return
  if (u.mood <= 12 && chance(w, 0.01)) tantrum(w, u)
  if (u.mood <= 3 && chance(w, 0.002)) { u.mood_state = "melancholy"; announce(w, LF("msg.melancholy", "{0} afundou na melancolia.", u.name), 2); dropJob(w, u) }
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
    victim.hp -= 2; thought(w, victim, LF("th.struck", "foi agredido por {0}", first(u.name)), -8)
    shiftBond(w, u, victim, -14)
    announce(w, LF("msg.tantrum.hit", "{0} teve um acesso de fúria e agrediu {1}!", u.name, victim.name), 2)
    if (victim.hp <= 0) die(w, victim, LF("death.tantrum", "foi morto por {0} num acesso de fúria", u.name))
  } else if (targets.length > 0) {
    var c2 = pick(w, targets); var nm = BUILD_INFO[w.build[c2]].name
    removeBuilding(w, c2, false)
    announce(w, LF("msg.tantrum.broke", "{0} teve um acesso de fúria e destruiu uma {1}!", u.name, nm), 2)
  } else announce(w, LF("msg.tantrum", "{0} teve um acesso de fúria!", u.name), 2)
  // witnesses
  for (var k2 = 0; k2 < w.units.length; k2++) { var o2 = w.units[k2]; if (o2 !== u && o2.k === "dwarf" && dist(o2.i, u.i) <= 6) thought(w, o2, L("th.witnessed", "presenciou um acesso de fúria"), -3) }
}

// ---- death ------------------------------------------------------------------
function die(w, u, how) {
  if (u.k === "dwarf") {
    announce(w, LF("msg.died", "{0} {1}.", u.name, how), 2)
    legend(w, LF("lg.died", "{0}, {1}, {2}.", u.name, skillTitle(u), how))
    w.dead.push({ name: u.name, t: w.tick, how: how })
    if (w.dead.length > 200) w.dead.splice(0, w.dead.length - 200)
    w.stats.deaths++
    if (w.raid) w.raid.lost++
    // A hold with a burial ground grieves a little lighter: they know where
    // this one is going. The consolation of a grave you can visit almost never
    // fired on its own, because a graveyard is by definition somewhere nobody
    // walks past - so it lands here, where the loss does.
    var rest = w.graveyard >= 0 && cache(w).graves.length > 0
    for (var k = 0; k < w.units.length; k++) {
      var o = w.units[k]
      if (o === u || o.k !== "dwarf") continue
      var tie = bondTotal(o, u.id), kin = isKin(o, u.id)
      // Somebody they could not stand. The hold is smaller either way and they
      // know what that means, so it still costs something — just not grief.
      if (tie <= BOND_RIVAL) { thought(w, o, LF("th.lost.rival", "não vai chorar por {0}", first(u.name)), -1); continue }
      if (kin || tie >= BOND_FRIEND) {
        // remembered by name, which is what a strange mood reaches for later
        if (kin) o.lostKin = u.name; else o.lostFriend = u.name
        var deep = Math.round((kin ? 16 : 12) * (o.trait === "melancólico" ? 1.4 : 1))
        thought(w, o, kin ? LF("th.lost.kin", "perdeu {0}, do seu próprio sangue", first(u.name))
                          : LF("th.lost.friend", "perdeu {0}, o seu amigo", first(u.name)), -deep)
        // grief is not a mood: it is something they have to go and do
        o.grief = (o.grief || 0) + (kin ? 3 : 2)
        legend(w, kin ? LF("lg.lost.kin", "{0} perdeu {1}, do seu próprio sangue, no ano {2}.", o.name, u.name, date(w).year)
                      : LF("lg.lost.friend", "{0} perdeu o amigo {1} no ano {2}.", o.name, u.name, date(w).year))
        continue
      }
      if (rest) thought(w, o, LF("th.lost.grave", "perdeu {0}, mas terá sepultura", first(u.name)), o.trait === "melancólico" ? -9 : -5)
      else thought(w, o, LF("th.lost", "perdeu {0}", first(u.name)), o.trait === "melancólico" ? -12 : -7)
    }
    if (w.tile[u.i] === T_OPEN) {
      addItem(w, "remains", u.i)
      if (u.weapon) {
        var wp = addItem(w, "weapon", u.i, u.weaponQ || 1)
        // the name stays with the weapon, not with whoever was holding it
        if (u.wnm) { wp.nm = u.wnm; wp.title = u.wtitle || "" }
      }
      if (u.armor) addItem(w, "armor", u.i, u.armorQ || 1)
      if (u.tool) addItem(w, u.tool, u.i, u.toolQ || 1)
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
function hostile(u) { return u.k === "goblin" || u.k === "wolf" || u.k === "crawler" || u.k === "sentinel" || (u.k === "dwarf" && u.mood_state === "berserk") }
function nearestUnit(w, from, pred, maxd) {
  var best = null, bd = maxd || 1e9
  for (var k = 0; k < w.units.length; k++) { var o = w.units[k]; if (!pred(o)) continue; var d = dist(o.i, from); if (d < bd) { bd = d; best = o } }
  return best
}
// One name for whatever is doing the killing, so a new creature does not have
// to be threaded through three separate ternaries.
function foeName(u, cap) {
  var k = u.k
  if (k === "dwarf") return u.name || k
  var key = "foe." + k + (cap ? ".cap" : "")
  var fall = { goblin: "um goblin", wolf: "um lobo", crawler: "um rastejante", sentinel: "uma sentinela das profundezas" }[k]
  if (!fall) return cap ? LF("foe.other.cap", "Um {0}", k) : L("foe.enemy", "um inimigo")
  return L(key, cap ? fall.charAt(0).toUpperCase() + fall.slice(1) : fall)
}
function attack(w, a, b) {
  var as = a.k === "dwarf" ? a.skills.fight + (a.weapon ? 3 + ((a.weaponQ || 1) - 1) : 0) + (a.trait === "valente" ? 1 : 0) : (a.k === "goblin" ? 1 + (a.elite ? 2 : 0) : a.k === "wolf" ? 2 : a.k === "crawler" ? 2 : a.k === "sentinel" ? 7 : 1)
  var ds = b.k === "dwarf" ? b.skills.fight + (b.weapon ? 1 : 0) + (b.armor ? 1 : 0) : 2
  if (chance(w, Math.max(0.15, Math.min(0.9, 0.5 + 0.06 * (as - ds))))) {
    var dmg = 1 + ri(w, 3) + (a.weapon ? (a.weaponQ || 1) : 0) + (a.elite ? 1 : 0) + (a.k === "sentinel" ? 2 : 0), tookHit = false
    if (b.k === "dwarf" && b.armor) { dmg = Math.max(0, dmg - (b.armorQ || 1) - (chance(w, 0.4) ? 1 : 0)); tookHit = true }
    b.hp -= dmg
    if ((b.k === "goblin" || b.k === "crawler" || b.k === "sentinel") && b.hp <= 0) w.stats.goblinsKilled = (w.stats.goblinsKilled || 0) + 1
    if (a.k === "dwarf") gainSkill(w, a, "fight", 1)
    if (b.hp <= 0) {
      if (a.k === "dwarf") { a.kills++; thought(w, a, LF("th.killed", "matou {0} em combate", foeName(b)), 6) }
      if (b.k === "dwarf") die(w, b, LF("death.killedby", "foi morto por {0}", foeName(a)))
      else {
        announce(w, LF("msg.foe.killed", "{0} foi morto{1}.", foeName(b, true), a.k === "dwarf" ? LF("msg.foe.killed.by", " por {0}", a.name) : ""), 1)
        if (b.bears) dropRelic(w, b)
        removeUnit(w, b)
      }
    } else if (tookHit) wearOut(w, b, "armor")
    if (a.k === "dwarf" && a.weapon) wearOut(w, a, "weapon")
  }
}
function fightOrFlee(w, u) {
  var foe = nearestUnit(w, u.i, function (o) { return o !== u && hostile(o) }, 9)
  if (!foe) return false
  // A posted guard defends their post, not the whole map: chasing a wolf six
  // levels up is how the gate ends up empty when the wave arrives.
  if (u.militia && u.post >= 0 && w.build[u.post] === B_POST && dist(foe.i, u.post) > POST_REACH) return false
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
  // what came up from the deep has nowhere to go home to, so it does not give
  // up and walk off the edge the way a raiding party does
  var fromBelow = u.k === "crawler" || u.k === "sentinel"
  var target = nearestUnit(w, u.i, function (o) { return o.k === "dwarf" || o.k === "merchant" }, 1e9)
  if (!target) { if (!fromBelow) leaveMap(w, u); return }
  if (adjacent(u.i, target.i) || u.i === target.i) { if (u.cool <= 0) { attack(w, u, target); u.cool = 2 } return }
  if (!u.path || (w.tick + u.id) % 15 === 0) {
    // straight for the nearest dwarf; failing that, for the gate (the wagon
    // spot / stair top) and try again from inside
    if (!go(w, u, function (c) { return adjacent(c, target.i) }, target.i, 4000)
        && !(u.i !== w.depot && dist(u.i, w.depot) > 1 && go(w, u, function (c) { return c === w.depot || adjacent(c, w.depot) }, w.depot, 4000))) {
      // can't reach anyone: mill around; give up after a while
      u.wait++
      if (!fromBelow && u.wait > DAY * SIEGE_DAYS) { leaveMap(w, u); return }
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
  if (seen && !u.spotted) { u.spotted = true; announce(w, LF("msg.kobold.seen", "Um kobold ladrão foi visto por {0}!", seen.name), 1); leaveMap(w, u); return }
  if (u.spotted) { leaveMap(w, u); return }
  if (!u.path) {
    var best = null, bd = 1e9
    for (var k = 0; k < w.items.length; k++) { var it = w.items[k]; if (it.by || it.t === "remains") continue; var d = dist(it.i, u.i); if (d < bd && (onStockpile(w, it) || it.t === "gem" || it.t === "craft")) { bd = d; best = it } }
    if (!best || !go(w, u, function (c) { return c === best.i }, best.i, 2000)) { leaveMap(w, u); return }
    u.target = best.id
  }
  if (step(w, u) === 1) {
    var it2 = itemById(w, u.target)
    if (it2 && it2.i === u.i && !it2.by) { pickUp(w, u, it2); announce(w, LF("msg.kobold.stole", "Um kobold roubou {0}!", itemName(it2.t)), 1) }
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
  announce(w, LF("season.came", "Chegou {0}.", (name === "primavera" ? "a " : "o ") + seasonName(name)), 0)
  w.weather = name === "inverno" ? 2 : 0
  if (w.fallen) return
  // migrants, on wealth alone and deliberately so. Gating them on spare beds
  // and spare food was tried and reverted: migrants are the hold's only way of
  // replacing a loss, so conditioning them turns any bad season into a spiral
  // — 16 seeds over 4 years went from 8.8 dwarves and 7 falls to 5.2 and 9.
  // The realism is not worth a game that cannot recover from one raid.
  if (name !== "inverno" && w.tick > YEAR / 8) {
    var p = pop(w)
    if (p < w.popCap) {
      var n = 1 + ri(w, Math.min(4, 1 + Math.floor(w.wealth / 250)))
      n = Math.min(n, w.popCap - p)
      var sp = edgeSurface(w); if (sp < 0) sp = w.depot
      if (n > 0) {
        for (var k = 0; k < n; k++) addDwarf(w, nearFree(w, sp, 2))
        w.stats.migrants += n
        announce(w, n === 1 ? L("msg.migrant.one", "Um migrante chegou.") : LF("msg.migrant.many", "{0} migrantes chegaram.", n), 1)
        legend(w, LF("lg.migrants", "{0} {1} do ano {2}.", LP(n, "n.migrant.one", "n.migrant.many", "migrante", "migrantes"), seasonIn(name), d.year))
      }
    } else if (p >= w.popCap && chance(w, 0.5)) announce(w, L("msg.migrant.turned", "Migrantes deram meia-volta: a fortaleza está cheia."), 0)
  }
  // wolves in winter
  if (!w.peaceful && name === "inverno" && w.tick > YEAR / 2 && chance(w, 0.35)) {
    var ws = edgeSurface(w); if (ws >= 0) { var nw = 1; for (var q = 0; q < nw; q++) addUnit(w, "wolf", nearFree(w, ws, 1)); announce(w, L("msg.wolves", "Lobos rondam a superfície."), 1) }
  }
}
// The best fighters form the militia: a third of the hold, never fewer than
// two once there are four dwarves. They pick up weapons and armor and train
// when idle; everyone else keeps to their trade and runs from trouble.
function rosterMilitia(w) {
  var ds = dwarves(w)
  if (ds.length < 3) { for (var q = 0; q < ds.length; q++) { ds[q].militia = false; ds[q].post = -1 } return }
  // A preset that asked for six in the militia got four back the next morning,
  // because the roster recomputed a third of the population and forgot what it
  // had been told. The scenario's number is kept and honoured, capped by how
  // many dwarves are actually left.
  var want = Math.max(ds.length >= 4 ? 2 : 1, Math.ceil(ds.length / 3))
  if (typeof w.militiaWant === "number" && w.militiaWant > 0) want = Math.min(ds.length, w.militiaWant)
  ds.sort(function (a, b) { return (b.skills.fight + (b.weapon ? 2 : 0) + (b.armor ? 1 : 0) + (b.trait === "valente" ? 1 : 0)) - (a.skills.fight + (a.weapon ? 2 : 0) + (a.armor ? 1 : 0) + (a.trait === "valente" ? 1 : 0)) })
  for (var k = 0; k < ds.length; k++) ds[k].militia = k < want
  assignPosts(w)
}
// The militia had no orders: every guard reacted to whatever came within nine
// cells of wherever they happened to be, so the hold's defence was wherever
// its soldiers were standing when the wave arrived — and once things started
// coming up from the deep, that was almost never the right place.
//
// A guard post is a building, which makes "hold here" an order the player
// gives with the tools they already have, and the squads sort themselves out:
// every post gets its share of the militia, nearest first. No post and nothing
// changes — the militia works and reacts, the way it always did.
function assignPosts(w) {
  var posts = cache(w).posts, ds = dwarves(w)
  var guards = []
  for (var k = 0; k < ds.length; k++) { if (ds[k].militia) guards.push(ds[k]); else ds[k].post = -1 }
  if (!posts.length || !guards.length) { for (var q = 0; q < guards.length; q++) guards[q].post = -1; return }
  // each guard to their nearest post, then even the squads out so one post is
  // not held by five dwarves while another stands empty
  var per = Math.max(1, Math.ceil(guards.length / posts.length)), load = {}
  guards.sort(function (a, b) { return dist(a.i, nearestOf(posts, a.i)) - dist(b.i, nearestOf(posts, b.i)) })
  for (var g = 0; g < guards.length; g++) {
    var best = -1, bd = 1e9
    for (var pq = 0; pq < posts.length; pq++) {
      var pi = posts[pq]
      if ((load[pi] || 0) >= per) continue
      var d = dist(guards[g].i, pi)
      if (d < bd) { bd = d; best = pi }
    }
    if (best < 0) best = nearestOf(posts, guards[g].i)
    // Newly posted: drop whatever work they were in the middle of. Without
    // this they finished the haul first, which on a two-day watch meant a
    // tenth of the guard's time was spent wherever the job was.
    if (guards[g].post !== best && guards[g].job && guards[g].job.k !== "sleep" && guards[g].job.k !== "eat" && guards[g].job.k !== "drink" && guards[g].job.k !== "drinkwater") dropJob(w, guards[g])
    guards[g].post = best
    load[best] = (load[best] || 0) + 1
  }
}
// Standing the watch. A guard with a post who is not at it walks back to it,
// and that is the whole job — the point is being in the right place when
// something arrives, not doing anything there.
function branchStation(w, u) {
  if (!u.militia || !(u.post >= 0)) return false
  if (w.build[u.post] !== B_POST) { u.post = -1; return false }
  if (dist(u.i, u.post) <= 2) return false        // already holding it
  if (!go(w, u, function (q) { return q === u.post || adjacent(q, u.post) }, u.post, 2000)) { u.post = -1; return false }
  setJob(w, u, { k: "station", i: u.post })
  return true
}
// Scenario upkeep: when the ore runs out, designate the nearest vein with an
// L-shaped tunnel from the closest open cell on that level; when logs run low,
// mark trees near the gate for felling. The hold keeps mining and cutting
// without anyone giving orders, which is what makes the loops watchable.
function prospect(w) {
  var c = cache(w), pending = 0
  for (var q = 0; q < c.desigs.length; q++) if (w.desig[c.desigs[q]] === DG_DIG) pending++
  // Keep enough metal on hand to replace what wear breaks. The old test asked
  // for `ore < 3` and refused to mark anything while a single cell was still
  // designated, so the mine ran in tiny bursts: 202 cells dug in three years
  // with 341 veins left in the rock, and the forge starved at five bars.
  var wantOre = Math.max(6, pop(w))
  if (pending < 8 && countItems(w, "ore") + countItems(w, "bar") < wantOre) {
    // Every ore and gem cell on the mine level, nearest first. Taking the
    // single nearest cell picked a lone nugget over and over - the seams on
    // this level run 23, 12 and 11 cells wide - so walk the candidates and
    // keep the first seam worth a tunnel.
    var cz = iz(w.depot), bx = ix(w.depot), by = iy(w.depot), cand = []
    for (var z = Math.max(2, cz - 4); z <= cz - 3; z++) for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = idx(x, y, z), t = w.tile[i]
      if (t !== T_ORE && t !== T_GEM) continue
      cand.push([Math.abs(x - bx) + Math.abs(y - by), i])
    }
    cand.sort(function (a, b) { return a[0] - b[0] })
    var tried = {}, seam = null
    for (var ci = 0; ci < cand.length && !seam; ci++) {
      var head = cand[ci][1]
      if (tried[head]) continue
      var stack = [head], seen = {}, cells = []
      seen[head] = true
      while (stack.length && cells.length < 24) {
        var si = stack.pop()
        tried[si] = true
        if (canDesignate(w, si, "dig")) cells.push(si)
        var sxq = ix(si), syq = iy(si), nbs = []
        if (sxq > 0) nbs.push(si - 1); if (sxq < W - 1) nbs.push(si + 1)
        if (syq > 0) nbs.push(si - W); if (syq < H - 1) nbs.push(si + W)
        for (var nq = 0; nq < nbs.length; nq++) {
          var ni = nbs[nq]
          if (seen[ni] || (w.tile[ni] !== T_ORE && w.tile[ni] !== T_GEM)) continue
          seen[ni] = true; stack.push(ni)
        }
      }
      // a nugget will do only if nothing better is left on the level
      if (cells.length >= 4 || ci === cand.length - 1) seam = cells
    }
    if (seam && seam.length) {
      var vz = iz(seam[0]), vx = ix(seam[0]), vy = iy(seam[0]), ox = -1, oy = -1, od = 1e9
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) { var oi = idx(xx, yy, vz); if (!passable(w, oi)) continue; var dd = Math.abs(xx - vx) + Math.abs(yy - vy); if (dd < od) { od = dd; ox = xx; oy = yy } }
      if (ox >= 0) {
        for (var mq = 0; mq < seam.length; mq++) designate(w, seam[mq], "dig")
        var sx = ox < vx ? 1 : -1, sy = oy < vy ? 1 : -1, px, py
        for (px = ox; px !== vx; px += sx) { var ti = idx(px, oy, vz); if (canDesignate(w, ti, "dig")) designate(w, ti, "dig") }
        for (py = oy; py !== vy; py += sy) { var tj = idx(vx, py, vz); if (canDesignate(w, tj, "dig")) designate(w, tj, "dig") }
        if (seam.length >= 4) announce(w, LF("msg.prospect", "Prospecção: um veio de {0} foi marcado para escavação.", LP(seam.length, "n.cell.one", "n.cell.many", "célula", "células")), 0)
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
      if (trees.length) announce(w, LF("msg.woodcutters", "Lenhadores: {0} árvores marcadas perto do portão.", Math.min(6, trees.length)), 0)
    }
  }
}
// Raw food rots in the larder; prepared meals keep. This is the drain that
// makes the larder settle around what the hold actually eats instead of
// climbing forever, and it is what finally makes a kitchen worth building.
// Reserved and carried items are left alone so no job loses its item midway.
function spoilFood(w) {
  // Only what sits around spoils. A hold living hand to mouth keeps every
  // scrap: eating the survival reserve did not make the game tense, it made
  // every hungry dwarf run a 7000-node search for shrubs and the tick four
  // times slower. The rot is here to stop the larder hoarding, nothing else.
  // The larder holds what the fields aim for; only what piles up beyond that
  // rots. A floor of three per dwarf looked safe and was not: the classic
  // embark farms so close to the bone that losing a fifth of the harvest
  // starved the still, and a hold with no beer sinks to a mood of 31 and
  // tantrums itself to death. Never take from the chain, only from the hoard.
  var raw = countItems(w, "food"), keep = pop(w) * FOOD_PER_DWARF
  if (raw <= keep) return
  var excess = raw - keep, lost = 0
  for (var k = w.items.length - 1; k >= 0 && lost < excess; k--) {
    var it = w.items[k]
    if (it.t !== "food" || it.by || it.res) continue
    if (chance(w, SPOIL_PER_DAY)) { it.gone = true; w.items.splice(k, 1); lost++ }
  }
  if (lost) {
    w.stats.spoiled += lost
    if (lost >= 3) announce(w, LF("msg.spoiled", "{0} na despensa.", LP(lost, "n.spoiled.one", "n.spoiled.many", "item de comida estragou", "itens de comida estragaram")), 0)
  }
}
// Tools, weapons and armor wear out with use and finally break. Without this
// the forge satisfied every dwarf once in the first year and then had nothing
// left to make: smelting and forging fell to 1.4% of the hold's time and the
// mine stopped mattering. A broken pick is a reason to dig again.
function wearOut(w, u, slot) {
  // A relic does not wear out. Anything else and the best weapon in the world
  // would be gone in sixty swings, which turns the deepest thing in the game
  // into a consumable.
  if (slot === "weapon" && u.wnm) return
  var key = slot === "pick" || slot === "axe" ? "wtool" : slot === "weapon" ? "wweapon" : "warmor"
  // a save from before wear, or a dwarf who started the game equipped, gets a
  // full life the first time the item is used
  if (typeof u[key] !== "number" || u[key] <= 0) u[key] = WEAR[slot]
  u[key]--
  if (u[key] > 0) return
  u[key] = 0
  if (slot === "weapon") u.weapon = false
  else if (slot === "armor") u.armor = false
  else u.tool = ""
  w.stats.broken++
  var what = slot === "armor" ? L("broke.armor", "a armadura") : slot === "weapon" ? L("broke.weapon", "a arma") : slot === "pick" ? L("broke.pick", "a picareta") : L("broke.axe", "o machado")
  thought(w, u, LF("th.broke", "quebrou {0}", what), -2)
  announce(w, LF("msg.broke", "{0} quebrou {1}.", u.name, what), 0)
}

// The last dwarf is dead. Losing is fun, but the world should stop pretending
// there is a fortress here: no more waves, caravans, thieves or migrants.
// ---- what the hold knows ----------------------------------------------------
// The map used to show everything: the caverns, the gem seams and the ore
// veins were all on screen before a single pick touched them, so digging was
// never exploration — you already knew where to go, and the only question was
// whether it was worth the walk.
//
// `w.seen` is one byte per cell: what the hold has actually laid eyes on. A
// cell becomes known when it is dug, when it is next to something dug (the
// wall you can see from inside a corridor), and when a dwarf walks near it.
//
// Three things are known from the start, because hiding them would be fog for
// its own sake: everything at or above the natural ground (you can see the
// sky, and the hillside you embarked on), everything already excavated (a
// ready hold knows its own rooms), and everything beside it.
function seenAt(w, i) {
  if (!w.seen) return true
  if (w.seen[i]) return true
  // at or above the surface there is nothing to discover
  return iz(i) >= w.ground[i % N]
}
function markSeen(w, i, r) {
  if (!w.seen) return
  var x = ix(i), y = iy(i), z = iz(i), rad = r || 1
  for (var dy = -rad; dy <= rad; dy++) for (var dx = -rad; dx <= rad; dx++) {
    var nx = x + dx, ny = y + dy
    if (!inb(nx, ny, z)) continue
    w.seen[idx(nx, ny, z)] = 1
  }
  // Nothing vertical. Marking the cell below — "you can see the floor under
  // your feet" — meant walking around on the surface revealed the entire layer
  // of rock beneath it: 40% of one level and 80% of another were on screen
  // before anyone dug, which is the upper level bleeding into the fog of the
  // one below. Standing in a room tells you nothing about what the rock above
  // or below you is made of.
}
// What the dwarves think is behind the wall in front of them, and it is
// sometimes wrong.
//
// Only asked of unexplored cells that touch something known — the rock face
// you are standing at, not the whole map — so a hunch is always about a wall
// somebody could put a pick to. It looks one cell past the face: a gem seam, a
// vein, or the moss of an open cavern.
//
// The result is decided by `hash(i)`, not by the dice, so it does not flicker
// between frames: the same wall gives the same feeling until it is dug. They
// notice what is there seven times in ten, and about one wall in twenty-five
// feels promising with nothing behind it at all. Being wrong is the point —
// a hunch that is never wrong is just the map with extra steps.
function hunch(w, i) {
  if (!w.seen || w.seen[i]) return 0
  var z = iz(i)
  if (z >= w.ground[i % N]) return 0
  if (!solid(w.tile[i])) return 0
  var x = ix(i), y = iy(i)
  // must be at the face of something known
  var atFace = false
  if (x > 0 && w.seen[i - 1]) atFace = true
  else if (x < W - 1 && w.seen[i + 1]) atFace = true
  else if (y > 0 && w.seen[i - W]) atFace = true
  else if (y < H - 1 && w.seen[i + W]) atFace = true
  else if (z < D - 1 && w.seen[i + N]) atFace = true
  if (!atFace) return 0
  // one cell past the face, in the four directions
  var worth = 0
  for (var d = 0; d < 4; d++) {
    var nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0), ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0)
    if (!inb(nx, ny, z)) continue
    var j = idx(nx, ny, z)
    var t = w.tile[j]
    if (t === T_GEM) { worth = 2; break }
    if (t === T_ORE) worth = Math.max(worth, 1)
    else if (t === T_OPEN && w.floor[j] !== F_NONE && !w.seen[j]) worth = Math.max(worth, 1)
  }
  var h = hash(i) % 100
  if (worth) return h < 70 ? worth : 0
  // 1 in 100, not 4: the false positive lands on every wall at the face, of
  // which there are many, while the true one lands on the few that have
  // something behind them. At 4% the hints were 56% wrong — noise, not a
  // hunch.
  return h < 1 ? 1 : 0
}

// Breaking into an open space shows you the space. A pick that comes through
// the wall of a cavern reveals the cavern — the floor you can see across and
// the walls around it — not one square with a staircase in it.
//
// Flood fill over open floor on that level, from the cell just dug, with a
// budget: a cavern can run the width of the map and a dwarf standing at one
// end cannot see the other. 240 cells is roughly a chamber you could take in
// at a glance, and more than any room a player digs on purpose.
function revealRoom(w, i) {
  if (!w.seen) return
  if (w.tile[i] !== T_OPEN || w.floor[i] === F_NONE) { markSeen(w, i); return }
  var stack = [i], seen = {}, budget = 240
  seen[i] = true
  while (stack.length && budget > 0) {
    var c = stack.pop()
    budget--
    markSeen(w, c)
    var x = ix(c), y = iy(c), z = iz(c)
    var nbs = []
    if (x > 0) nbs.push(c - 1)
    if (x < W - 1) nbs.push(c + 1)
    if (y > 0) nbs.push(c - W)
    if (y < H - 1) nbs.push(c + W)
    for (var k = 0; k < nbs.length; k++) {
      var j = nbs[k]
      if (seen[j]) continue
      seen[j] = true
      // walk on floor; walls get marked by markSeen and stop the fill
      if (w.tile[j] === T_OPEN && w.floor[j] !== F_NONE) stack.push(j)
    }
  }
}

// Everything the hold can be said to know on the day it starts.
// Bumped when the rule for what counts as known changes, so a save written
// under the old rule can be re-seeded instead of carrying the old mistake
// forever. Version 1 marked the cell below every visited one, which exposed
// the whole layer of rock under the surface.
var SEEN_V = 2
function seedSeen(w) {
  w.seen = new Uint8Array(NN)
  w.seenV = SEEN_V
  // the sky and the hillside: nothing to discover there
  for (var i = 0; i < NN; i++) if (iz(i) >= w.ground[i % N]) w.seen[i] = 1
  // and whatever the hold can already walk to, plus the walls around it.
  // Marking *every* open cell instead put 28 of 100 gem seams on screen at
  // embark, because the caverns on level 1 are generated open and enormous —
  // and a cavern nobody has reached is exactly the thing worth discovering.
  if (w.depot >= 0) {
    var reach = reachableFrom(w, [w.depot], null)
    for (var j = 0; j < NN; j++) if (reach[j]) markSeen(w, j)
  }
}

// ---- what sleeps below ------------------------------------------------------
// Digging down only ever paid: copper became iron became steel, the gems got
// better, and the magma milestone waited at the bottom. The only thing that
// could go wrong was a dwarf walking into the magma, so the deepest level a
// hold had reached said nothing about its risk — greed had no price.
//
// Now it does. Every level opened at or below the third has a chance of waking
// something asleep since before the hold, and the chance grows with the depth.
// What wakes comes up from that level, not from the gate, so locked doors and
// a militia posted at the entrance buy nothing: the hold is breached from
// underneath.
//
// Two things sleep down there. The caverns hold a lost race — crawlers, which
// come in numbers and are not individually dangerous. The last level before
// the magma holds a sentinel, one of them, which is.
var WAKE_FROM = 3          // this level and below can stir
function wakeChance(z) { return z <= 0 ? 0.85 : z === 1 ? 0.5 : z === 2 ? 0.25 : 0.1 }
// A pact holds the deep to its word; a refused tribute is remembered by
// everything down there, not only by the ones who asked.
function wakeOdds(w, z) { return w.pact ? 0 : wakeChance(z) * (w.grudge ? 2 : 1) }
// How deep the hold has *dug*, which is not the same as how deep open floor
// goes: the caverns on level 1 are generated open, so counting floor made
// every world start already at its deepest and nothing could ever wake. What
// matters is the level a dwarf's pick reached.
function digDepth(w) { return typeof w.deepest === "number" ? w.deepest : iz(w.depot) }
// The deepest rock sometimes gives up a tomb: an artifact older than the hold,
// buried with whoever it belonged to. It is the best thing depth can pay — and
// it never comes alone, because something was keeping it.
function maybeTomb(w, u, i) {
  var z = iz(i)
  if (w.tomb || z > 1 || !chance(w, 0.02)) return
  // `Math.max(1, …)`, because this doubles as the "already found" guard and a
  // tick of 0 is falsy: the tomb would be findable again forever
  w.tomb = Math.max(1, w.tick)
  var tombAbout = { k: "tomb" }
  var nm = artifactName(w, "gem", tombAbout).split("|")
  w.artifacts.push({ name: nm[0], title: nm[1], desc: nm[2], maker: L("king.maker", "um rei perdido"), t: w.tick, about: tombAbout })
  w.stats.artifacts++
  addItem(w, "artifact", i)
  announce(w, LF("msg.tomb", "Uma tumba! {0}, '{1}', jazia aqui com um rei esquecido.", nm[0], nm[1]), 2)
  legend(w, LF("lg.tomb", "A tumba de um rei perdido foi aberta no ano {0}: {1}, '{2}'.", date(w).year, nm[0], nm[1]))
  thought(w, u, L("th.tomb", "abriu a tumba de um rei perdido"), 8)
  if (!w.peaceful) {
    var g = deepSpot(w, z)
    if (g >= 0) {
      var guard = addUnit(w, "sentinel", g)
      guard.elite = true
      // The one weapon in the game that cannot be made: it is down here, in the
      // hands of whatever has been holding it since before the hold. Killing
      // the guard is the only way it changes hands, which is the whole point of
      // depth — the reward is not a better grade of the same thing, it is a
      // thing that exists once.
      var rn = artifactName(w, "metal").split("|")
      guard.bears = { nm: rn[0], title: rn[1], q: 5 }
      announce(w, LF("msg.tomb.guard", "O que guardava a tumba não gostou — e empunha {0}, {1}.", rn[0], rn[1]), 2)
      if (!w.raid) { w.raid = { since: w.tick, n: 1, wave: 0, lost: 0, deep: true }; w.stats.raids++ }
    }
  }
}
// Whatever it was carrying lies where it died, named, and the hold is told —
// the shaft that reached it is now the reason anyone here has this thing.
function dropRelic(w, u) {
  var r = u.bears
  u.bears = null
  var it = addItem(w, "weapon", u.i, r.q)
  it.nm = r.nm; it.title = r.title
  w.relic = { nm: r.nm, title: r.title, t: w.tick }
  announce(w, LF("msg.relic.dropped", "{0}, {1}, caiu onde o guardião tombou.", r.nm, r.title), 2)
  legend(w, LF("lg.relic", "{0}, {1}, foi arrancada das profundezas no ano {2}.", r.nm, r.title, date(w).year))
}
function maybeWake(w, z) {
  if (w.peaceful || z > WAKE_FROM) return
  if (!w.woke) w.woke = {}
  if (w.woke[z]) return
  w.woke[z] = w.tick
  if (!chance(w, wakeOdds(w, z))) {
    // Nothing woke — but the deepest levels are inhabited, and somebody down
    // there noticed the shaft. This is the only friendly thing depth does.
    if (z <= 1 && chance(w, 0.5) && courtArrive(w, z)) return
    announce(w, LF("msg.deep.quiet", "Nível {0} aberto. O silêncio aqui embaixo é diferente.", z), 1)
    return
  }
  w.stirred = (w.stirred || 0) + 1
  w.stats.stirred = (w.stats.stirred || 0) + 1
  announce(w, z <= 0 ? L("msg.deep.magma", "Algo se move no calor. A fortaleza cavou fundo demais.")
                     : LF("msg.deep.wake", "Algo desperta no nível {0}, adormecido desde antes desta fortaleza.", z), 2)
  legend(w, LF("lg.deep.wake", "Algo despertou no nível {0}, no ano {1}.", z, date(w).year))
  spawnDeep(w, z)
}
// What comes up, sized by the depth it woke at and by how much has already
// been stirred: a hold that keeps digging keeps paying.
function spawnDeep(w, z) {
  var spot = deepSpot(w, z)
  if (spot < 0) return false
  var extra = Math.min(3, (w.stirred || 1) - 1)
  if (z <= 0) {
    var s1 = addUnit(w, "sentinel", spot)
    s1.elite = true
    for (var e = 0; e < extra; e++) { var sp2 = deepSpot(w, z); if (sp2 >= 0) addUnit(w, "crawler", sp2) }
    announce(w, L("msg.deep.sentinel", "Uma sentinela das profundezas sobe pela escavação."), 2)
  } else {
    var n = 2 + ri(w, 3) + extra
    for (var k = 0; k < n; k++) { var sp = deepSpot(w, z); if (sp >= 0) addUnit(w, "crawler", sp) }
    announce(w, LF("msg.deep.crawlers", "{0} rastejantes saem das galerias.", n), 2)
  }
  // a raid like any other, so raidTick reports it when it is over — but marked
  // `deep`, because it did not come through any door
  w.raid = { since: w.tick, n: 1, wave: 0, lost: 0, deep: true }
  w.stats.raids++
  return true
}
function deepSpot(w, z) {
  for (var t = 0; t < 400; t++) {
    var i = idx(ri(w, W), ri(w, H), z)
    if (passable(w, i)) return i
  }
  for (var j = z * N; j < (z + 1) * N; j++) if (passable(w, j)) return j
  return -1
}

// ---- the lost court ---------------------------------------------------------
// Everything that came up from the deep so far wanted the hold dead, so depth
// was only ever a monster with better loot behind it. Something else lives
// down there: a people who did not die out, ruled by a king nobody up here has
// heard of in centuries, and what they do when a shaft breaks into their level
// is send someone up to talk.
//
// The envoy is not hostile and cannot be fought into anything useful. They ask
// for tribute — real goods, taken out of the stockpile, not merely counted like
// the baron's demands — and what they give back is something the hold cannot
// make: a pact that puts the deep back to sleep, steel out of their own forges,
// or the map of a level they have lived in for a thousand years.
//
// Refuse them and they do not simply leave. This is the one pressure in the
// game the player creates entirely by digging.
var TRIBUTE = ["cutgem", "bar", "craft", "booze", "meal"]
var TRIBUTE_N = { cutgem: 2, bar: 3, craft: 4, booze: 12, meal: 6 }
var TRIBUTE_DAYS = 15
function raceName(w) { return pick(w, tbl("SUR_A", SUR_A)) + pick(w, tbl("SUR_B", SUR_B)) }
function courtGoods(w, k) {
  var n = 0
  for (var q = 0; q < w.items.length; q++) { var it = w.items[q]; if (it.t === k && !it.by && !it.gone) n++ }
  return n
}
// Paying takes the goods away. A tribute you keep is not a tribute.
function payTribute(w, k, n) {
  var taken = 0
  for (var q = w.items.length - 1; q >= 0 && taken < n; q--) {
    var it = w.items[q]
    if (it.t !== k || it.by || it.gone) continue
    removeItem(w, it.id); taken++
  }
  return taken
}
// Someone comes up to ask. They walk to the depot and wait there; if they
// cannot get up at all, nothing happens and the level stays quiet.
function courtArrive(w, z) {
  if (w.court || w.pact || w.grudge) return false
  var spot = deepSpot(w, z)
  if (spot < 0) return false
  var kind = pick(w, TRIBUTE)
  var e = addUnit(w, "envoy", spot)
  e.name = dwarfName(w)
  // Counted from what the hold already has, the same lesson the baron taught:
  // a tribute the stockpile already covers is paid the morning it is asked and
  // costs the player nothing.
  w.court = { race: raceName(w), king: dwarfName(w), k: kind, n: courtGoods(w, kind) + TRIBUTE_N[kind], since: w.tick, z: z, envoy: e.id, said: false }
  announce(w, LF("msg.court.come", "Algo sobe do nível {0} — e não vem para lutar.", z), 2)
  return true
}
// The envoy makes their way to the depot, says what they came to say once they
// are there, and then stands and waits out the deadline.
function actEnvoy(w, u) {
  var c = w.court
  // Their business is done: they go back the way they came. Walking them out
  // through the surface edge like a merchant was wrong — they did not arrive
  // through the gate, and a hold that watches them leave downward learns where
  // they live.
  if (!c) { descendHome(w, u); return }
  if (dist(u.i, w.depot) <= 2) {
    if (!c.said) {
      c.said = true; c.since = w.tick
      announce(w, LF("msg.court.ask", "O emissário dos {0}, em nome do rei {1}, pede tributo: {2} de {3}.", c.race, c.king, c.n, itemName(c.k)), 2)
      legend(w, LF("lg.court.ask", "Os {0}, das profundezas, pediram tributo no ano {1}.", c.race, date(w).year))
    }
    u.wait = 20
    return
  }
  if (u.wait > 0) { u.wait--; return }
  if (!u.path && !go(w, u, function (q) { return dist(q, w.depot) <= 2 }, w.depot, 4000)) { u.wait = 40; return }
  step(w, u)
}
// Their side of it, once a day.
function courtTick(w, d) {
  var c = w.court
  if (!c) return
  var envoy = unitById(w, c.envoy)
  if (!envoy) { w.court = null; return }
  if (!c.said) return
  if (courtGoods(w, c.k) >= c.n) {
    payTribute(w, c.k, c.n)
    w.stats.tributes = (w.stats.tributes || 0) + 1
    var gift = pick(w, ["pact", "steel", "map"])
    if (gift === "pact") {
      w.pact = 1
      announce(w, LF("msg.court.pact", "Tributo pago. Os {0} selam um pacto: as profundezas voltam a dormir.", c.race), 1)
      legend(w, LF("lg.court.pact", "Um pacto foi selado com os {0} no ano {1}.", c.race, date(w).year))
    } else if (gift === "steel") {
      for (var k = 0; k < 3; k++) addItem(w, "bar", w.depot, 3)
      addItem(w, "cutgem", w.depot)
      announce(w, LF("msg.court.steel", "Tributo pago. Os {0} deixam aço das suas próprias forjas.", c.race), 1)
    } else {
      revealLevel(w, c.z)
      announce(w, LF("msg.court.map", "Tributo pago. Os {0} mostram o nível {1} como quem mostra a própria casa.", c.race, c.z), 1)
    }
    var ds = dwarves(w)
    for (var q = 0; q < ds.length; q++) thought(w, ds[q], L("th.court.paid", "a fortaleza tratou com um rei das profundezas"), 5)
    // A hold that dealt fairly is a hold worth visiting. The king himself comes
    // later — the envoy was only ever a messenger, and a king who never arrives
    // is a name in a sentence.
    w.crown = { race: c.race, king: c.king, z: c.z, since: w.tick, due: w.tick + DAY * KING_DELAY, came: 0 }
    envoy.going = c.z
    w.court = null
    return
  }
  if (w.tick - c.since <= DAY * TRIBUTE_DAYS) return
  // The deadline passed. They go home, and they remember.
  w.grudge = 1
  w.stats.tributesFailed = (w.stats.tributesFailed || 0) + 1
  announce(w, LF("msg.court.refused", "O emissário dos {0} desceu de mãos vazias. Eles não esquecem.", c.race), 2)
  legend(w, LF("lg.court.refused", "Os {0} foram recusados no ano {1}.", c.race, date(w).year))
  var ds2 = dwarves(w)
  for (var q2 = 0; q2 < ds2.length; q2++) thought(w, ds2[q2], L("th.court.refused", "negou o tributo a um rei das profundezas"), -4)
  removeUnit(w, envoy)
  w.court = null
  spawnDeep(w, c.z)
}
function descendHome(w, u) {
  var z = typeof u.going === "number" ? u.going : 1
  if (iz(u.i) <= z) { removeUnit(w, u); return }
  if (u.wait > 0) { u.wait--; return }
  if (!u.path || !u.job || u.job.k !== "leave") {
    var home = deepSpot(w, z)
    if (home < 0 || !go(w, u, function (q) { return q === home }, home, 4000)) { removeUnit(w, u); return }
    u.job = { k: "leave", i: -1 }
  }
  if (step(w, u) === 1) removeUnit(w, u)
}
// ---- the king comes up ------------------------------------------------------
// The lost king was a name in the envoy's sentence and nothing else: "in the
// name of king so-and-so". A king nobody ever meets is set dressing.
//
// So he comes. A season after a tribute is paid he climbs out of the deep with
// two of his guard, walks to the depot, and stays a while. While he is in the
// hold everyone's mood lifts — this is the oldest thing in the world and it is
// in your dining room — and when he leaves he decides what the visit was worth:
// a hold that grew since the tribute gets his own smith's work, one that is
// merely holding gets his blessing, and one that has fallen apart gets a look.
var KING_DELAY = 25      // days between paying tribute and the visit
var KING_STAY = 6        // days he stays
function kingTick(w, d) {
  var c = w.crown
  if (!c || w.fallen) return
  if (!c.came) {
    if (w.tick < c.due || w.raid || w.siege) return
    var spot = deepSpot(w, c.z)
    if (spot < 0) { c.due = w.tick + DAY * 3; return }
    var k = addUnit(w, "king", spot)
    k.name = c.king
    k.going = -1
    c.came = Math.max(1, w.tick)
    c.wealthThen = w.wealth
    c.popThen = pop(w)
    c.guards = []
    for (var g = 0; g < 2; g++) {
      var gs = deepSpot(w, c.z)
      if (gs < 0) continue
      var gu = addUnit(w, "kingsguard", gs)
      gu.name = dwarfName(w)
      c.guards.push(gu.id)
    }
    c.unit = k.id
    announce(w, LF("msg.king.come", "O rei {0}, dos {1}, sobe das profundezas em pessoa.", c.king, c.race), 2)
    legend(w, LF("lg.king.come", "O rei {0}, dos {1}, visitou a fortaleza no ano {2}.", c.king, c.race, date(w).year))
    return
  }
  var king = unitById(w, c.unit)
  if (!king) { w.crown = null; return }
  // while he is here
  if (w.tick % (DAY / 2) < 1) {
    var ds2 = dwarves(w)
    for (var q = 0; q < ds2.length; q++) thought(w, ds2[q], LF("th.king", "viu o rei {0} com os próprios olhos", first(c.king)), 3)
  }
  if (w.tick - c.came < DAY * KING_STAY) return
  // and what he makes of it
  var grew = w.wealth > (c.wealthThen || 0) * 1.15 || pop(w) > (c.popThen || 0)
  var held = pop(w) >= Math.max(3, Math.floor((c.popThen || 0) * 0.7))
  if (grew) {
    var kn = artifactName(w, "ore", { k: "pact", who: c.race }).split("|")
    var gift = addItem(w, "weapon", w.depot, 4)
    gift.nm = kn[0]; gift.title = kn[1]
    w.artifacts.push({ name: kn[0], title: kn[1], desc: kn[2], maker: LF("king.smith", "o ferreiro do rei {0}", first(c.king)), t: w.tick, about: { k: "pact", who: c.race } })
    w.stats.artifacts++
    announce(w, LF("msg.king.gift", "O rei parte satisfeito e deixa {0}, {1}, forjada pelo seu próprio ferreiro.", kn[0], kn[1]), 2)
    legend(w, LF("lg.king.gift", "O rei {0} deixou {1} à fortaleza no ano {2}.", c.king, kn[0], date(w).year))
  } else if (held) {
    w.blessed = Math.max(1, w.tick)
    announce(w, LF("msg.king.bless", "O rei {0} parte, e deixa a sua palavra: esta fortaleza está sob a proteção dos {1}.", c.king, c.race), 1)
  } else {
    announce(w, LF("msg.king.cold", "O rei {0} desce sem dizer nada. Ele viu o bastante.", c.king), 1)
    var ds3 = dwarves(w)
    for (var q3 = 0; q3 < ds3.length; q3++) thought(w, ds3[q3], L("th.king.cold", "o rei das profundezas não se impressionou"), -4)
  }
  king.going = c.z
  for (var gq = 0; gq < (c.guards || []).length; gq++) { var gu2 = unitById(w, c.guards[gq]); if (gu2) gu2.going = c.z }
  w.crown = null
}
// A king walks to the depot and stands there; his guard stands with him. They
// are not hostile and nothing they do is urgent.
function actKing(w, u) {
  if (typeof u.going === "number" && u.going >= 0) { descendHome(w, u); return }
  if (dist(u.i, w.depot) <= 3) { u.wait = 30; return }
  if (u.wait > 0) { u.wait--; return }
  if (!u.path && !go(w, u, function (q) { return dist(q, w.depot) <= 3 }, w.depot, 4000)) { u.wait = 40; return }
  step(w, u)
}
// A level shown by people who have lived in it. The one way the fog comes off
// somewhere a dwarf has never walked.
function revealLevel(w, z) {
  if (!w.seen) return
  for (var i = z * N; i < (z + 1) * N; i++) w.seen[i] = 1
}

// ---- the baron and their demands -------------------------------------------
// The hold had no source of pressure that came from inside it. Goblins arrive
// on a schedule, hunger is arithmetic, and neither asks the player for
// anything in particular — so past the first hour there was nothing to do that
// somebody wanted done.
//
// A hold worth 4000 draws a noble. They are one of your own dwarves, promoted,
// and they want things: a statue to look at, a jewel, a full cellar, a drill
// yard, a cook. Each demand has a season to be met. Meeting it lifts everyone
// (a hold that satisfies its baron is a hold that is doing well and knows it);
// letting it lapse costs everyone a little, and the baron remembers.
//
// The demands are deliberately things the player builds or produces, never
// things that happen on their own — a demand you satisfy by waiting is not a
// demand.
// A demand is a target, counted from what the hold already had when it was
// made: "another statue", not "a statue". Asking only for what is missing
// meant the ready hold — which starts with a statue, a jeweler, a kitchen, a
// drill yard and a full cellar — was never asked for anything at all, and a
// baron who is satisfied by what you already own is not pressure.
var DEMANDS = ["statue", "jewel", "cellar", "training", "torches", "meals"]
var DEMAND_DAYS = 20
var DEMAND_STEP = { statue: 1, jewel: 2, cellar: 10, training: 1, torches: 2, meals: 6 }
function demandHave(w, k) {
  var c = cache(w)
  if (k === "statue") return c.statues.length
  if (k === "jewel") return countItems(w, "jewel")
  if (k === "cellar") return countItems(w, "booze")
  if (k === "training") return c.trainings.length
  if (k === "torches") return c.torches.length
  if (k === "meals") return countItems(w, "meal")
  return 0
}
function demandMet(w, d) { return !!d && demandHave(w, d.k) >= d.n }
function demandText(w, d) {
  if (!d) return ""
  return LF("dem." + d.k, "{0}", d.n)
}
// Who the baron is. One of your own, the one with the most skill — and if they
// die, the hold names another, which is the only promotion in the game.
function pickBaron(w) {
  var ds = dwarves(w), best = null, bs = -1
  for (var k = 0; k < ds.length; k++) {
    var sum = 0
    for (var sk in ds[k].skills) sum += ds[k].skills[sk]
    if (sum > bs) { bs = sum; best = ds[k] }
  }
  return best
}
function nobleTick(w, d) {
  if (w.fallen || pop(w) < 5 || w.wealth < 4000) return
  var baron = w.baron ? unitById(w, w.baron) : null
  if (!baron) {
    baron = pickBaron(w)
    if (!baron) return
    w.baron = baron.id
    w.demand = null
    announce(w, LF("msg.baron", "{0} tornou-se o barão de {1}.", baron.name, w.name), 1)
    legend(w, LF("lg.baron", "{0} tornou-se barão no ano {1}.", baron.name, d.year))
    return
  }
  // an open demand: met, or out of time
  if (w.demand) {
    if (demandMet(w, w.demand)) {
      w.stats.demandsMet = (w.stats.demandsMet || 0) + 1
      announce(w, LF("msg.demand.met", "O barão está satisfeito: {0}.", demandText(w, w.demand)), 1)
      legend(w, LF("lg.demand.met", "Uma exigência do barão foi atendida no ano {0}.", d.year))
      var ds = dwarves(w)
      for (var k = 0; k < ds.length; k++) thought(w, ds[k], L("th.demand.met", "a fortaleza agradou o barão"), 4)
      w.demand = null; w.demandSince = w.tick
      return
    }
    if (w.tick - w.demandSince > DAY * DEMAND_DAYS) {
      w.stats.demandsFailed = (w.stats.demandsFailed || 0) + 1
      announce(w, LF("msg.demand.failed", "O barão não foi atendido: {0}.", demandText(w, w.demand)), 2)
      legend(w, LF("lg.demand.failed", "Uma exigência do barão ficou sem resposta no ano {0}.", d.year))
      var ds2 = dwarves(w)
      for (var q = 0; q < ds2.length; q++) thought(w, ds2[q], L("th.demand.failed", "o barão está descontente"), -3)
      w.demand = null; w.demandSince = w.tick
    }
    return
  }
  // no demand, and a season since the last one: ask for something not yet had
  if (w.demandSince && w.tick - w.demandSince < DAY * 10) return
  var kind = pick(w, DEMANDS)
  w.demand = { k: kind, n: demandHave(w, kind) + DEMAND_STEP[kind] }
  w.demandSince = w.tick
  announce(w, LF("msg.demand", "O barão {0} exige: {1}.", baron.name, demandText(w, w.demand)), 1)
}

// ---- milestones and the end of a game --------------------------------------
// There was no way to win, only `checkFall` — the last dwarf dying. A hold
// could run for five years and nothing ever said it had got anywhere, which is
// what made watching it feel like a screensaver instead of a game.
//
// These are the six things a hold does on its way up, each announced once when
// it happens. Doing all six makes the hold **legendary**, which is this game's
// version of winning: the world keeps going afterwards (there is no screen to
// stop at), but the Legends page carries the date it was earned, and the
// scoreboard is written then instead of only when everyone is dead.
var MILESTONES = ["artifact", "wealth", "pop", "repelled", "depths", "years"]
// Not one of the six: this one only exists once the six are done, which is why
// it is counted apart. It is the answer to "and then what".
function royalHeld(w) { return !!(w.royalCame && !w.raid && !w.fallen && w.tick > w.royalCame + DAY) }
function milestoneMet(w, id) {
  if (id === "artifact") return w.stats.artifacts >= 1
  if (id === "wealth") return w.wealth >= 6000
  if (id === "pop") return pop(w) >= 18
  if (id === "repelled") return (w.stats.repelled || 0) >= 3
  // the magma sea is level 0: reaching it means somebody dug all the way down
  if (id === "depths") { for (var i = 0; i < N; i++) if (w.tile[i] === T_OPEN && w.floor[i] !== F_NONE) return true; return false }
  if (id === "years") return w.tick >= YEAR * 5
  return false
}
function checkMilestones(w) {
  if (w.fallen) return
  if (!w.done) w.done = {}
  var all = true
  for (var k = 0; k < MILESTONES.length; k++) {
    var id = MILESTONES[k]
    if (w.done[id]) continue
    if (!milestoneMet(w, id)) { all = false; continue }
    w.done[id] = w.tick
    announce(w, L("ms." + id, "Marco alcançado."), 1)
    legend(w, LF("lg.ms." + id, "Marco alcançado no ano {0}.", date(w).year))
  }
  if (all && !w.legendary) {
    w.legendary = w.tick
    announce(w, LF("msg.legendary.hold", "{0} é uma fortaleza lendária. As Montanhas-Lar cantam o seu nome.", w.name), 2)
    legend(w, LF("lg.legendary", "{0} tornou-se lendária no ano {1}.", w.name, date(w).year))
    becomeCapital(w)
  }
}
// ---- the capital ------------------------------------------------------------
// "Legendary" was the end of the game: six milestones, a scoreboard, and then
// the fortress kept going with nothing left to reach for. A hold that has done
// everything is not finished, it is *promoted* — and being the capital is a
// job, not a prize.
//
// The Mountainhomes send the crown. The baron is raised to king and stays, the
// hold's cap goes up because everyone wants to live where the king lives, and
// the goblins start treating it as what it is: three years after the crown
// arrives they come for it in one piece, announced a season ahead, and holding
// that is the last thing this game asks of you.
var ROYAL_DELAY = 48      // days from the crown to the royal siege
function becomeCapital(w) {
  if (w.capital) return
  w.capital = Math.max(1, w.tick)
  w.popCap = w.popCap + 8
  var monarch = w.baron ? unitById(w, w.baron) : pickBaron(w)
  if (monarch) {
    w.monarch = monarch.id
    monarch.crowned = w.tick
    announce(w, LF("msg.capital", "As Montanhas-Lar reconhecem {0} como capital, e coroam {1}.", w.name, monarch.name), 2)
    legend(w, LF("lg.capital", "{0} tornou-se capital no ano {1}, e {2} foi coroado.", w.name, date(w).year, monarch.name))
    // the barony is vacant again: somebody else gets the title
    w.baron = 0; w.demand = null
  } else announce(w, LF("msg.capital.nobody", "As Montanhas-Lar reconhecem {0} como capital.", w.name), 2)
  var ds = dwarves(w)
  for (var k = 0; k < ds.length; k++) thought(w, ds[k], L("th.capital", "vive na capital"), 10)
  w.royalRaid = w.tick + DAY * ROYAL_DELAY
  w.royalWarned = 0
}
// Living under a crown, and the siege it invites.
function capitalTick(w, d) {
  if (!w.capital || w.fallen) return
  var king = w.monarch ? unitById(w, w.monarch) : null
  if (!king && w.monarch) {
    // the king is dead. The hold crowns another, because a capital without one
    // is just a fortress with a big cap.
    w.monarch = 0
    var heir = pickBaron(w)
    if (heir) {
      w.monarch = heir.id; heir.crowned = w.tick
      announce(w, LF("msg.crown.heir", "O rei está morto. {0} é coroado em seu lugar.", heir.name), 2)
      legend(w, LF("lg.crown.heir", "{0} foi coroado no ano {1}, depois da morte do rei.", heir.name, date(w).year))
      var ds2 = dwarves(w)
      for (var q = 0; q < ds2.length; q++) thought(w, ds2[q], L("th.crown.heir", "viu uma coroação"), 4)
    }
  } else if (king && w.tick % DAY === 0) {
    for (var t = 0, ds3 = dwarves(w); t < ds3.length; t++) thought(w, ds3[t], LF("th.monarch", "vive sob o rei {0}", first(king.name)), 1)
  }
  if (w.peaceful || !w.royalRaid) return
  if (!w.royalWarned && w.tick >= w.royalRaid - DAY * 20) {
    w.royalWarned = 1
    announce(w, L("msg.royal.warn", "Correm notícias: os goblins souberam da coroa. Vêm buscá-la."), 2)
    legend(w, LF("lg.royal.warn", "No ano {0}, os goblins puseram os olhos na capital.", date(w).year))
  }
  if (w.tick >= w.royalRaid && !w.raid) {
    w.royalRaid = 0
    w.royalCame = Math.max(1, w.tick)
    spawnRaid(w, d, (w.scenario ? w.scenario.wave : 8) + 6)
    announce(w, L("msg.royal.raid", "O cerco real: tudo o que os goblins têm, de uma vez."), 2)
  }
}
// What a game is worth when it ends, either way. Written once, into the
// chronicle, so a fallen hold leaves a reckoning and not just a last death.
function scoreboard(w) {
  var d = date(w), st = w.stats, met = 0
  for (var k = 0; k < MILESTONES.length; k++) if (w.done && w.done[MILESTONES[k]]) met++
  return { years: d.year, wealth: w.wealth, pop: pop(w), milestones: met, of: MILESTONES.length,
           artifacts: w.stats.artifacts, repelled: st.repelled || 0, goblins: st.goblinsKilled || 0,
           deaths: st.deaths, buried: st.buried || 0, legendary: !!w.legendary, fallen: !!w.fallen }
}
function checkFall(w) {
  if (w.fallen || w.tick < 10 || pop(w) > 0) return
  w.fallen = true
  announce(w, LF("msg.fallen", "{0} caiu. Não resta nenhum anão.", w.name), 2)
  legend(w, LF("lg.fallen", "{0} caiu no ano {1}. {2}.", w.name, date(w).year, LP(w.stats.deaths, "n.lost.one", "n.lost.many", "anão perdido", "anões perdidos")))
  var sc = scoreboard(w)
  legend(w, LF("lg.score", "Placar: {0} de {1} marcos, riqueza {2}, {3} artefato(s), {4} onda(s) repelida(s).", sc.milestones, sc.of, sc.wealth, sc.artifacts, sc.repelled))
}
function dayStart(w, d) {
  rosterMilitia(w)
  if (!w.fallen) { nobleTick(w, d); courtTick(w, d); kingTick(w, d); penTick(w, d); capitalTick(w, d) }
  // Once a day, at dawn. Rewriting the queue four times a day instead looked
  // like the obvious fix for a cellar that runs dry at breakfast, and cost
  // a third of the hold's brewing and six fortresses in sixteen: the churn
  // orphaned the order every dwarf was already working on.
  if (!w.fallen) { spoilFood(w); holdOrders(w); holdTrade(w); noAccessTick(w) }
  if (w.scenario && !w.fallen) prospect(w)
  if (w.scenario && !w.peaceful && !w.fallen && !w.raid && !w.caravan && w.tick >= w.scenario.nextRaid) spawnRaid(w, d, w.scenario.wave)
  // weather
  if (d.seasonName === "primavera" || d.seasonName === "outono") w.weather = chance(w, 0.3) ? 1 : 0
  else if (d.seasonName === "inverno") w.weather = chance(w, 0.8) ? 2 : 0
  else w.weather = chance(w, 0.08) ? 1 : 0
  // caravan: on the third day of autumn, or whenever a preset asked for one
  var summoned = !!(w.caravanAt && w.tick >= w.caravanAt)
  if (summoned) w.caravanAt = 0
  if ((summoned || (d.seasonName === "outono" && d.day === 3)) && !w.caravan && !w.raid && !w.fallen) {
    var sp = edgeSurface(w)
    if (sp >= 0) {
      w.caravan = { stage: "arrive", spot: w.depot, arrived: 0, days: 0, n: 3 }
      w.trade = { sell: {}, buy: {}, delivered: {}, closed: false }
      for (var k = 0; k < 3; k++) { var m = addUnit(w, "merchant", nearFree(w, sp, 1)); m.wait = 0 }
      announce(w, L("msg.caravan", "Uma caravana das Montanhas-Lar chegou!"), 1)
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
  // Trees grow back next to trees — but never on top of somebody, and never
  // into the last way out of somewhere.
  //
  // Both guards are here because a real hold died of it: three dwarves ended
  // up walled into a six-cell pocket of grass, one of them standing *inside* a
  // tree that had grown on their own square, with 59 drinks and 131 food in a
  // stockpile they could no longer reach. They did not fail to look for water.
  // They were fenced in by the scenery, and nothing in the game said so.
  for (var t = 0; t < 6; t++) {
    var x = ri(w, W), y = ri(w, H), i = surfaceIdx(w, x, y)
    if (w.tile[i] !== T_OPEN || w.floor[i] !== F_GRASS || w.build[i] !== B_NONE || w.desig[i] !== DG_NONE) continue
    if (!touchesTile(w, i, T_TREE) || !chance(w, 0.5)) continue
    if (unitAt(w, i)) continue
    // a cell with two or fewer ways out of it is a corridor, and a tree there
    // can cut a hold in half
    if (openNeighbours(w, i) <= 2) continue
    // And it must not take the last way out from a neighbour who is standing
    // there. The guard above protects the cell the tree grows in; this one
    // protects whoever is beside it — the dwarf whose only exit it would be.
    var boxedIn = false
    for (var nq = 0; nq < 4 && !boxedIn; nq++) {
      var nx3 = x + [1, -1, 0, 0][nq], ny3 = y + [0, 0, 1, -1][nq]
      if (!inb(nx3, ny3, iz(i))) continue
      var ni3 = idx(nx3, ny3, iz(i))
      if (!passable(w, ni3)) continue
      if (openNeighbours(w, ni3) <= 1 || (unitAt(w, ni3) && openNeighbours(w, ni3) <= 2)) boxedIn = true
    }
    if (boxedIn) continue
    w.tile[i] = T_TREE; w.dirty = true
  }
}
// wave 0: an ordinary ambush sized by wealth. wave >= 1: the scenario's
// escalating waves - more goblins, then elites with better gear.
//
// On top of that, `w.pressure`: the goblins answer the *result* of the last
// attack, not the defence they can see. Repelling one without losing anybody
// sends a bigger one next time; losing two or more dwarves takes the pressure
// back off. Sizing the wave by how well defended a hold looks was the obvious
// reading of "scale with the real defence" and is the wrong one — it punishes
// preparation, so the militia you drilled and the doors you hung buy nothing.
// Answering the outcome is legible from the inside: you won easily, so more
// came.
function spawnRaid(w, d, wave) {
  var gs = edgeSurface(w); if (gs < 0) return false
  var sc = w.scenario || {}, mul = w.waveMul || 1
  // Capped at +2, and never past the preset's own cap. At +4 and with the cap
  // lifted, clean wins compounded into waves the hold could not answer and
  // fifteen fortresses in sixteen fell: positive feedback on a schedule this
  // tight runs away. The pressure now only gets you to the ceiling faster.
  var press = Math.max(-2, Math.min(2, w.pressure || 0))
  var n = wave > 0 ? Math.min(sc.cap || 12, Math.round(((sc.base || 3) + Math.floor(wave * (sc.step || 1.5))) * mul) + press) : Math.max(1, Math.round((2 + Math.min(5, Math.floor(w.wealth / 900)) + ri(w, 2)) * mul) + press)
  n = Math.max(1, n)
  var eliteFrom = sc.eliteFrom || 4
  for (var g = 0; g < n; g++) { var gob = addUnit(w, "goblin", nearFree(w, gs, 2)); if (wave >= eliteFrom && g % 3 === 0) { gob.elite = true; gob.hp = 9; gob.maxhp = 9 } }
  w.raid = { since: w.tick, n: n, wave: wave, lost: 0 }
  w.stats.raids++
  announce(w, LF("msg.raid", "{0}Goblins! {1} invasores na superfície!{2}", wave > 0 ? LF("msg.raid.wave", "Onda {0}: ", wave) : L("msg.raid.ambush", "Uma emboscada! "), n, wave >= eliteFrom ? L("msg.raid.elite", " Há veteranos entre eles.") : ""), 2)
  legend(w, LF("lg.raid", "{0} ({1}) no ano {2}.", wave > 0 ? LF("lg.raid.wave", "Onda goblin {0}", wave) : L("lg.raid.ambush", "Emboscada goblin"), n, d.year))
  var ds = dwarves(w); for (var q = 0; q < ds.length; q++) grabWeapon(w, ds[q])
  if (w.scenario) { w.scenario.wave = wave + 1; w.scenario.nextRaid = w.tick + w.scenario.raidEvery }
  return true
}
// ---- trading with the caravan -----------------------------------------------
// The caravan was the one friendly visitor in the game and it was an automaton:
// it took up to four things it picked itself and left food and drink in a fixed
// ratio. The player chose nothing — not what to sell, not what to ask for — so
// crafts and jewels were worth only the wealth number they added.
//
// Now it is a deal. You put goods on the table and name what you want back,
// they weigh both at their own prices, and dwarves carry the offer to the camp
// like any other hauling job. Nothing moves until the whole offer is delivered,
// which is what makes a trade a decision rather than a button.
var TRADE_SELL = ["craft", "cutgem", "jewel", "bar", "gem", "ore", "weapon", "armor", "meal", "booze", "stone", "log"]
var TRADE_BUY = ["food", "booze", "log", "stone", "bar", "pick", "axe", "weapon", "armor", "gem"]
var TRADE_MARGIN = 0.8   // they buy at four fifths of what they sell at: that is the trade
function tradeTable(w) {
  if (!w.trade) w.trade = { sell: {}, buy: {}, delivered: {}, closed: false }
  return w.trade
}
function tradeValue(w, map) {
  var v = 0
  for (var k in map) v += (ITEM_VALUE[k] || 1) * map[k]
  return v
}
// What the hold has spare, so the table cannot promise what it does not own.
function tradeSpare(w, t) {
  var n = countItems(w, t), tr = tradeTable(w)
  return Math.max(0, n - (tr.sell[t] || 0))
}
// `d` is a quantity, not a direction: the menu passes ±1 and gets one step,
// and anything else asking for eight gets eight. Offering is capped by what the
// hold actually owns, so the table can never promise goods that are not there.
function tradeOffer(w, t, d, byPlayer) {
  var tr = tradeTable(w)
  if (tr.closed || !d) return false
  if (byPlayer) tr.byPlayer = true
  var have = tr.sell[t] || 0
  var want = have + d
  if (d > 0) want = Math.min(want, have + tradeSpare(w, t))
  if (want < 0) want = 0
  if (want === have) return false
  if (want) tr.sell[t] = want; else delete tr.sell[t]
  w.dirty = true
  return true
}
function tradeWant(w, t, d, byPlayer) {
  var tr = tradeTable(w)
  if (tr.closed || !d) return false
  if (byPlayer) tr.byPlayer = true
  var had = tr.buy[t] || 0, now = Math.max(0, had + d)
  if (now === had) return false
  if (now) tr.buy[t] = now; else delete tr.buy[t]
  w.dirty = true
  return true
}
function tradeClear(w, byPlayer) {
  var tr = tradeTable(w)
  if (tr.closed) return
  tr.sell = {}; tr.buy = {}
  // Clearing by hand is also a decision: the hold does not immediately fill the
  // table back up, or the player could never say "nothing, thank you".
  if (byPlayer) tr.byPlayer = true
  w.dirty = true
}
// What the hold trades when nobody tells it to. Same principle as the morning
// work orders: if the player has not said otherwise, the dwarves act on what
// they can see — sell what is piling up, ask for what is running out. A player
// who touches the table takes it over, including clearing it to nothing.
function holdTrade(w) {
  var c = w.caravan
  if (!c || c.stage !== "trade") return
  var tr = tradeTable(w)
  if (tr.closed || tr.byPlayer) return
  if (tradeValue(w, tr.sell) > 0 || tradeValue(w, tr.buy) > 0) return
  var p = Math.max(1, pop(w))
  // what the hold is short of, most pressing first
  var wants = []
  var food = countItems(w, "food") + countItems(w, "meal") * 2
  if (food < p * FOOD_PER_DWARF * 0.6) wants.push(["food", Math.ceil(p * 1.5)])
  if (countItems(w, "booze") < p * 3) wants.push(["booze", Math.ceil(p * 1.5)])
  if (countItems(w, "log") < 8) wants.push(["log", 8])
  if (countItems(w, "bar") < 4) wants.push(["bar", 3])
  if (countItems(w, "pick") < 1) wants.push(["pick", 1])
  if (!wants.length) wants.push(["food", Math.ceil(p)])
  // what it can spare, dearest first, keeping a floor of each
  var floors = { craft: 2, cutgem: 0, jewel: 0, gem: 2, ore: 4, stone: 12, log: 12, bar: 4 }
  var spares = []
  for (var t in floors) {
    var spare = countItems(w, t) - floors[t]
    if (spare > 0) spares.push([t, spare, ITEM_VALUE[t] || 1])
  }
  spares.sort(function (a, b) { return b[2] - a[2] })
  if (!spares.length) return
  // ask for what is wanted, then put up just enough to pay for it
  var asked = 0
  for (var q = 0; q < wants.length && asked < 3; q++) { tradeWant(w, wants[q][0], wants[q][1]); asked++ }
  var need = tradeValue(w, tr.buy) / TRADE_MARGIN
  for (var sq = 0; sq < spares.length && tradeValue(w, tr.sell) < need; sq++) {
    var sp = spares[sq]
    for (var n = 0; n < sp[1] && tradeValue(w, tr.sell) < need; n++) tradeOffer(w, sp[0], 1)
  }
  // if the hold cannot cover it, scale the ask back until they would take it
  var guard = 0
  while (!tradeAccepts(w) && guard++ < 200) {
    var biggest = null, bv = -1
    for (var bk in tr.buy) { var v = (ITEM_VALUE[bk] || 1) * tr.buy[bk]; if (v > bv) { bv = v; biggest = bk } }
    if (!biggest) break
    tradeWant(w, biggest, -1)
  }
  if (!tradeAccepts(w)) { tr.sell = {}; tr.buy = {}; return }
  var sold = 0, bought = 0
  for (var sk in tr.sell) sold += tr.sell[sk]
  for (var bk2 in tr.buy) bought += tr.buy[bk2]
  announce(w, LF("msg.trade.hold", "Sem ordens suas, a fortaleza montou a própria troca: {0} bens por {1}.", sold, bought), 1)
}
// Their side of the arithmetic, and the one number the player is playing
// against: what they give is worth four fifths of what they take.
function tradeAccepts(w) {
  var tr = tradeTable(w)
  var give = tradeValue(w, tr.sell), take = tradeValue(w, tr.buy)
  return give > 0 && take <= give * TRADE_MARGIN
}
function tradeOwed(w) {
  var tr = tradeTable(w), left = {}
  for (var k in tr.sell) {
    var done = (tr.delivered || {})[k] || 0
    if (tr.sell[k] > done) left[k] = tr.sell[k] - done
  }
  return left
}
// Carrying one promised item to the camp. It is a haul with a different
// destination, so it uses the same machinery.
function branchTrade(w, u) {
  var c = w.caravan
  if (!c || c.stage !== "trade") return false
  var tr = tradeTable(w)
  if (tr.closed || !tradeAccepts(w)) return false
  var left = tradeOwed(w)
  for (var t in left) {
    var it = freeItem(w, t, u.i, u)
    if (!it) continue
    if (!go(w, u, function (q) { return q === it.i }, it.i)) continue
    it.res = u.id
    setJob(w, u, { k: "trade", i: c.spot, item: it.id, what: t, stage: "fetch" })
    return true
  }
  return false
}
// Everything promised has arrived: they hand over what was asked for.
function tradeSettle(w) {
  var tr = tradeTable(w), c = w.caravan
  // Settling twice hands the goods over twice. Two dwarves delivering the last
  // two items in the same tick is enough to get here twice, and the second call
  // used to pay out again.
  if (tr.closed) return false
  var owed = tradeOwed(w)
  for (var k in owed) return false          // still something to carry
  var spot = c ? c.spot : w.depot, given = 0
  for (var b in tr.buy) for (var q = 0; q < tr.buy[b]; q++) { addItem(w, b, nearFree(w, spot, 2), b === "bar" || b === "weapon" || b === "armor" || b === "pick" || b === "axe" ? 2 : 0); given++ }
  var took = 0
  for (var sK in tr.sell) took += tr.sell[sK]
  w.stats.traded = (w.stats.traded || 0) + took
  tr.closed = true
  announce(w, LF("msg.trade.done", "Negócio fechado: {0} bens saíram, {1} chegaram.", took, given), 1)
  legend(w, LF("lg.trade", "Um negócio foi fechado com os mercadores no ano {0}.", date(w).year))
  var ds = dwarves(w)
  for (var d = 0; d < ds.length; d++) thought(w, ds[d], L("th.trade", "a fortaleza fez um bom negócio"), 3)
  return true
}
function caravanDay(w) {
  var c = w.caravan
  var merchants = w.units.filter(function (u) { return u.k === "merchant" })
  if (merchants.length === 0) { announce(w, L("msg.merchants.gone", "Os mercadores se foram."), 0); w.caravan = null; return }
  if (c.stage === "arrive" && c.arrived >= merchants.length) { c.stage = "trade"; announce(w, L("msg.merchants.camp", "Os mercadores montaram acampamento junto ao depósito."), 0) }
  if (c.stage === "trade") {
    c.days++
    if (c.days === 1) announce(w, L("msg.trade.open", "Os mercadores abriram as arcas. Monte a troca no menu de Ordens."), 1)
    // A deal left half-carried when they leave is not stolen: they pay for
    // what actually arrived, at their own rate, and go.
    if (c.days >= 5) {
      var tr = tradeTable(w)
      var partial = 0
      for (var pk in (tr.delivered || {})) partial += (ITEM_VALUE[pk] || 1) * tr.delivered[pk]
      if (!tr.closed && partial > 0) {
        var back = Math.max(1, Math.floor(partial * TRADE_MARGIN / (ITEM_VALUE.food || 2)))
        for (var pq = 0; pq < back; pq++) addItem(w, pick(w, ["food", "booze"]), nearFree(w, c.spot, 2))
        announce(w, LF("msg.trade.partial", "Os mercadores pagaram pelo que chegou a tempo: {0} suprimentos.", back), 1)
      }
      c.stage = "leave"
      announce(w, L("msg.merchants.left", "Os mercadores partiram."), 0)
    }
  }
  if (w.raid && c.stage !== "leave") { c.stage = "leave"; announce(w, L("msg.merchants.flee", "Os mercadores fogem da emboscada!"), 1) }
}
function raidTick(w) {
  if (!w.raid) return
  // nobody left to repel anything: the raid just ends, unremarked
  if (w.fallen) { w.raid = null; return }
  var n = 0, inside = 0
  for (var k = 0; k < w.units.length; k++) {
    var g = w.units[k]
    if (g.k !== "goblin") continue
    n++
    if (iz(g.i) < w.ground[g.i % N]) inside++
  }
  // A siege is a situation, not a mood: goblins alive on the surface and not
  // one of them through the door. Measured per goblin first — "this one found
  // no path" — which fired with the doors wide open, because a goblin loose
  // inside a hold whose survivors are three levels down also finds no path.
  if (n > 0 && inside === 0) {
    if (!w.siegeSince) w.siegeSince = w.tick
    // Two full days with not one goblin inside, not half of one: half a day is
    // only "they have not got in yet", and it fired on ordinary waves while
    // the goblins were still walking to the gate — which shut the surface down
    // for every raid instead of only for a siege, and cost three fortresses in
    // sixteen.
    if (!w.siege && w.tick - w.siegeSince > DAY * 2) {
      w.siege = w.tick
      announce(w, LF("msg.siege", "{0} está sitiada. Ninguém sai à superfície.", w.name), 2)
      legend(w, LF("lg.siege", "Cerco a {0} no ano {1}.", w.name, date(w).year))
    }
  } else w.siegeSince = 0
  if (n === 0) {
    w.stats.repelled = (w.stats.repelled || 0) + 1
    // won it clean: they come back heavier. Bled for it: they ease off.
    if (!w.raid.lost) w.pressure = Math.min(2, (w.pressure || 0) + 1)
    else if (w.raid.lost >= 2) w.pressure = Math.max(-2, (w.pressure || 0) - 1)
    announce(w, LF("msg.repelled", "{0}{1} resiste{2}", w.raid.wave ? LF("msg.repelled.wave", "Onda {0} repelida. ", w.raid.wave) : L("msg.repelled.ambush", "A emboscada terminou. "), w.name, w.raid.lost ? LF("msg.repelled.losses", ", com {0}.", LP(w.raid.lost, "n.loss.one", "n.loss.many", "baixa", "baixas")) : L("msg.repelled.none", " sem baixas.")), 1)
    legend(w, LF("lg.repelled", "{0} repelida{1}", w.raid.wave ? LF("lg.wave", "Onda {0}", w.raid.wave) : L("lg.ambush", "Emboscada"), w.raid.lost ? LF("lg.repelled.losses", " ({0}).", LP(w.raid.lost, "n.lost.one", "n.lost.many", "anão perdido", "anões perdidos")) : L("msg.repelled.none", " sem baixas.")))
    w.raid = null
    if (w.siege) {
      var days = Math.max(1, Math.round((w.tick - w.siege) / DAY))
      announce(w, LF("msg.siege.over", "O cerco terminou depois de {0} dia(s).", days), 1)
      legend(w, LF("lg.siege.over", "O cerco durou {0} dia(s).", days))
      w.siege = 0
    }
    var ds = dwarves(w); for (var q = 0; q < ds.length; q++) thought(w, ds[q], L("th.survived", "sobreviveu a uma emboscada"), 2)
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
  if (w.tick % 24 === 0) socialTick(w)
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
    else if (u.k === "envoy") actEnvoy(w, u)
    else if (u.k === "king" || u.k === "kingsguard") actKing(w, u)
    else if (u.k === "goat" || u.k === "cat") actBeast(w, u)
    if (w.build[u.i] === B_TRAP && hostile(u)) { if (trapFires(w, u) && w.units.indexOf(u) < 0) continue }
    // liquids
    var t = w.tile[u.i]
    if (t === T_MAGMA) { if (u.k === "dwarf") die(w, u, L("death.magma", "queimou até a morte no magma")); else { if (u.k === "goat" || u.k === "cat") beastDied(w, u, "magma"); removeUnit(w, u) } }
    else if (t === T_WATER) { u.drown = (u.drown || 0) + 1; if (u.drown > 6) { if (u.k === "dwarf") die(w, u, L("death.drowned", "afogou-se")); else removeUnit(w, u) } else { var esc = neighbors(w, u.i, u, nb); if (esc > 0) u.i = nb[0] } }
    else u.drown = 0
  }
  checkFall(w)
  if (w.tick % 50 === 0) { w.wealth = computeWealth(w); checkMilestones(w) }
}
function actDwarf(w, u) {
  u.cool--
  var g = u.trait === "guloso" ? 1.3 : 1
  u.hunger += 0.22 * g; u.thirst += 0.33; u.sleep += (u.job && u.job.k === "sleep") ? 0 : 0.7
  if (u.hunger > 140 && w.tick % 12 === 0) { u.hp -= 1; if (u.hp <= 0) { die(w, u, L("death.starved", "morreu de fome")); return } }
  if (u.thirst > 140 && w.tick % 12 === 0) { u.hp -= 1; if (u.hp <= 0) { die(w, u, L("death.thirst", "morreu de sede")); return } }
  // Mending happens twice as fast beside a fire, which is the one thing in the
  // hold that helps a wounded dwarf without anybody working on it.
  // A scratch closes on its own, quickly. A bad wound closes too, but four
  // days a point — slow enough that an infirmary is worth building and not so
  // slow that a hold without one is condemned. Zero was tried: it cost two
  // dwarves a fortress, because the classic embark never has a bed at all.
  if (u.hp < u.maxhp && u.hunger < 80) {
    var rate = wounded(u) ? DAY * 4 : nearAny(w, cache(w).hearths, u.i, 3) ? 20 : 40
    if (w.tick % rate === 0) u.hp++
  }
  moodTick(w, u)
  if (w.units.indexOf(u) < 0) return
  if (u.mood_state === "berserk") {
    if (u.hp <= 0) { die(w, u, L("death.putdown", "foi abatido em fúria pelos companheiros")); return }
    var v = nearestUnit(w, u.i, function (o) { return o !== u && o.k === "dwarf" }, 1e9)
    if (v) { if (adjacent(u.i, v.i) || v.i === u.i) { if (u.cool <= 0) { attack(w, u, v); u.cool = 3 } } else if (!u.path || w.tick % 10 === 0) go(w, u, function (c) { return adjacent(c, v.i) }, v.i, 600); step(w, u) }
    return
  }
  if (u.mood_state === "melancholy") {
    if (u.mood >= 45) { u.mood_state = ""; announce(w, LF("msg.melancholy.out", "{0} saiu da melancolia.", u.name), 1) }
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
  // Thirst and hunger beat the militia's instincts once they are close to
  // killing. Five of the eight dwarves who ever reached thirst 125 did it with
  // goblins in the fortress: `fightOrFlee` runs before `needJob`, so they
  // fought and fled for days with a full cellar twenty cells away. A foe
  // within arm's reach still comes first — there is no drinking past that —
  // but a wave somewhere in the hold no longer outranks dying of thirst.
  var desperate = u.thirst > 115 || u.hunger > 115
  var cornered = desperate && !!nearestUnit(w, u.i, function (o) { return o !== u && hostile(o) }, 2)
  if (w.hostiles > 0 && (!desperate || cornered) && fightOrFlee(w, u)) return
  if (u.job && u.job.k === "fight") dropJob(w, u)
  if (u.job && u.job.k === "arm") {
    if (u.path) { if (step(w, u) < 0) dropJob(w, u); return }
    var wi = itemById(w, u.job.item); if (wi && wi.i === u.i) { removeItem(w, wi.id); u.weapon = true; thought(w, u, L("th.armed", "pegou em armas"), 1) }
    dropJob(w, u); return
  }
  if (u.job) { work(w, u); return }
  if (u.mood_state === "strange") return
  if (needJob(w, u)) return
  if (u.jobCool > 0) u.jobCool--
  else {
    // Which is consulted first stays fixed. Letting a dwarf who loves the
    // workshop check the economy before the player's designations did move
    // inclination from 12.6% to 14.9% of their work - and cost 28% of the
    // hold's output and three fortresses in eight. A leaning sorts the
    // choices inside each half; it does not get to reorder the halves.
    // A posted guard is not available for the player's designations either:
    // they were spending 5% of their watch digging, which is 5% of the watch
    // spent wherever the pick happened to be.
    if (!(u.militia && u.post >= 0 && w.build[u.post] === B_POST) && findDesignation(w, u)) return
    if (economyJob(w, u)) return
    u.jobCool = 4 + ri(w, 8)
  }
  idle(w, u)
  if (u.path) step(w, u)
}
function computeWealth(w) {
  var v = 0, i
  for (var k = 0; k < w.items.length; k++) {
    var iv = ITEM_VALUE[w.items[k].t] || 0
    // A quarter per grade, not a half: at a half the graded gear inflated the
    // hold's worth by a third, and worth is what sizes migrant waves and
    // ambushes — better steel was quietly buying a bigger siege.
    v += w.items[k].q > 1 ? Math.round(iv * (1 + 0.25 * (w.items[k].q - 1))) : iv
  }
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
  // Spikes in the entrance corridor, where everything that comes through the
  // gate has to walk: three foes each and then they are scrap. How many is the
  // preset's business — a garrison lines the corridor, a quiet valley needs one
  // for the look of the thing.
  var nTraps = opts.traps === undefined ? 2 : opts.traps
  var trapSpots = [[0, -3], [0, -2], [-1, -3], [1, -3], [-1, -2], [1, -2], [-2, -3], [2, -3]]
  for (k = 0; k < nTraps && k < trapSpots.length; k++) {
    var tp = place(w, cx, cy, z1, trapSpots[k][0], trapSpots[k][1], B_TRAP)
    if (tp >= 0) armTrap(w, tp)
  }
  // Guard posts: the first one behind the spikes, where everything that gets
  // through the gate arrives. A preset that wants a second line says so.
  var nPosts = opts.posts === undefined ? 1 : opts.posts
  var postSpots = [[2, -1], [-2, -1], [3, 1], [-3, 1]]
  for (k = 0; k < nPosts && k < postSpots.length; k++) place(w, cx, cy, z1, postSpots[k][0], postSpots[k][1], B_POST)
  // level 2: dining hall, kitchen, still, statue
  carveRect(w, cx, cy, z2, -8, -4, 8, 4)
  var tx = [-6, -4, -2, 2, 4, 6]
  for (k = 0; k < tx.length; k++) { place(w, cx, cy, z2, tx[k], -2, B_TABLE); place(w, cx, cy, z2, tx[k], 2, B_TABLE) }
  place(w, cx, cy, z2, -7, -4, B_KITCHEN); place(w, cx, cy, z2, -5, -4, B_STILL); place(w, cx, cy, z2, 7, -4, B_STILL)
  place(w, cx, cy, z2, 0, -4, B_STATUE); place(w, cx, cy, z2, 0, 4, B_STATUE)
  // A hall the hold arranged rather than merely dug: the fire in the middle of
  // it, a game table on each side of the fire, and a crystal column paid for
  // out of the jeweler's work. The ready hold is also the demonstration of
  // what can be built, so everything with an effect is in it somewhere.
  // `halls` is how much of the hall was arranged rather than merely dug: 0 for
  // a garrison that has not had time, 1 for a hold that has, 2 for one that has
  // nothing else to worry about. (0,0) is the staircase on every level.
  var halls = opts.halls === undefined ? 1 : opts.halls
  if (halls >= 1) {
    place(w, cx, cy, z2, 0, -2, B_HEARTH)
    place(w, cx, cy, z2, -1, 2, B_GAMES); place(w, cx, cy, z2, 1, 2, B_GAMES)
    place(w, cx, cy, z2, 8, 4, B_CRYSTAL)
  }
  // A pen on the farm level, where the grass is: goats need something growing
  // under them to be worth keeping.
  var nPens = opts.pens === undefined ? 1 : opts.pens
  for (k = 0; k < nPens && k < 3; k++) place(w, cx, cy, z1, -6 + k * 2, 3, B_PEN)
  if (halls >= 2) {
    place(w, cx, cy, z2, -8, -4, B_HEARTH); place(w, cx, cy, z2, 8, -4, B_CRYSTAL)
    place(w, cx, cy, z2, -1, -2, B_GAMES); place(w, cx, cy, z2, 1, -2, B_GAMES)
    place(w, cx, cy, z3, 0, 4, B_HEARTH)   // one by the dormitory, for the wounded
  }
  place(w, cx, cy, z2, -7, 0, B_TORCH); place(w, cx, cy, z2, 7, 0, B_TORCH)
  place(w, cx, cy, z2, -7, 4, B_TORCH); place(w, cx, cy, z2, 7, 4, B_TORCH)
  // level 3: dormitory west, industry east, training yard, stockpile for ore and bars
  carveRect(w, cx, cy, z3, -8, -4, 8, 4)
  var beds = 0, bedRows = [-4, -2, 2, 4]
  for (var r = 0; r < bedRows.length && beds < n + 4; r++) for (dx = -8; dx <= -1 && beds < n + 4; dx++) if (place(w, cx, cy, z3, dx, bedRows[r], B_BED) >= 0) beds++
  place(w, cx, cy, z3, 2, -4, B_SMELTER); place(w, cx, cy, z3, 4, -4, B_FORGE); place(w, cx, cy, z3, 6, -4, B_WORKSHOP); place(w, cx, cy, z3, 8, -4, B_WORKSHOP)
  place(w, cx, cy, z3, 3, 2, B_TRAINING); place(w, cx, cy, z3, 5, 2, B_TRAINING); place(w, cx, cy, z3, 7, 2, B_STATUE); place(w, cx, cy, z3, 8, -2, B_JEWELER)
  // An infirmary beside the dormitory: two beds, which is what a hold that
  // expects to be hurt keeps. A garrison that skipped the hall still gets them.
  var nBeds = opts.hospital === undefined ? 2 : opts.hospital
  for (k = 0; k < nBeds && k < 4; k++) place(w, cx, cy, z3, -8 + k, 4, B_HOSPITAL)
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
  // Water, if this map has any within reach of the hold: a well drawn from it
  // and a floodgate on the channel beside it, which together are the whole of
  // the hydraulics — one keeps everyone alive when the still runs dry, the
  // other decides when the water is allowed to move.
  if (opts.water !== false) {
    // A hold does not pitch camp next to a lake, so looking for natural water
    // put the well in a cavern on level 1, unreachable from the gate and
    // useless. It builds its own instead: a cistern cut into the rock beside
    // the stores, a well drawing from it, and a floodgate on the other side of
    // it — which is the whole of the hydraulics in three cells, and a warning
    // about what the lever does, since opening it floods the corridor.
    // The geometry matters, and the first version got it wrong: with the gate
    // behind the well the water could never reach it, because a well is
    // sealed. Both the well and the gate have to touch the cistern.
    //
    //   y-1:  [cistern][gate]      cut into the rock
    //   y  :  [well   ][hall]      the hall is already dug
    //
    // Shut, the cistern is a water supply. Open, it runs into the hall — which
    // is the trick, and the reason the lever announces itself.
    var cist = -1, wellAt = -1, gateAt = -1
    for (dy = -3; dy <= 3 && cist < 0; dy++) for (dx = -7; dx <= 6 && cist < 0; dx++) {
      if (!inb(cx + dx, cy + dy - 1, z1) || !inb(cx + dx + 1, cy + dy, z1)) continue
      var cAt = idx(cx + dx, cy + dy, z1), east = idx(cx + dx + 1, cy + dy, z1)
      var rock = cAt - W, rockE = rock + 1
      if (w.tile[cAt] !== T_OPEN || w.floor[cAt] === F_NONE || w.build[cAt] !== B_NONE || w.desig[cAt] !== DG_NONE) continue
      if (w.tile[east] !== T_OPEN || w.floor[east] === F_NONE || w.build[east] !== B_NONE) continue
      if (!solid(w.tile[rock]) || w.tile[rock] === T_TREE || !solid(w.tile[rockE]) || w.tile[rockE] === T_TREE) continue
      cist = rock; gateAt = rockE; wellAt = cAt
    }
    if (cist >= 0) {
      w.tile[cist] = T_WATER; w.floor[cist] = F_STONE; w.build[cist] = B_NONE; w.desig[cist] = DG_NONE
      carve(w, gateAt); w.build[gateAt] = B_FLOODGATE; w.desig[gateAt] = DG_NONE
      w.build[wellAt] = B_WELL
    }
    w.gatesOpen = false
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
  // something worth putting on a merchant's table: a hold with nothing to sell
  // meets its first caravan with nothing to say to it
  stockAt(w, stock3, "craft", 6); stockAt(w, stock3, "cutgem", 2)
  // the dwarves: a militia of a third, the rest by trade
  var roles = ["miner", "miner", "woodcutter", "farmer", "brewer", "smith", "builder", "farmer", "miner", "woodcutter", "crafter", "farmer", "smith", "miner", "brewer", "builder"]
  var militia = opts.militia !== undefined ? Math.min(n, opts.militia) : Math.max(2, Math.ceil(n / 3)), ri2 = 0
  if (opts.militia !== undefined) w.militiaWant = militia
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
  // A shaft already cut to the threshold of the deep: down to level 2, which is
  // iron and nothing awake, leaving the last level — the one with a 50% chance
  // of waking something and the tomb in its rock — for the player to decide on.
  // Cutting all the way down would spend the decision the preset exists for.
  if (opts.deepShaft) {
    // The showcase hold already carves down to its mine level, so the shaft
    // usually only has to continue from there — and on a low embark it is
    // already at level 2, which is why this walks down from wherever the
    // staircase actually ended instead of assuming.
    var dz = zm
    while (dz > 2) {
      var di = idx(cx, cy, dz - 1)
      if (!solid(w.tile[di])) break        // a cavern or magma: stop above it
      carve(w, di); w.build[di] = B_STAIR
      dz--
    }
    // What the hold dug long ago has nothing left to wake in it: the point of
    // this preset is the level below, which is untouched.
    if (!w.woke) w.woke = {}
    for (var wz = iz(w.depot); wz >= dz; wz--) w.woke[wz] = 1
    w.deepest = dz
  }
  // A hold that came together as families. Kin are decided on arrival, so a
  // preset that wants them has to say so: pairs of relatives, and half of those
  // pairs already inseparable. It is the fastest way to see what a loss costs
  // when it lands on somebody in particular.
  if (opts.kin) {
    var fam = dwarves(w)
    for (k = 0; k + 1 < fam.length; k += 2) {
      var a1 = fam[k], b1 = fam[k + 1]
      a1.kin = (a1.kin || []).concat([b1.id]); b1.kin = (b1.kin || []).concat([a1.id])
      if (k % 4 === 0) { bondMap(a1)[b1.id] = BOND_FRIEND + 5; bondMap(b1)[a1.id] = BOND_FRIEND + 5 }
    }
  }
  // An heirloom: one artifact the hold already owns, made about the thing the
  // preset is about — the founding for most, a relative for a hold of
  // families, the deep for one that has dug to it. A ready fortress with no
  // history at all is a contradiction, and this is the fastest way to show
  // what an artifact says about the place it came from.
  if (opts.heirloom !== false) {
    var hds = dwarves(w)
    if (hds.length) {
      var maker = hds[ri(w, hds.length)]
      var about = opts.kin ? { k: "kin", who: (function () {
          for (var hq = 0; hq < hds.length; hq++) if (hds[hq] !== maker) return hds[hq].name
          return maker.name
        })() }
        : opts.deepShaft ? { k: "depths", year: digDepth(w) }
        : { k: "founding", who: w.name, year: 1 }
      var hn = artifactName(w, opts.deepShaft ? "gem" : "stone", about).split("|")
      w.artifacts.push({ name: hn[0], title: hn[1], desc: hn[2], maker: maker.name, t: 0, about: about })
      w.stats.artifacts++
      var hi = stock3.length ? stock3[0] : w.depot
      var hit = addItem(w, "artifact", hi)
      hit.name = hn[0]; hit.title = hn[1]; hit.desc = hn[2]; hit.maker = maker.name
      maker.made = (maker.made || 0) + 1
    }
  }
  // Wave sizing for the showcase hold. The old curve (step 1.5, cap 12) wiped the
  // fortress in five seeds out of eight inside two years, which is a fine Dwarf
  // Fortress ending but a poor first impression for a preset named "ready".
  // Garrison and Siege pass their own, harsher numbers.
  w.scenario = { n: n, wave: 1, raidEvery: opts.raidEvery || DAY * 15, nextRaid: w.tick + (opts.firstRaid || DAY * 6),
    base: opts.waveBase || 3, step: opts.waveStep || 1, eliteFrom: opts.eliteFrom || 5, cap: opts.cap || 9 }
  // Merchants normally come on the third day of autumn, most of a year away
  // from a spring start. A preset that is about the economy says so and gets
  // them at once.
  if (opts.caravanIn) w.caravanAt = w.tick + DAY * opts.caravanIn
  if (opts.peaceful) { w.peaceful = true; w.scenario = null }
  w.preset = opts.name || "Fortaleza pronta"
  w.popCap = Math.max(w.popCap, n + 6)
  w.liquidBudget = { water: 60, magma: 30 }
  seedSeen(w)
  w.dirty = true; w.wealth = computeWealth(w)
  w.log = []; w.legends = []
  announce(w, LF("msg.scenario", "{0}: {1} já está escavada e guarnecida por {2} anões ({3} na milícia).{4}", w.preset || L("preset.scenario", "Cenário"), w.name, n, militia, w.scenario ? LF("msg.scenario.raid", " A primeira onda goblin vem em {0} dias.", Math.round(w.scenario.nextRaid / DAY)) : L("msg.scenario.peace", " Não há inimigos neste vale.")), 1)
  legend(w, LF("lg.scenario", "{0}: fundada com {1} anões.", w.preset || L("preset.scenario", "Cenário"), n))
  return w
}
function newScenario(seed, n, opts) { var w = newWorld(seed); return scenario(w, n, opts) }
// Starting presets for the menu. `kind` classic = the plain embark.
// The presets differ in more than how many goblins arrive: how much of the hall
// was arranged, how many spikes are in the corridor, whether it came together
// as families and whether the shaft already reaches the deep. Each one is a
// different part of the game to look at first.
var PRESETS = [
  { id: "classic", name: "Embarque clássico", desc: "Sete anões, uma carroça de suprimentos e uma colina. Do zero, como manda a tradição.", kind: "classic", n: 7 },
  { id: "ready", name: "Fortaleza pronta", desc: "Doze anões com ofícios e uma fortaleza já escavada em quatro níveis, com lareira, mesas de jogo e estacas na entrada.", kind: "scenario", n: 12, opts: { name: "Fortaleza pronta" } },
  { id: "garrison", name: "Guarnição", desc: "Dez anões, seis na milícia, e o corredor da entrada cheio de estacas. Ondas mais cedo e mais frequentes: um teste de defesa.", kind: "scenario", n: 10, opts: { name: "Guarnição", militia: 6, firstRaid: DAY * 3, raidEvery: DAY * 9, waveBase: 4, waveStep: 2, eliteFrom: 3, cap: 14, halls: 0, traps: 6, posts: 3 } },
  { id: "peaceful", name: "Vale tranquilo", desc: "Fortaleza pronta, sem goblins nem lobos, o salão inteiro arrumado e uma caravana chegando no segundo dia. Para ver a economia, o comércio e os humores sem sangue.", kind: "scenario", n: 12, opts: { name: "Vale tranquilo", peaceful: true, halls: 2, traps: 0, posts: 0, caravanIn: 2 } },
  { id: "kinfolk", name: "Casa cheia", desc: "Dezesseis anões que chegaram em família, metade deles inseparável, num salão completo. As histórias começam de véspera — e a primeira perda dói.", kind: "scenario", n: 16, opts: { name: "Casa cheia", kin: true, halls: 2, traps: 2, cap: 10 } },
  { id: "depths", name: "Soleira das profundezas", desc: "Doze anões e um poço já cavado até o ferro. O último nível, onde algo dorme desde antes da fortaleza, fica para você decidir.", kind: "scenario", n: 12, opts: { name: "Soleira das profundezas", deepShaft: true, halls: 1, traps: 4, militia: 5, posts: 2 } },
  { id: "siege", name: "Cerco", desc: "Oito anões, ondas grandes desde o segundo dia com veteranos, e estacas por todo o corredor. Ninguém espera que dure.", kind: "scenario", n: 8, opts: { name: "Cerco", militia: 4, firstRaid: DAY * 2, raidEvery: DAY * 7, waveBase: 5, waveStep: 2.5, eliteFrom: 2, cap: 16, halls: 0, traps: 8, posts: 4 } }
]
// A preset's name and blurb are text like any other, so they go through the
// table. The fallback is the Portuguese in the list above, which is how every
// other string in the simulation works.
function presetName(pr) { return pr ? L("preset." + pr.id + ".name", pr.name) : "" }
function presetDesc(pr) { return pr ? L("preset." + pr.id + ".desc", pr.desc) : "" }
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
// A designation nobody can stand next to is drawn red, which is easy to miss
// on a level that is still fog: the marks are the only thing showing, and the
// level just looks unexplored. Say it out loud once, naming the level, because
// what is missing is almost always a staircase down into it.
//
// Cutting that staircase automatically was tried and reverted. It works — the
// stranded room starts the next morning — but going deeper is the most
// expensive decision in the game, and the hold took it on its own: across
// sixteen seeds the miners drove to the bottom level in the first spring,
// days four to eleven, woke what sleeps there with seven dwarves and no
// infrastructure, and three fortresses in sixteen died of it (14/16 survivors
// became 11/16). Restricting it to levels already dug would not have saved the
// case it was written for, where the level below was untouched. So the descent
// stays the player's, and this only makes sure they are told.
function noAccessTick(w) {
  var ds = cache(w).desigs, ok = desigOk(w), byZ = {}, worst = -1, n = 0
  for (var k = 0; k < ds.length; k++) {
    var di = ds[k]; if (!di || ok[di]) continue
    var dz = iz(di); byZ[dz] = (byZ[dz] || 0) + 1; n++
    if (worst < 0 || byZ[dz] > byZ[worst]) worst = dz
  }
  if (n < 4) { delete w.noaccess; return }
  if (w.noaccess) return
  w.noaccess = Math.max(1, w.tick)
  announce(w, LF("msg.noaccess", "{0} escavação(ões) em z{1} não têm acesso: ninguém consegue chegar lá. Falta uma escada descendo para o nível.", byZ[worst], worst), 2)
}
// Everything the chronicle says about one dwarf. The legends are sentences
// with names in them, so this is a substring match on the full name — which is
// exactly why `dwarfName` builds unique ones. A dead dwarf's lines survive
// them, which is the point of keeping a chronicle at all.
function lifeLines(w, name) {
  var out = []
  if (!name) return out
  for (var k = 0; k < w.legends.length; k++) if (w.legends[k].m.indexOf(name) >= 0) out.push(w.legends[k])
  return out
}
// Every dwarf the hold remembers, living first and then the dead, most
// recently lost first. One list, because a life does not stop being a life.
function lives(w) {
  var out = [], ds = dwarves(w), k
  ds.sort(function (a, b) { return a.born - b.born })
  for (k = 0; k < ds.length; k++) out.push({ name: ds[k].name, id: ds[k].id, alive: true, u: ds[k] })
  var dead = (w.dead || []).slice()
  dead.sort(function (a, b) { return b.t - a.t })
  for (k = 0; k < dead.length; k++) out.push({ name: dead[k].name, id: 0, alive: false, t: dead[k].t, how: dead[k].how })
  return out
}
function countUnreachable(w) { var n = 0, ds = cache(w).desigs, ok = desigOk(w); for (var k = 0; k < ds.length; k++) if (ds[k] && !ok[ds[k]]) n++; return n }
var TILE_KEY = { 1: "soil", 2: "stone", 3: "ore", 4: "gem", 5: "tree", 6: "water", 7: "magma", 8: "fungus", 9: "shrub" }
var FLOOR_KEY = { 0: "none", 1: "soil", 2: "stone", 3: "grass", 4: "moss" }
var TILE_PT = { 1: "solo", 2: "rocha", 3: "veio de minério", 4: "gemas na rocha", 5: "árvore", 6: "água", 7: "magma", 8: "cogumelo gigante", 9: "arbusto" }
var FLOOR_PT = { 0: "céu aberto", 1: "chão de terra", 2: "chão de pedra", 3: "grama", 4: "musgo de caverna" }
function tileName(w, i) {
  var t = w.tile[i], f = w.floor[i], b = w.build[i]
  if (t !== T_OPEN) return L("tile." + TILE_KEY[t], TILE_PT[t])
  var fl = L("floor." + FLOOR_KEY[f], FLOOR_PT[f])
  if (b) return buildName(b) + (b === B_FARM ? (w.grow[i] >= 200 ? L("farm.ripe", " (madura)") : w.grow[i] > 0 ? L("farm.growing", " (crescendo)") : L("farm.empty", " (vazia)")) : "") + " · " + fl
  return fl
}
var JOB_PT = { dig: "cavando", digstair: "cavando escada", chop: "cortando", build: "construindo", plant: "plantando", harvest: "colhendo",
  brew: "fermentando", craft: "criando", haul: "carregando", eat: "comendo", forage: "coletando", drink: "bebendo", drinkwater: "bebendo água",
  sleep: "dormindo", fight: "lutando", arm: "pegando arma", mood: "humor estranho", flee: "fugindo", idle: "ocioso",
  equip: "equipando", train: "treinando", cook: "cozinhando", smelt: "fundindo", forge: "forjando", cut: "lapidando", setgem: "fazendo joia",
  bury: "sepultando os mortos", mourn: "velando os mortos", play: "jogando", station: "indo para o posto",
  trade: "levando à caravana", rest: "de cama, ferido", tend: "cuidando de um ferido" }
function jobName(u) {
  if (!u.job) return u.mood_state === "melancholy" ? L("mood.melancholy", "melancólico") : u.mood_state === "berserk" ? L("mood.berserk", "furioso") : L("job.idle", "ocioso")
  var j = u.job, key = j.k === "dig" && j.stair ? "digstair" : j.k
  var n = L("job." + key, JOB_PT[key] || j.k)
  if (j.k === "forge" && j.product) n += " " + itemName(j.product)
  if (j.k === "build") n += " " + buildName(j.bt)
  return n
}
function moodWord(u) {
  if (u.mood_state === "melancholy") return L("mood.melancholy", "melancólico")
  if (u.mood_state === "berserk") return L("mood.berserk", "furioso")
  if (u.mood_state === "strange") return L("mood.strange", "possuído")
  if (u.mood >= 75) return L("mood.ecstatic", "extasiado")
  if (u.mood >= 55) return L("mood.content", "contente")
  if (u.mood >= 35) return L("mood.ok", "ok")
  if (u.mood >= 18) return L("mood.unhappy", "infeliz")
  return L("mood.miserable", "miserável")
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
    if (k === "claim" || k === "unreach" || k === "cache" || k === "counts" || k === "haulable" || k === "dirty" || k === "hostiles") continue
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
    if (k === "tile" || k === "floor" || k === "build" || k === "desig" || k === "dbuild" || k === "grow" || k === "seen" || k === "ground") w[k] = unrle(o[k], k === "ground" ? N : NN)
    else w[k] = o[k]
  }
  w.claim = new Int32Array(NN); w.unreach = {}; w.dirty = true
  if (!w.fallen) w.fallen = false
  // an older save may be missing counters the Legends page prints unguarded
  var st = w.stats || (w.stats = {})
  for (var sk = 0; sk < STAT_KEYS.length; sk++) if (typeof st[STAT_KEYS[sk]] !== "number") st[STAT_KEYS[sk]] = 0
  if (!w.orders) w.orders = []
  // A save from before the fog, or from before the rule changed, is re-seeded
  // from what the hold can walk to — so everything it actually dug stays
  // known, and only the walls glimpsed in passing have to be seen again.
  if (!w.seen || !w.seen.length || w.seenV !== SEEN_V) seedSeen(w)
  if (typeof w.graveyard !== "number") w.graveyard = -1
  if (!w.done) w.done = {}
  if (typeof w.legendary !== "number") w.legendary = 0
  if (typeof w.siege !== "number") w.siege = 0
  if (typeof w.siegeSince !== "number") w.siegeSince = 0
  if (typeof w.baron !== "number") w.baron = 0
  if (typeof w.pressure !== "number") w.pressure = 0
  if (!w.woke) w.woke = {}
  if (typeof w.stirred !== "number") w.stirred = 0
  if (typeof w.tomb !== "number") w.tomb = 0
  if (w.court === undefined) w.court = null
  if (typeof w.pact !== "number") w.pact = 0
  if (typeof w.grudge !== "number") w.grudge = 0
  if (typeof w.gatesOpen !== "boolean") w.gatesOpen = false
  if (typeof w.militiaWant !== "number") w.militiaWant = 0
  if (!w.trade) w.trade = { sell: {}, buy: {}, delivered: {}, closed: false }
  if (typeof w.caravanAt !== "number") w.caravanAt = 0
  if (w.crown === undefined) w.crown = null
  if (typeof w.blessed !== "number") w.blessed = 0
  if (typeof w.capital !== "number") w.capital = 0
  if (typeof w.monarch !== "number") w.monarch = 0
  if (typeof w.royalRaid !== "number") w.royalRaid = 0
  if (typeof w.royalWarned !== "number") w.royalWarned = 0
  if (typeof w.royalCame !== "number") w.royalCame = 0
  for (var aq = 0; aq < (w.artifacts || []).length; aq++) if (w.artifacts[aq].about === undefined) w.artifacts[aq].about = null
  if (typeof w.demandSince !== "number") w.demandSince = 0
  if (w.demand === undefined) w.demand = null
  // units carrying items keep their claims; jobs are dropped so no stale paths survive
  for (var u = 0; u < w.units.length; u++) {
    var un = w.units[u]; un.path = null; un.pi = 0; un.job = null
    if (un.carry) { var it = itemById(w, un.carry); if (it) { it.by = 0; it.res = 0; it.i = un.i } un.carry = 0 }
    // a dwarf saved before inclinations existed gets theirs now, or they would
    // go through life with no trade they love and none they cannot stand
    if (un.k === "dwarf") { if (!un.bonds) un.bonds = {}; if (!un.kin) un.kin = []; if (typeof un.grief !== "number") un.grief = 0; if (typeof un.post !== "number") un.post = -1 }
    if (un.k === "dwarf" && !un.likes) {
      un.likes = pick(w, WORK_CATS)
      un.dislikes = pick(w, WORK_CATS)
      while (un.dislikes === un.likes) un.dislikes = pick(w, WORK_CATS)
      un.frust = un.frust || 0; un.avoid = un.avoid || ""; un.avoidUntil = un.avoidUntil || 0
    }
  }
  for (var i = 0; i < w.items.length; i++) { w.items[i].res = 0; w.items[i].by = 0 }
  // A hold saved before any of this had no families, and kin are only ever
  // decided on arrival — so without this pass the dwarves already living there
  // would go to their graves as strangers. Done once, behind a flag: rolling it
  // on every load would hand out relatives for reloading the game.
  if (!w.kinV) {
    w.kinV = 1
    var ex = dwarves(w)
    for (var kq = 0; kq < ex.length; kq++) if (!ex[kq].kin || !ex[kq].kin.length) maybeKin(w, ex[kq])
  }
  return w
}
function newWorldEmpty() {
  return { v: 1, seed: 0, rs: 0, tick: 0, tile: new Uint8Array(NN), floor: new Uint8Array(NN), build: new Uint8Array(NN), desig: new Uint8Array(NN),
    dbuild: new Uint8Array(NN), grow: new Uint8Array(NN), seen: new Uint8Array(NN), ground: new Uint8Array(N), items: [], units: [], nextId: 1, log: [], legends: [], artifacts: [],
    dead: [], orders: [], graveyard: -1, done: {}, legendary: 0, siege: 0, pressure: 0, woke: {}, stirred: 0, tomb: 0, baron: 0, demand: null, demandSince: 0, siegeSince: 0, name: "", wealth: 0, alerts: 0, popCap: 20, liquidBudget: { water: 60, magma: 30 }, caravan: null, raid: null, lockdown: false, depot: -1,
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
