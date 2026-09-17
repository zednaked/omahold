.pragma library

// Every word that reaches the screen, in both languages.
//
// Rules this follows, taken from the same file in omarchy-ganja:
//
// 1. **The key is never the text.** `t()` returns the key itself when it is
//    missing from both languages, so a forgotten string shows up on screen as
//    `msg.migrants` and someone fixes it. Returning empty would hide it.
//
// 2. **What the save stores is the id, never the label.** A world is written
//    with `"pick"`, `"PreFlower"`-style ids and tick numbers; nothing in
//    `world.json` changes shape when the language changes, so a hold started
//    in Portuguese opens in English.
//
// 3. **The chronicle keeps the language it was written in.** `w.log`,
//    `w.legends`, `w.dead[].how` and the artifact descriptions are finished
//    sentences by the time they are stored - they are a diary, and a diary is
//    not retranslated. Switching language changes what is written from then
//    on. Storing keys plus arguments for all 94 of them would retranslate the
//    past, and was judged not worth the shape it would force on the save.
//
// 4. **Gender and number are per string, not per word.** Portuguese needs
//    "no outono" and "na primavera", "1 anão perdido" and "2 anões perdidos".
//    A flat word-for-word dictionary gets that wrong half the time, so the
//    strings carry their own articles and `plural()` takes both forms.

var LANGS = ["en", "pt"]

function langName(lang) { return lang === "pt" ? "português" : "English" }
function nextLang(lang) { return lang === "pt" ? "en" : "pt" }
function known(lang) { return LANGS.indexOf(lang) >= 0 }

// The language the system asks for, for the first load: someone who installed
// this on a pt_BR machine should not have to find a menu to read their own
// language. After that the save decides - an explicit choice outranks the
// environment.
function fromLocale(name) {
  return String(name || "").toLowerCase().indexOf("pt") === 0 ? "pt" : "en"
}

function t(lang, key) {
  var tbl = STRINGS[lang]
  if (tbl && tbl[key] !== undefined) return tbl[key]
  var en = STRINGS.en
  if (en && en[key] !== undefined) return en[key]
  return key
}

// `{0}`…`{4}` in the string, filled in order.
function tf(lang, key, a, b, c, d, e) {
  var s = t(lang, key), args = [a, b, c, d, e]
  for (var k = 0; k < args.length; k++) {
    if (args[k] === undefined) continue
    s = s.split("{" + k + "}").join(String(args[k]))
  }
  return s
}

// Both forms, because Portuguese does not agree the way English does.
function plural(lang, n, oneKey, manyKey) {
  return n + " " + t(lang, n === 1 ? oneKey : manyKey)
}

// A season with the right preposition: "in spring" / "na primavera".
function inSeason(lang, season) { return tf(lang, "season.in." + season, "") }

