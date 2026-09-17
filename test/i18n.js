// The labels in both languages, and the fallback with nothing injected.
//   node test/i18n.js
const fs = require("fs"), path = require("path")
const dir = path.join(__dirname, "..")
function load(file, exports) {
  const src = fs.readFileSync(path.join(dir, file), "utf8").replace(".pragma library", "")
  return new Function(src + "; return { " + exports + " }")()
}
const I18n = load("I18n.js", "LANGS, t, tf, plural, known, nextLang, langName, fromLocale, inSeason, STRINGS")
const S = load("sim.js", "newScenario, tick, dwarves, setI18n, setLang, curLang, jobName, moodWord, tileName, skillTitle, itemName, workName, buildName, seasonName, seasonIn, orderName, idx, ORDER_KINDS, YEAR, date")

let fails = 0
function ok(cond, what) { if (!cond) { fails++; console.log("  FALHOU: " + what) } }

// 1. fallback: nada injetado, tudo em português
ok(S.itemName("pick") === "picareta", "fallback pt de item.pick, veio " + S.itemName("pick"))
ok(S.buildName(5) === "destilaria", "fallback pt de build.still, veio " + S.buildName(5))
console.log("sem i18n injetado (fallback pt): pick=" + S.itemName("pick") + " · still=" + S.buildName(5))

// 2. os dois idiomas
S.setI18n(I18n, "en")
const w = S.newScenario(7, 12)
for (let k = 0; k < 400; k++) S.tick(w)
const show = () => {
  const u = S.dwarves(w)[0]
  return {
    lang: S.curLang(),
    item: S.itemName("pick") + " / " + S.itemName("bar"),
    build: S.buildName(5) + " / " + S.buildName(17),
    work: S.workName("craft") + " / " + S.workName("haul"),
    season: S.seasonName(S.date(w).seasonName) + " (" + S.seasonIn(S.date(w).seasonName) + ")",
    dwarf: S.skillTitle(u) + " · " + S.jobName(u) + " · " + S.moodWord(u),
    tile: S.tileName(w, w.depot),
    orders: S.ORDER_KINDS.slice(0, 4).map(S.orderName).join(", ")
  }
}
const en = show()
S.setLang("pt")
const pt = show()
for (const k of Object.keys(en)) {
  console.log("  " + k.padEnd(8) + " en: " + en[k])
  console.log("  " + "".padEnd(8) + " pt: " + pt[k])
  ok(k === "lang" || en[k] !== pt[k] || /ok/.test(en[k]), k + " igual nos dois idiomas: " + en[k])
}

// 3. chave faltando aparece como chave, não como vazio
ok(I18n.t("en", "nao.existe") === "nao.existe", "chave faltando devia voltar como chave")
ok(I18n.fromLocale("pt_BR.UTF-8") === "pt" && I18n.fromLocale("en_US") === "en", "fromLocale")
ok(I18n.plural("pt", 1, "x.one", "x.many") === "1 x.one", "plural devolve a chave quando falta")

// 4. toda chave do en existe no pt, e vice-versa
const en_keys = Object.keys(I18n.STRINGS.en), pt_keys = Object.keys(I18n.STRINGS.pt)
const missing_pt = en_keys.filter(k => !(k in I18n.STRINGS.pt))
const missing_en = pt_keys.filter(k => !(k in I18n.STRINGS.en))
ok(missing_pt.length === 0, "faltam no pt: " + missing_pt.join(", "))
ok(missing_en.length === 0, "faltam no en: " + missing_en.join(", "))
console.log(`\n${en_keys.length} chaves em cada idioma · ${fails} falha(s)`)
process.exit(fails ? 1 : 0)