var STRINGS = {

  // ---- English -------------------------------------------------------------
  en: {
    // seasons, by id
    "season.primavera": "spring",
    "season.verão": "summer",
    "season.outono": "autumn",
    "season.inverno": "winter",
    "season.in.primavera": "in spring",
    "season.in.verão": "in summer",
    "season.in.outono": "in autumn",
    "season.in.inverno": "in winter",
    "season.came": "{0} has come.",

    // traits
    "trait.teimoso": "stubborn",
    "trait.alegre": "cheerful",
    "trait.melancólico": "melancholic",
    "trait.guloso": "greedy",
    "trait.valente": "brave",
    "trait.preguiçoso": "lazy",
    "trait.curioso": "curious",
    "trait.rabugento": "grouchy",

    // items
    "item.log": "log",
    "item.stone": "stone",
    "item.ore": "ore",
    "item.gem": "gem",
    "item.food": "food",
    "item.booze": "drink",
    "item.craft": "craft",
    "item.weapon": "weapon",
    "item.artifact": "artifact",
    "item.remains": "remains",
    "item.bar": "metal bar",
    "item.pick": "pick",
    "item.axe": "axe",
    "item.armor": "armor",
    "item.meal": "meal",
    "item.cutgem": "cut gem",
    "item.jewel": "jewel",

    // kinds of work, as they read in a sentence
    "work.mine": "mining",
    "work.wood": "woodcutting",
    "work.farm": "the fields",
    "work.build": "building",
    "work.craft": "the workshop",
    "work.brew": "brewing",
    "work.fight": "drilling",
    "work.haul": "hauling",

    // skills
    "skill.mine": "mining",
    "skill.wood": "woodcutting",
    "skill.farm": "farming",
    "skill.build": "masonry",
    "skill.craft": "crafting",
    "skill.fight": "fighting",
    "skill.brew": "brewing",

    // titles
    "title.legendary": "Legendary ",
    "title.master": "Master ",
    "title.apprentice": "Apprentice ",
    "title.peasant": "peasant",
    "title.mine": "miner",
    "title.wood": "woodcutter",
    "title.farm": "farmer",
    "title.build": "mason",
    "title.craft": "crafter",
    "title.fight": "fighter",
    "title.brew": "brewer",

    // buildings
    "build.stair": "staircase",
    "build.bed": "bed",
    "build.table": "table",
    "build.farm": "plot",
    "build.still": "still",
    "build.workshop": "workshop",
    "build.wall": "wall",
    "build.door": "door",
    "build.stock": "stockpile",
    "build.statue": "statue",
    "build.kitchen": "kitchen",
    "build.smelter": "smelter",
    "build.forge": "forge",
    "build.torch": "torch",
    "build.training": "drill yard",
    "build.jeweler": "jeweler",
    "build.grave": "grave",

    // tiles
    "tile.soil": "soil",
    "tile.stone": "rock",
    "tile.ore": "ore vein",
    "tile.gem": "gems in rock",
    "tile.tree": "tree",
    "tile.water": "water",
    "tile.magma": "magma",
    "tile.fungus": "giant mushroom",
    "tile.shrub": "shrub",
    "floor.none": "open sky",
    "floor.soil": "dirt floor",
    "floor.stone": "stone floor",
    "floor.grass": "grass",
    "floor.moss": "cave moss",
    "farm.ripe": " (ripe)",
    "farm.growing": " (growing)",
    "farm.empty": " (empty)",

    // jobs
    "job.idle": "idle",
    "job.dig": "digging",
    "job.digstair": "digging stairs",
    "job.chop": "chopping",
    "job.build": "building",
    "job.plant": "planting",
    "job.harvest": "harvesting",
    "job.brew": "brewing",
    "job.craft": "crafting",
    "job.haul": "hauling",
    "job.eat": "eating",
    "job.forage": "foraging",
    "job.drink": "drinking",
    "job.drinkwater": "drinking water",
    "job.sleep": "sleeping",
    "job.fight": "fighting",
    "job.arm": "taking up arms",
    "job.mood": "strange mood",
    "job.flee": "fleeing",
    "job.equip": "equipping",
    "job.train": "drilling",
    "job.cook": "cooking",
    "job.smelt": "smelting",
    "job.forge": "forging",
    "job.cut": "cutting a gem",
    "job.setgem": "setting a jewel",
    "job.bury": "burying the dead",

    // moods
    "mood.melancholy": "melancholic",
    "mood.berserk": "berserk",
    "mood.strange": "possessed",
    "mood.ecstatic": "ecstatic",
    "mood.content": "content",
    "mood.ok": "ok",
    "mood.unhappy": "unhappy",
    "mood.miserable": "miserable",

    // order kinds
    "order.booze": "drink",
    "order.meal": "meals",
    "order.bar": "metal bars",
    "order.pick": "picks",
    "order.axe": "axes",
    "order.weapon": "weapons",
    "order.armor": "armor",
    "order.craft": "crafts",
    "order.metalcraft": "metal crafts",
    "order.cutgem": "cut gems",
    "order.jewel": "jewels"
  },

  // ---- português -----------------------------------------------------------
  pt: {
    "season.primavera": "primavera",
    "season.verão": "verão",
    "season.outono": "outono",
    "season.inverno": "inverno",
    "season.in.primavera": "na primavera",
    "season.in.verão": "no verão",
    "season.in.outono": "no outono",
    "season.in.inverno": "no inverno",
    "season.came": "Chegou {0}.",

    "trait.teimoso": "teimoso",
    "trait.alegre": "alegre",
    "trait.melancólico": "melancólico",
    "trait.guloso": "guloso",
    "trait.valente": "valente",
    "trait.preguiçoso": "preguiçoso",
    "trait.curioso": "curioso",
    "trait.rabugento": "rabugento",

    "item.log": "tora",
    "item.stone": "pedra",
    "item.ore": "minério",
    "item.gem": "gema",
    "item.food": "comida",
    "item.booze": "bebida",
    "item.craft": "artesanato",
    "item.weapon": "arma",
    "item.artifact": "artefato",
    "item.remains": "restos",
    "item.bar": "barra de metal",
    "item.pick": "picareta",
    "item.axe": "machado",
    "item.armor": "armadura",
    "item.meal": "refeição",
    "item.cutgem": "gema lapidada",
    "item.jewel": "joia",

    "work.mine": "a mineração",
    "work.wood": "a lenha",
    "work.farm": "a lavoura",
    "work.build": "a construção",
    "work.craft": "a oficina",
    "work.brew": "a cervejaria",
    "work.fight": "o treino",
    "work.haul": "o transporte",

    "skill.mine": "mineração",
    "skill.wood": "lenha",
    "skill.farm": "lavoura",
    "skill.build": "construção",
    "skill.craft": "artesanato",
    "skill.fight": "luta",
    "skill.brew": "cervejaria",

    "title.legendary": "Lendário ",
    "title.master": "Mestre ",
    "title.apprentice": "Aprendiz de ",
    "title.peasant": "camponês",
    "title.mine": "minerador",
    "title.wood": "lenhador",
    "title.farm": "fazendeiro",
    "title.build": "pedreiro",
    "title.craft": "artesão",
    "title.fight": "guerreiro",
    "title.brew": "cervejeiro",

    "build.stair": "escada",
    "build.bed": "cama",
    "build.table": "mesa",
    "build.farm": "plantação",
    "build.still": "destilaria",
    "build.workshop": "oficina",
    "build.wall": "muro",
    "build.door": "porta",
    "build.stock": "estoque",
    "build.statue": "estátua",
    "build.kitchen": "cozinha",
    "build.smelter": "fundição",
    "build.forge": "forja",
    "build.torch": "tocha",
    "build.training": "campo de treino",
    "build.jeweler": "joalheria",
    "build.grave": "túmulo",

    "tile.soil": "solo",
    "tile.stone": "rocha",
    "tile.ore": "veio de minério",
    "tile.gem": "gemas na rocha",
    "tile.tree": "árvore",
    "tile.water": "água",
    "tile.magma": "magma",
    "tile.fungus": "cogumelo gigante",
    "tile.shrub": "arbusto",
    "floor.none": "céu aberto",
    "floor.soil": "chão de terra",
    "floor.stone": "chão de pedra",
    "floor.grass": "grama",
    "floor.moss": "musgo de caverna",
    "farm.ripe": " (madura)",
    "farm.growing": " (crescendo)",
    "farm.empty": " (vazia)",

    "job.idle": "ocioso",
    "job.dig": "cavando",
    "job.digstair": "cavando escada",
    "job.chop": "cortando",
    "job.build": "construindo",
    "job.plant": "plantando",
    "job.harvest": "colhendo",
    "job.brew": "fermentando",
    "job.craft": "criando",
    "job.haul": "carregando",
    "job.eat": "comendo",
    "job.forage": "coletando",
    "job.drink": "bebendo",
    "job.drinkwater": "bebendo água",
    "job.sleep": "dormindo",
    "job.fight": "lutando",
    "job.arm": "pegando arma",
    "job.mood": "humor estranho",
    "job.flee": "fugindo",
    "job.equip": "equipando",
    "job.train": "treinando",
    "job.cook": "cozinhando",
    "job.smelt": "fundindo",
    "job.forge": "forjando",
    "job.cut": "lapidando",
    "job.setgem": "fazendo joia",
    "job.bury": "sepultando os mortos",

    "mood.melancholy": "melancólico",
    "mood.berserk": "furioso",
    "mood.strange": "possuído",
    "mood.ecstatic": "extasiado",
    "mood.content": "contente",
    "mood.ok": "ok",
    "mood.unhappy": "infeliz",
    "mood.miserable": "miserável",

    "order.booze": "cerveja",
    "order.meal": "refeições",
    "order.bar": "barras de metal",
    "order.pick": "picaretas",
    "order.axe": "machados",
    "order.weapon": "armas",
    "order.armor": "armaduras",
    "order.craft": "artesanato",
    "order.metalcraft": "artesanato de metal",
    "order.cutgem": "gemas lapidadas",
    "order.jewel": "joias"
  }
}
