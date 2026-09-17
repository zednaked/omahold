import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import "sim.js" as Sim
import "palette.js" as Pal

// The overlay: the map of one z-level, a sidebar, the announcements, and the
// keys to give orders. Everything here is a view over World; nothing is
// simulated in this file and nothing is drawn while it is closed.
//
// The look is Dwarf Fortress in the theme's clothes: terrain as flat tinted
// cells (with a little per-cell grain), buildings, items and creatures as
// glyphs. Open air shows the level below, dimmed, the way DF does - that is
// what makes eight z-levels legible on one screen. `g` switches to pure
// glyphs for the classic look.
Item {
  id: root

  property var shell: null
  property var manifest: null

  function open(payload) { World.open = true }
  function close() { World.open = false }

  readonly property bool opened: World.open
  readonly property string mono: Style.fontFamily

  // ---- ui state ---------------------------------------------------------------
  property int cx: 24
  property int cy: 15
  property string tool: "look"          // look dig stair chop build cancel remove
  property int buildType: 0
  property bool buildMenu: false
  property int selStart: -1
  property string page: "units"         // units local legends help
  property string status: ""
  property bool dragging: false
  property int dragStart: -1
  property int unitCycle: 0

  readonly property int vz: World.viewZ
  readonly property var pal: World.pal

  function flash(msg) { root.status = msg; statusTimer.restart() }
  Timer { id: statusTimer; interval: 3200; onTriggered: root.status = "" }

  function cursorIdx() { return Sim.idx(root.cx, root.cy, root.vz) }
  function setZ(nz) { World.followId = 0; World.viewZ = Math.max(0, Math.min(Sim.D - 1, nz)) }
  function moveCursor(dx, dy) {
    root.cx = Math.max(0, Math.min(Sim.W - 1, root.cx + dx))
    root.cy = Math.max(0, Math.min(Sim.H - 1, root.cy + dy))
    if (World.followId) World.followId = 0
  }

  Connections {
    target: World
    function onMenuChanged() { if (World.menu) root.rebuildMenu() }
    function onSlotsChanged() { if (World.menu) root.rebuildMenu() }
    function onTicked() {
      if (!World.open) return
      if (World.followId) { var u = Sim.unitById(World.w, World.followId); if (u) { root.cx = Sim.ix(u.i); root.cy = Sim.iy(u.i) } }
    }
    function onWorldReplaced() { root.selStart = -1; root.tool = "look"; root.buildMenu = false; if (World.w) { root.cx = Sim.ix(World.w.depot); root.cy = Sim.iy(World.w.depot) } }
  }

  // ---- tools ------------------------------------------------------------------
  readonly property var buildKeys: ({ b: Sim.B_BED, t: Sim.B_TABLE, f: Sim.B_FARM, w: Sim.B_WALL, p: Sim.B_DOOR, e: Sim.B_STOCK, o: Sim.B_WORKSHOP, d: Sim.B_STILL, s: Sim.B_STATUE,
                                      c: Sim.B_KITCHEN, u: Sim.B_SMELTER, j: Sim.B_FORGE, l: Sim.B_TORCH, r: Sim.B_TRAINING, g: Sim.B_JEWELER })
  readonly property var buildOrder: ["b", "t", "f", "e", "p", "w", "l", "o", "d", "c", "u", "j", "g", "r", "s"]
  readonly property var buildGlyph: ({ 1: "X", 2: "θ", 3: "Π", 4: "≡", 5: "¶", 6: "⌂", 7: "O", 8: "+", 9: "=", 10: "Ω", 11: "π", 12: "∆", 13: "‡", 14: "¡", 15: "Ξ", 16: "◊", 17: "†" })
  // a list, not a binding: it has to be rebuilt when the language changes
  function viewModeList() {
    return [["normal", root.t("view.normal"), root.t("m.view.normal")],
            ["light", root.t("view.light"), root.t("m.view.light")],
            ["mood", root.t("view.mood"), root.t("m.view.mood")],
            ["access", root.t("view.access"), root.t("m.view.access")]]
  }
  readonly property var viewModes: root.viewModeList()
  function setViewMode(m) { World.viewMode = m; for (var k = 0; k < root.viewModes.length; k++) if (root.viewModes[k][0] === m) root.flash("ver: " + root.viewModes[k][1] + " — " + root.viewModes[k][2]) }
  function cycleViewMode() { var i = 0; for (var k = 0; k < root.viewModes.length; k++) if (root.viewModes[k][0] === World.viewMode) i = k; setViewMode(root.viewModes[(i + 1) % root.viewModes.length][0]) }
  // everything on screen goes through World, which owns the language
  function t(key) { return World.t(key) }
  function tf(key, a, b, c, d, e) { return World.tf(key, a, b, c, d, e) }
  readonly property var toolKeys: ({ look: "tool.look", dig: "tool.dig", stair: "tool.stair", chop: "tool.chop", build: "tool.build", cancel: "tool.cancel", remove: "tool.remove" })
  function toolName(tool) { return World.t(root.toolKeys[tool] || "tool.look") }

  function toolLabel() {
    if (root.tool === "build") { var bn = Sim.buildName(root.buildType); return bn ? root.tf("fl.build", bn) : root.t("tool.build") }
    return root.toolName(root.tool)
  }
  function isAreaTool() { return root.tool !== "look" }

  function apply(a, b) {
    var w = World.w; if (!w) return
    if (root.tool === "look") { selectAt(b); return }
    var n = World.designateRect(a, b, root.tool, root.buildType)
    if (n > 0) root.flash(n === 1 ? root.tf("fl.cells.one", toolLabel()) : root.tf("fl.cells.many", n, toolLabel()))
    else root.flash(reasonFor(b))
  }
  function reasonFor(i) {
    var w = World.w, t = w.tile[i]
    switch (root.tool) {
      case "dig": return t === Sim.T_OPEN ? root.t("why.dig.open") : t === Sim.T_TREE ? root.t("why.dig.tree") : (t === Sim.T_WATER || t === Sim.T_MAGMA) ? root.t("why.dig.liquid") : root.t("why.dig.no")
      case "stair": return root.t("why.stair")
      case "chop": return root.t("why.chop")
      case "build":
        if (t !== Sim.T_OPEN) return root.t("why.build.open")
        if (w.floor[i] === Sim.F_NONE) return root.t("why.build.sky")
        if (w.build[i] !== Sim.B_NONE) return root.tf("why.build.taken", Sim.buildName(w.build[i]))
        if (root.buildType === Sim.B_FARM) return root.t("p.farm.needs")
        return root.t("p.cant.build")
      case "cancel": return root.t("p.desig.none")
      case "remove": return root.t("p.build.none")
    }
    return ""
  }
  // Choosing a unit puts the cursor on it, switches to its level and follows
  // it around until the cursor is moved by hand (or Esc).
  function focusUnit(u) {
    if (!u) return
    World.selectedId = u.id
    root.cx = Sim.ix(u.i); root.cy = Sim.iy(u.i)
    World.viewZ = Sim.iz(u.i)
    World.followId = u.id
    root.page = "units"
  }
  function selectAt(i) {
    var w = World.w, here = []
    for (var k = 0; k < w.units.length; k++) if (w.units[k].i === i) here.push(w.units[k])
    if (here.length === 0) { World.selectedId = 0; World.followId = 0; root.page = "local"; return }
    root.unitCycle = (root.unitCycle + 1) % here.length
    focusUnit(here[root.unitCycle])
  }
  function enterPressed() {
    var i = cursorIdx()
    if (!isAreaTool()) { selectAt(i); return }
    if (root.selStart < 0 || Sim.iz(root.selStart) !== root.vz) { root.selStart = i; return }
    apply(root.selStart, i); root.selStart = -1
  }
  function selectNext(dir) {
    var ds = Sim.dwarves(World.w); if (ds.length === 0) return
    var at = -1
    for (var k = 0; k < ds.length; k++) if (ds[k].id === World.selectedId) at = k
    at = (at + dir + ds.length) % ds.length
    focusUnit(ds[at])
  }

  // ---- menu -----------------------------------------------------------------------
  // Esc with nothing to cancel opens the menu; Esc inside the menu closes the
  // panel. Everything in here is a row model: the QML below only draws rows.
  readonly property bool menuOpen: World.menu
  property string menuSection: "main"     // main new custom save load options
  property int menuIndex: 0
  property string customPreset: "classic"
  property int customCount: 7
  property string customSeed: ""
  property int pendingClear: 0
  Timer { id: clearTimer; interval: 3500; onTriggered: root.pendingClear = 0 }

  function openMenu(section) { root.menuSection = section || "main"; root.menuIndex = 0; World.menu = true; root.rebuildMenu() }
  function closeMenu() { World.menu = false }

  property var menuRows: []
  function rebuildMenu() {
    var w = World.w, rows = [], k
    function item(t, hint, key, action, extra) { var r = { kind: "item", t: t, hint: hint || "", key: key || "", action: action }; if (extra) for (var q in extra) r[q] = extra[q]; rows.push(r) }
    function title(t, sub) { rows.push({ kind: "title", t: t, sub: sub || "" }) }
    function gap() { rows.push({ kind: "gap" }) }
    var slotsMeta = World.slots || {}
    function slotLabel(n) {
      var m = slotsMeta[String(n)]
      if (!m) return root.tf("m.slot.empty", n)
      var ago = Math.max(0, Math.round((Date.now() - (m.at || 0)) / 60000))
      var agoTxt = ago < 1 ? root.t("m.ago.now") : ago < 60 ? root.tf("m.ago.min", ago) : ago < 1440 ? root.tf("m.ago.hour", Math.round(ago / 60)) : root.tf("m.ago.day", Math.round(ago / 1440))
      return root.tf("m.slot.full", n, m.name + (m.preset ? " · " + m.preset : "") + " · " + m.date + " · " + root.tf("m.dwarves.count", m.pop) + " · " + agoTxt)
    }
    rows.push({ kind: "brand" })
    if (root.menuSection === "main") {
      title(w ? w.name : "—", w ? (w.preset ? w.preset + " · " : "") + root.fmtDate(Sim.date(w)) + " · " + root.tf("m.dwarves.count", Sim.pop(w)) : "")
      item(root.t("m.continue"), root.t("m.continue.sub"), "Esc", function () { closeMenu() })
      gap()
      item(root.t("m.new"), root.t("m.new.sub"), "n", function () { root.menuSection = "new"; root.menuIndex = 0; rebuildMenu() })
      item(root.t("m.save"), root.t("m.save.sub"), "s", function () { root.menuSection = "save"; root.menuIndex = 0; rebuildMenu() })
      item(root.t("m.load"), "", "l", function () { root.menuSection = "load"; root.menuIndex = 0; rebuildMenu() })
      item(root.t("m.orders"), root.t("m.orders.sub"), "w", function () { root.menuSection = "orders"; root.menuIndex = 0; rebuildMenu() })
      item(root.t("m.view"), root.t("m.view.sub"), "v", function () { root.menuSection = "view"; root.menuIndex = 0; rebuildMenu() })
      item(root.t("m.options"), root.t("m.options.sub"), "o", function () { root.menuSection = "options"; root.menuIndex = 0; rebuildMenu() })
      gap()
      item(root.t("m.close"), root.t("m.close.sub"), "q", function () { closeMenu(); World.open = false })
    } else if (root.menuSection === "new") {
      title(root.t("m.new"), root.t("m.new.warn"))
      for (k = 0; k < Sim.PRESETS.length; k++) (function (pr) { item(pr.name, pr.desc, String(k + 1), function () { World.newFromPreset(pr.id, 0, ""); closeMenu(); root.flash(pr.name + ": " + World.w.name) }, { wrap: true }) })(Sim.PRESETS[k])
      gap()
      item(root.t("m.custom"), root.t("m.custom.sub"), "p", function () { root.menuSection = "custom"; root.menuIndex = 0; rebuildMenu() })
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() })
    } else if (root.menuSection === "custom") {
      var pr = null; for (k = 0; k < Sim.PRESETS.length; k++) if (Sim.PRESETS[k].id === root.customPreset) pr = Sim.PRESETS[k]
      title(root.t("m.custom.title"), root.t("m.custom.hint"))
      item(root.t("m.preset"), pr ? pr.name : root.customPreset, "◂ ▸", null, { value: true, adjust: function (d) { var i = 0; for (var q = 0; q < Sim.PRESETS.length; q++) if (Sim.PRESETS[q].id === root.customPreset) i = q; i = (i + d + Sim.PRESETS.length) % Sim.PRESETS.length; root.customPreset = Sim.PRESETS[i].id; root.customCount = Sim.PRESETS[i].n; rebuildMenu() } })
      item(root.t("m.dwarves"), String(root.customCount), "◂ ▸", null, { value: true, adjust: function (d) { root.customCount = Math.max(4, Math.min(24, root.customCount + d)); rebuildMenu() } })
      item(root.t("m.seed"), root.customSeed === "" ? root.t("m.seed.random") : root.customSeed, "0-9 ⌫", null, { value: true, seed: true })
      gap()
      item(root.t("m.found"), "", "Enter", function () { World.newFromPreset(root.customPreset, root.customCount, root.customSeed); closeMenu(); root.flash((pr ? pr.name : "") + ": " + World.w.name + " (semente " + World.w.seed + ")") })
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "new"; root.menuIndex = 0; rebuildMenu() })
    } else if (root.menuSection === "save") {
      title(root.t("m.save"), root.t("m.save.hint"))
      for (k = 1; k <= 5; k++) (function (n) { item(slotLabel(n), slotsMeta[String(n)] ? "" : "", String(n), function () { if (World.saveSlot(n)) { root.flash(root.tf("fl.saved", n)); rebuildMenu() } else root.flash(root.t("fl.savefail")) }, { slot: n, empty: !slotsMeta[String(n)], wrap: true }) })(k)
      gap()
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() })
    } else if (root.menuSection === "load") {
      title(root.t("m.load"), root.t("m.load.hint"))
      var any = false
      for (k = 1; k <= 5; k++) (function (n) { if (!slotsMeta[String(n)]) return; any = true; item(slotLabel(n), "", String(n), function () { if (World.loadSlot(n)) { closeMenu(); root.flash(root.tf("fl.loading", n)) } }, { slot: n, wrap: true }) })(k)
      if (!any) rows.push({ kind: "note", t: root.t("m.load.none") })
      gap()
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() })
    } else if (root.menuSection === "orders") {
      title(root.t("m.orders"), root.t("m.orders.hint"))
      for (k = 0; k < Sim.ORDER_KINDS.length; k++) (function (kind) {
        var spec = Sim.ORDER_SPEC[kind], cnt = Sim.orderCounts(w, kind)
        var hint = cnt.mine ? root.tf("m.orders.you", cnt.mine) : cnt.hold ? root.tf("m.orders.noted", cnt.hold) : root.t("m.orders.nothing")
        item(Sim.orderName(kind), hint, "◂ ▸", null, { value: true, adjust: function (d) {
          if (d > 0) Sim.fileOrder(w, kind, 1, true); else Sim.dropPlayerOrder(w, kind, 1)
          World.rev++; rebuildMenu()
        } })
      })(Sim.ORDER_KINDS[k])
      gap()
      rows.push({ kind: "note", t: root.t("m.orders.note") })
      item(root.t("m.orders.clear"), root.t("m.orders.clear.sub"), "x", function () { Sim.clearPlayerOrders(w); World.rev++; rebuildMenu(); root.flash(root.t("fl.orders.cleared")) })
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() })
    } else if (root.menuSection === "view") {
      title(root.t("m.view"), root.t("m.view.hint"))
      for (k = 0; k < root.viewModes.length; k++) (function (vm, n) { item((World.viewMode === vm[0] ? "● " : "○ ") + vm[1], vm[2], String(n + 1), function () { setViewMode(vm[0]); closeMenu() }, { wrap: true }) })(root.viewModes[k], k)
      gap()
      item(root.t("m.hour"), root.t("m.hour.sub"), "◂ ▸", null, { value: true, adjust: function (d) { var hs = [3, 8, 12, 18.5, 22]; var cur = Sim.date(w).hour; var i = 0, bd = 99; for (var q = 0; q < hs.length; q++) { var dd = Math.abs(hs[q] - cur); if (dd < bd) { bd = dd; i = q } } i = (i + d + hs.length) % hs.length; Sim.setHour(w, hs[i]); World.rev++; rebuildMenu() } })
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() })
    } else if (root.menuSection === "options") {
      title(root.t("m.options"), root.t("m.options.hint"))
      var bgLabel = root.t(World.backgroundMs === 0 ? "m.opt.bg.frozen" : World.backgroundMs >= 4000 ? "m.opt.bg.4s" : World.backgroundMs >= 2000 ? "m.opt.bg.2s" : World.backgroundMs >= 1000 ? "m.opt.bg.1s" : "m.opt.bg.fast")
      item(root.t("m.opt.bg"), bgLabel, "◂ ▸", null, { value: true, adjust: function (d) { var seq = [0, 4000, 2000, 1000, 250]; var i = seq.indexOf(World.backgroundMs); if (i < 0) i = 2; i = (i + d + seq.length) % seq.length; World.backgroundMs = seq[i]; rebuildMenu() } })
      item(root.t("m.opt.speed"), World.speed + "×", "◂ ▸", null, { value: true, adjust: function (d) { var sq = [1, 2, 4]; var i = sq.indexOf(World.speed); i = (i + d + 3) % 3; World.speed = sq[i]; World.saveOptions(); rebuildMenu() } })
      item(root.t("m.opt.look"), root.t(World.glyphs ? "m.opt.look.glyphs" : "m.opt.look.blocks"), "◂ ▸", null, { value: true, adjust: function () { World.glyphs = !World.glyphs; rebuildMenu() } })
      item(root.t("m.opt.peek"), root.t(World.peek ? "m.on" : "m.off"), "◂ ▸", null, { value: true, adjust: function () { World.peek = !World.peek; rebuildMenu() } })
      item(root.t("m.opt.popcap"), String(World.popCap), "◂ ▸", null, { value: true, adjust: function (d) { var caps = [12, 20, 30, 40]; var i = caps.indexOf(World.popCap); if (i < 0) i = 1; i = (i + d + caps.length) % caps.length; World.popCap = caps[i]; rebuildMenu() } })
      item(root.t("m.opt.enemies"), root.t(World.enemies ? "m.opt.enemies.yes" : "m.opt.enemies.no"), "◂ ▸", null, { value: true, adjust: function () { World.setEnemies(!World.enemies); rebuildMenu() } })
      item(root.t("m.opt.waves"), root.t(World.difficulty === "calma" ? "m.opt.waves.calm" : World.difficulty === "brutal" ? "m.opt.waves.brutal" : "m.opt.waves.normal"), "◂ ▸", null, { value: true, adjust: function (d) { var ds = ["calma", "normal", "brutal"]; var i = ds.indexOf(World.difficulty); i = (i + d + 3) % 3; World.setDifficulty(ds[i]); rebuildMenu() } })
      item(root.t("m.opt.lang"), World.langName(), "◂ ▸", null, { value: true, adjust: function () { World.cycleLang(); root.flash(root.tf("fl.lang", World.langName())); rebuildMenu() } })
      gap()
      item(root.t("m.back"), "", "Esc", function () { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() })
    }
    root.menuRows = rows
    // keep the cursor on an item
    if (rows.length && rows[root.menuIndex] && rows[root.menuIndex].kind !== "item") root.menuMove(1)
  }
  function menuMove(dir) {
    var rows = root.menuRows, n = rows.length; if (!n) return
    var i = root.menuIndex
    for (var t = 0; t < n; t++) { i = (i + dir + n) % n; if (rows[i].kind === "item") { root.menuIndex = i; return } }
  }
  function menuActivate(dir) {
    var r = root.menuRows[root.menuIndex]; if (!r || r.kind !== "item") return
    if (r.adjust) { r.adjust(dir || 1); return }
    if (r.action) r.action()
  }
  function menuKey(e) {
    var rows = root.menuRows, r = rows[root.menuIndex]
    if (r && r.seed && !(e.modifiers & Qt.ControlModifier)) {
      if (e.key === Qt.Key_Backspace) { root.customSeed = root.customSeed.slice(0, -1); rebuildMenu(); e.accepted = true; return }
      if (e.text && /^[0-9]$/.test(e.text) && root.customSeed.length < 10) { root.customSeed += e.text; rebuildMenu(); e.accepted = true; return }
    }
    switch (e.key) {
      case Qt.Key_Escape:
        if (root.menuSection === "main") { closeMenu(); World.open = false }
        else if (root.menuSection === "custom") { root.menuSection = "new"; root.menuIndex = 0; rebuildMenu() }
        else { root.menuSection = "main"; root.menuIndex = 0; rebuildMenu() }
        e.accepted = true; return
      case Qt.Key_Up: case Qt.Key_K: menuMove(-1); e.accepted = true; return
      case Qt.Key_Down: case Qt.Key_J: case Qt.Key_Tab: menuMove(1); e.accepted = true; return
      case Qt.Key_Left: case Qt.Key_H: if (r && r.adjust) r.adjust(-1); e.accepted = true; return
      case Qt.Key_Right: case Qt.Key_L: if (r && r.adjust) r.adjust(1); e.accepted = true; return
      case Qt.Key_Return: case Qt.Key_Enter: case Qt.Key_Space: menuActivate(1); e.accepted = true; return
      case Qt.Key_X:
        if (r && r.slot && (root.menuSection === "save" || root.menuSection === "load")) {
          if (root.pendingClear === r.slot) { World.clearSlot(r.slot); root.pendingClear = 0; root.flash(root.tf("fl.cleared", r.slot)); rebuildMenu() }
          else { root.pendingClear = r.slot; clearTimer.restart(); root.flash(root.tf("fl.clear.confirm", r.slot)) }
          e.accepted = true; return
        }
        break
    }
    // hotkeys
    var txt = String(e.text || "").toLowerCase()
    if (txt) for (var q = 0; q < rows.length; q++) if (rows[q].kind === "item" && rows[q].key.toLowerCase() === txt && !rows[q].adjust) { root.menuIndex = q; menuActivate(1); e.accepted = true; return }
    e.accepted = true
  }

  function keyPressed(e) {
    var w = World.w
    if (root.menuOpen) { menuKey(e); return }
    if (!w) { if (e.key === Qt.Key_Escape) World.open = false; return }
    var shift = e.modifiers & Qt.ShiftModifier
    var stepN = shift ? 5 : 1
    if (root.buildMenu) {
      var kk = e.text
      if (e.key === Qt.Key_Escape) { root.buildMenu = false; e.accepted = true; return }
      if (root.buildKeys[kk] !== undefined) { root.buildType = root.buildKeys[kk]; root.tool = "build"; root.buildMenu = false; root.selStart = -1; root.flash("construir " + Sim.BUILD_INFO[root.buildType].name + (Sim.BUILD_INFO[root.buildType].mat ? " (precisa de " + Sim.ITEM_NAME[Sim.BUILD_INFO[root.buildType].mat] + ")" : "")) ; e.accepted = true; return }
      e.accepted = true; return
    }
    switch (e.key) {
      case Qt.Key_Escape:
        if (root.selStart >= 0) root.selStart = -1
        else if (root.tool !== "look") root.tool = "look"
        else if (World.followId) { World.followId = 0; root.flash(root.t("fl.unfollow.esc")) }
        else if (World.selectedId) World.selectedId = 0
        else openMenu("main")
        break
      case Qt.Key_F10: case Qt.Key_QuoteLeft: openMenu("main"); break
      case Qt.Key_Left: case Qt.Key_H: moveCursor(-stepN, 0); break
      case Qt.Key_Right: case Qt.Key_L: if (e.key === Qt.Key_L && shift) { World.toggleLockdown(); root.flash(w.lockdown ? root.t("h.lock") : "portas destrancadas") } else moveCursor(stepN, 0); break
      case Qt.Key_Up: case Qt.Key_K: moveCursor(0, -stepN); break
      case Qt.Key_Down: case Qt.Key_J: moveCursor(0, stepN); break
      case Qt.Key_Less: case Qt.Key_Comma: case Qt.Key_PageUp: setZ(root.vz + 1); break
      case Qt.Key_Greater: case Qt.Key_Period: case Qt.Key_PageDown: setZ(root.vz - 1); break
      case Qt.Key_Return: case Qt.Key_Enter: enterPressed(); break
      case Qt.Key_Space: World.paused = !World.paused; root.flash(World.paused ? "pausado" : "correndo"); break
      case Qt.Key_Plus: case Qt.Key_Equal: World.speed = World.speed >= 4 ? 4 : World.speed * 2; root.flash("velocidade " + World.speed + "x"); break
      case Qt.Key_Minus: World.speed = World.speed <= 1 ? 1 : World.speed / 2; root.flash("velocidade " + World.speed + "x"); break
      case Qt.Key_D: root.tool = "dig"; root.selStart = -1; root.flash(root.t("fl.dig")); break
      case Qt.Key_S: if (shift) { openMenu("save") } else { root.tool = "stair"; root.selStart = -1; root.flash(root.t("fl.stair")) } break
      case Qt.Key_C: root.tool = "chop"; root.selStart = -1; root.flash(root.t("fl.chop")); break
      case Qt.Key_B: root.buildMenu = true; break
      case Qt.Key_X: root.tool = "cancel"; root.selStart = -1; root.flash(root.t("fl.cancel")); break
      case Qt.Key_R: root.tool = "remove"; root.selStart = -1; root.flash(root.t("fl.remove")); break
      case Qt.Key_V: root.tool = "look"; root.selStart = -1; break
      case Qt.Key_Tab: { var pages = ["units", "local", "orders", "legends", "help"]; root.page = pages[(pages.indexOf(root.page) + (shift ? 4 : 1)) % 5]; e.accepted = true; return }
      case Qt.Key_Backtab: { var pg = ["units", "local", "orders", "legends", "help"]; root.page = pg[(pg.indexOf(root.page) + 4) % 5]; e.accepted = true; return }
      case Qt.Key_U: root.page = "units"; break
      case Qt.Key_I: root.page = "local"; break
      case Qt.Key_Y: root.page = "legends"; break
      case Qt.Key_W: root.page = "orders"; break
      case Qt.Key_Question: case Qt.Key_F1: root.page = root.page === "help" ? "units" : "help"; break
      case Qt.Key_G: World.glyphs = !World.glyphs; root.flash(root.t(World.glyphs ? "fl.glyphs" : "fl.blocks")); break
      case Qt.Key_M: World.peek = !World.peek; root.flash(root.t(World.peek ? "fl.peek.on" : "fl.peek.off")); break
      case Qt.Key_F: if (World.selectedId) { if (World.followId) { World.followId = 0; root.flash(root.t("fl.unfollow")) } else focusUnit(Sim.unitById(w, World.selectedId)) } else root.flash(root.t("fl.selectfirst")); break
      case Qt.Key_BracketRight: selectNext(1); break
      case Qt.Key_BracketLeft: selectNext(-1); break
      case Qt.Key_Home: if (w) { root.cx = Sim.ix(w.depot); root.cy = Sim.iy(w.depot); setZ(Sim.iz(w.depot)) } break
      case Qt.Key_N: openMenu("new"); break
      case Qt.Key_O: if (shift) openMenu("view"); else cycleViewMode(); break
      default: return
    }
    e.accepted = true
  }

  // ---- sidebar text -------------------------------------------------------------
  function bar(v, n) { var k = Math.max(0, Math.min(n, Math.round(v / 100 * n))); var s = ""; for (var i = 0; i < n; i++) s += i < k ? "▰" : "▱"; return s }
  // What the pointer is over, if it carries an explanation. One line, under the
  // header, on the side the chips are.
  property string tipText: ""

  function fmtDate(d) { return root.tf("date.full", Sim.seasonName(d.seasonName), d.day, d.year, (Math.floor(d.hour) < 10 ? "0" : "") + Math.floor(d.hour)) }
  // called from a Chip binding that re-evaluates every tick; the ground range is
  // fixed for the life of a world, so it rides along on the sim's cache
  function levelName(z) {
    var w = World.w; if (!w) return ""
    var c = Sim.cache(w)
    if (z > c.maxGround) return root.t("lvl.sky")
    if (z >= c.minGround) return root.t("lvl.surface")
    if (z === 1) return root.t("lvl.caves")
    if (z === 0) return root.t("lvl.magma")
    return root.tf("lvl.under", c.minGround - z)
  }

  property var lines: []
  function refreshLines() {
    if (!World.open || !World.w) return
    var w = World.w, out = [], k, u, i = cursorIdx()
    var sel = World.selectedId ? Sim.unitById(w, World.selectedId) : null
    if (root.page === "units") {
      var ds = Sim.dwarves(w)
      if (ds.length === 0) out.push({ t: root.t("p.nobody"), c: "urgent", wrap: true })
      var shown = 0
      for (k = 0; k < ds.length; k++) {
        u = ds[k]
        var mark = sel && sel.id === u.id ? "▶ " : "  "
        var moodc = u.mood_state ? "magenta" : u.mood < 18 ? "urgent" : u.mood < 35 ? "warn" : ""
        out.push({ t: mark + u.name + "  " + Sim.jobName(u), c: sel && sel.id === u.id ? "accent" : "", c2: moodc, tail: Sim.moodWord(u), id: u.id })
        if (++shown >= 14 && ds.length > 15) { out.push({ t: root.tf("p.more", ds.length - shown), c: "muted" }); break }
      }
      out.push({ t: "", c: "" })
      if (sel) {
        if (sel.k === "dwarf") {
          out.push({ t: sel.name, c: "accent" })
          out.push({ t: Sim.skillTitle(sel) + " · " + Sim.traitName(sel.trait) + " · hp " + sel.hp + "/" + sel.maxhp + (sel.militia ? root.t("p.militia") : ""), c: sel.militia ? "accent" : "muted", wrap: true })
          // the grade matters in a fight, so it goes on the sheet
          var gear = [], gq = function (label, q) { return q > 1 ? root.tf("p.gear.grade", label, Sim.gradeName(q)) : label }
          if (sel.weapon) gear.push(gq(root.t("p.gear.weapon"), sel.weaponQ || 1))
          if (sel.armor) gear.push(gq(root.t("p.gear.armor"), sel.armorQ || 1))
          if (sel.tool) gear.push(gq(root.t(sel.tool === "pick" ? "p.gear.pick" : "p.gear.axe"), sel.toolQ || 1))
          out.push({ t: root.tf("p.gear", gear.length ? gear.join(", ") : root.t("p.gear.none")), c: "muted" })
          out.push({ t: root.tf("p.mood", bar(sel.mood, 10), Sim.moodWord(sel)), c: sel.mood < 18 ? "urgent" : "" })
          out.push({ t: root.tf("p.needs", bar(Math.min(100, sel.hunger), 10), bar(Math.min(100, sel.thirst), 10), bar(Math.min(100, sel.sleep), 10)), c: "" })
          var sk = Object.keys(sel.skills).filter(function (s) { return sel.skills[s] > 0 }).sort(function (a, b) { return sel.skills[b] - sel.skills[a] }).slice(0, 4)
          out.push({ t: root.tf("p.skills", sk.length ? sk.map(function (s) { return Sim.skillName(s) + " " + sel.skills[s] }).join(", ") : root.t("p.skills.none")), c: "muted", wrap: true })
          if (sel.likes) out.push({ t: root.tf("p.prefers", Sim.workName(sel.likes), Sim.workName(sel.dislikes)), c: "muted", wrap: true })
          if (sel.avoid && (sel.avoidUntil || 0) > w.tick) out.push({ t: root.tf("p.frustrated.off", Sim.workName(sel.avoid)), c: "warn", wrap: true })
          else if ((sel.frust || 0) > 0) out.push({ t: root.tf("p.frustrated", sel.frust), c: "warn" })
          out.push({ t: root.tf("p.now", Sim.jobName(sel), Sim.iz(sel.i), World.followId === sel.id ? root.t("p.following") : ""), c: "", wrap: true })
          if (sel.thoughts.length) { out.push({ t: root.t("p.thoughts"), c: "muted" }); for (k = 0; k < Math.min(5, sel.thoughts.length); k++) { var th = sel.thoughts[k]; out.push({ t: "  " + (th.v >= 0 ? "+" : "") + th.v + " " + th.m, c: th.v < 0 ? "warn" : "good", wrap: true }) } }
        } else {
          var kinds = { goblin: root.t("unit.goblin"), wolf: root.t("unit.wolf"), deer: root.t("unit.deer"), kobold: root.t("unit.kobold"), merchant: root.t("unit.merchant") }
          out.push({ t: kinds[sel.k] || sel.k, c: "accent" }); out.push({ t: "hp " + sel.hp + "/" + sel.maxhp + " · z" + Sim.iz(sel.i), c: "muted" })
        }
      } else out.push({ t: root.t("p.selecthint"), c: "muted", wrap: true })
    } else if (root.page === "local") {
      out.push({ t: "(" + root.cx + "," + root.cy + ") z" + root.vz + " · " + levelName(root.vz), c: "muted" })
      out.push({ t: Sim.tileName(w, i), c: "accent" })
      if (w.desig[i]) {
        out.push({ t: root.tf("p.desig", ({ 1: root.t("tool.dig"), 2: root.t("tool.stair"), 3: root.t("tool.chop"), 4: root.tf("fl.build", Sim.buildName(w.dbuild[i])) })[w.desig[i]]), c: "" })
        if (Sim.isUnreachable(w, i)) out.push({ t: root.t("p.noway"), c: "warn", wrap: true })
      }
      var nbad = Sim.countUnreachable(w)
      if (nbad > 0) out.push({ t: root.tf("p.desig.red", nbad), c: "warn", wrap: true })
      var its = Sim.itemsAt(w, i)
      if (its.length) {
        var cnt = {}; for (k = 0; k < its.length; k++) cnt[its[k].t] = (cnt[its[k].t] || 0) + 1
        out.push({ t: "itens: " + Object.keys(cnt).map(function (t) { return cnt[t] + " " + Sim.ITEM_NAME[t] }).join(", "), c: "" })
        for (k = 0; k < its.length; k++) if (its[k].t === "artifact") out.push({ t: "  ☼ " + its[k].name + ", '" + its[k].title + "'", c: "accent" })
      }
      for (k = 0; k < w.units.length; k++) if (w.units[k].i === i) out.push({ t: "aqui: " + (w.units[k].name || w.units[k].k) + (w.units[k].k === "dwarf" ? " — " + Sim.jobName(w.units[k]) : ""), c: "" })
      if (root.vz > 0 && w.tile[i] === Sim.T_OPEN && w.floor[i] === Sim.F_NONE) out.push({ t: "abaixo: " + Sim.tileName(w, i - Sim.N), c: "muted" })
      out.push({ t: "", c: "" })
      out.push({ t: root.tf("p.tool", toolLabel(), root.selStart >= 0 ? root.t("p.tool.corner") : ""), c: "accent" })
      if (root.tool === "build") { var bi = Sim.BUILD_INFO[root.buildType]; if (bi) out.push({ t: bi.mat ? "consome 1 " + Sim.ITEM_NAME[bi.mat] : (root.buildType === Sim.B_FARM ? root.t("h.soilonly") : root.t("h.nomat")), c: "muted" }) }
      out.push({ t: "", c: "" })
      out.push({ t: "despensa: " + Sim.countItems(w, "food") + " comida · " + Sim.countItems(w, "booze") + " bebida", c: Sim.countItems(w, "booze") < w.units.length ? "warn" : "" })
      out.push({ t: root.tf("p.counts.raw", Sim.countItems(w, "log"), Sim.countItems(w, "stone"), Sim.countItems(w, "ore"), Sim.countItems(w, "gem")), c: "muted", wrap: true })
      out.push({ t: root.tf("p.counts.meals", Sim.countItems(w, "meal"), Sim.countItems(w, "bar"), Sim.countItems(w, "pick"), Sim.countItems(w, "axe")), c: "muted", wrap: true })
      out.push({ t: root.tf("p.counts.arms", Sim.countItems(w, "weapon"), Sim.countItems(w, "armor"), Sim.countItems(w, "craft"), w.artifacts.length), c: "muted", wrap: true })
      out.push({ t: root.tf("p.counts.gems", Sim.countItems(w, "cutgem"), Sim.countItems(w, "jewel"), Sim.cache(w).jewelers.length), c: "muted", wrap: true })
      var cc = Sim.cache(w)
      out.push({ t: root.tf("p.counts.rooms", cc.beds.length, cc.tables.length, cc.farms.length, cc.torches.length), c: "muted", wrap: true })
      out.push({ t: root.tf("p.counts.shops", cc.stills.length, cc.kitchens.length, cc.shops.length, cc.smelters.length, cc.forges.length, cc.trainings.length), c: "muted", wrap: true })
      var mil = Sim.dwarves(w).filter(function (q) { return q.militia }).length
      out.push({ t: root.tf("p.militia.count", mil, w.scenario ? root.tf("p.nextwave", w.scenario.wave, Math.max(0, Math.ceil((w.scenario.nextRaid - w.tick) / Sim.DAY))) : ""), c: w.raid ? "urgent" : "", wrap: true })
      var lt = Sim.cellLight(w, i)
      out.push({ t: root.tf("p.light", Math.round(lt * 100), lt < 0.3 ? root.t("p.light.dark") : ""), c: lt < 0.3 ? "muted" : "" })
      if (w.lockdown) out.push({ t: root.t("p.locked"), c: "warn" })
      var dd = Sim.digDepth(w)
      if (dd < Sim.iz(w.depot)) out.push({ t: root.tf("p.deepest", dd, w.stirred ? root.tf("p.stirred", w.stirred) : ""), c: w.stirred ? "warn" : "muted", wrap: true })
      if (w.siege) out.push({ t: root.tf("p.siege", Math.max(1, Math.round((w.tick - w.siege) / Sim.DAY))), c: "urgent", wrap: true })
      if (w.baron) {
        var bu = Sim.unitById(w, w.baron)
        if (bu) out.push({ t: root.tf("p.baron", bu.name), c: "accent", wrap: true })
        if (w.demand) {
          var left = Math.max(0, Sim.DEMAND_DAYS - Math.round((w.tick - w.demandSince) / Sim.DAY))
          out.push({ t: root.tf("p.demand", Sim.demandText(w, w.demand), left), c: left <= 5 ? "warn" : "", wrap: true })
        } else out.push({ t: root.t("p.demand.none"), c: "muted" })
      }
    } else if (root.page === "orders") {
      var ol = w.orders || []
      out.push({ t: root.t("p.orders.title"), c: "accent" })
      out.push({ t: root.t("p.orders.sub"), c: "muted", wrap: true })
      out.push({ t: "", c: "" })
      var mineRows = [], holdRows = [], oq
      for (oq = 0; oq < ol.length; oq++) {
        var o = ol[oq], sp = Sim.ORDER_SPEC[o.what]
        if (!sp) continue
        var row = "  " + Sim.orderName(o.what) + "  " + o.done + "/" + o.n
        if (o.by) mineRows.push(row); else holdRows.push(row)
      }
      if (mineRows.length) { out.push({ t: root.t("p.orders.mine"), c: "" }); for (oq = 0; oq < mineRows.length; oq++) out.push({ t: mineRows[oq], c: "good" }) ; out.push({ t: "", c: "" }) }
      if (holdRows.length) { out.push({ t: root.t("p.orders.hold"), c: "" }); for (oq = 0; oq < holdRows.length; oq++) out.push({ t: holdRows[oq], c: "muted" }); out.push({ t: "", c: "" }) }
      if (!mineRows.length && !holdRows.length) out.push({ t: root.t("p.orders.empty"), c: "muted", wrap: true })
      // who is on what right now
      var busy = []
      var dl = Sim.dwarves(w)
      for (oq = 0; oq < dl.length; oq++) if (dl[oq].job && dl[oq].job.order) busy.push("  " + dl[oq].name.split(" ")[0] + " — " + Sim.jobName(dl[oq]))
      if (busy.length) { out.push({ t: root.t("p.orders.busy"), c: "" }); for (oq = 0; oq < busy.length; oq++) out.push({ t: busy[oq], c: "" }); out.push({ t: "", c: "" }) }
      out.push({ t: root.t("p.orders.how"), c: "muted", wrap: true })
      out.push({ t: root.t("p.orders.note"), c: "muted", wrap: true })
    } else if (root.page === "legends") {
      out.push({ t: root.tf("p.founded", w.name, Math.floor(w.tick / Sim.YEAR), w.seed), c: "accent", wrap: true })
      var st = w.stats
      out.push({ t: root.tf("p.st.1", st.dug, st.chopped, st.built, st.brewed, st.crafted), c: "muted", wrap: true })
      out.push({ t: root.tf("p.st.2", st.migrants, st.caravans, st.raids, st.deaths), c: "muted", wrap: true })
      out.push({ t: root.tf("p.st.3", st.cooked || 0, st.smelted || 0, st.forged || 0, st.cut || 0, st.jewels || 0), c: "muted", wrap: true })
      out.push({ t: root.tf("p.st.4", st.spoiled || 0, st.broken || 0, st.botched || 0, st.buried || 0), c: "muted", wrap: true })
      out.push({ t: "", c: "" })
      // Milestones before resilience: they are what the hold is playing for.
      out.push({ t: root.t("p.milestones"), c: "accent" })
      var msDone = 0, msLeft = []
      for (k = 0; k < Sim.MILESTONES.length; k++) {
        var msId = Sim.MILESTONES[k], msAt = (w.done || {})[msId]
        if (msAt) msDone++; else msLeft.push(root.t("ms.short." + msId))
        out.push({ t: (msAt ? "✓ " : "· ") + root.t("ms.short." + msId) + (msAt ? "  ·  " + root.fmtDate(Sim.date({ tick: msAt })) : ""), c: msAt ? "good" : "muted", wrap: true })
      }
      out.push({ t: root.tf("p.ms.done", msDone, Sim.MILESTONES.length), c: "" })
      if (w.legendary) out.push({ t: root.tf("p.legendary", Sim.date({ tick: w.legendary }).year), c: "accent", wrap: true })
      else if (msLeft.length) out.push({ t: root.tf("p.ms.pending", msLeft.join(", ")), c: "muted", wrap: true })
      out.push({ t: "", c: "" })
      if ((st.demandsMet || 0) + (st.demandsFailed || 0) > 0)
        out.push({ t: root.tf("p.demands", st.demandsMet || 0, st.demandsFailed || 0), c: "muted", wrap: true })
      out.push({ t: "", c: "" })
      out.push({ t: root.t("p.resilience"), c: "accent" })
      out.push({ t: root.tf("p.res.line", st.raids, st.repelled || 0, st.goblinsKilled || 0, st.deaths, w.scenario ? root.tf("p.res.wave", w.scenario.wave) : ""), c: st.deaths > (st.goblinsKilled || 0) ? "warn" : "", wrap: true })
      out.push({ t: "", c: "" })
      if (w.artifacts.length) { out.push({ t: root.t("p.artifacts"), c: "accent" }); for (k = w.artifacts.length - 1; k >= Math.max(0, w.artifacts.length - 4); k--) { var a = w.artifacts[k]; out.push({ t: "☼ " + a.name + ", '" + a.title + "'", c: "", wrap: true }); out.push({ t: "  " + a.desc + " — " + a.maker, c: "muted", wrap: true }) } out.push({ t: "", c: "" }) }
      if (w.dead.length) { out.push({ t: root.t("p.memorial"), c: "accent" }); for (k = w.dead.length - 1; k >= Math.max(0, w.dead.length - 5); k--) out.push({ t: "† " + w.dead[k].name + " — " + w.dead[k].how, c: "muted", wrap: true }); out.push({ t: "", c: "" }) }
      out.push({ t: root.t("p.chronicle"), c: "accent" })
      for (k = w.legends.length - 1; k >= Math.max(0, w.legends.length - 10); k--) { var d = Sim.date({ tick: w.legends[k].t }); out.push({ t: "a" + d.year + " " + d.seasonName + ": " + w.legends[k].m, c: "", wrap: true }) }
    } else {
      var H = [
        [root.t("h.key.arrows"), root.t("h.arrows")], ["< >  , .  PgUp/PgDn", root.t("h.levels")], [root.t("h.key.wheel"), root.t("h.wheel")],
        ["Enter", root.t("h.enter")], [root.t("h.key.drag"), root.t("h.drag")], [root.t("h.rclick.key"), root.t("h.rclick")],
        ["d", root.t("h.dig")], ["s", root.t("h.stair")], ["c", root.t("h.chop")], ["b", root.t("h.build")],
        ["x", root.t("h.cancel")], ["r", root.t("h.remove")], ["v / Esc", root.t("h.look")],
        ["] [", root.t("h.nextdwarf")], ["f", root.t("h.follow")], ["Home", root.t("h.home")],
        [root.t("key.space"), root.t("h.pause")], ["+ -", root.t("h.speed")], ["L", root.t("h.lock.short")],
        ["o / Shift+o", root.t("h.view")], ["g", root.t("h.glyphs")], ["m", root.t("h.peek")], ["Tab u i w y ?", root.t("h.pages")], ["n", root.t("h.new")], ["Shift+S", root.t("h.save")], ["Esc", root.t("h.esc")]]
      for (k = 0; k < H.length; k++) out.push({ t: H[k][0], c: "accent", tail: H[k][1] })
      out.push({ t: "", c: "" })
      out.push({ t: root.t("h.start"), c: "muted", wrap: true })
      // A legend, because a map of Ω, ‡ and π explains nothing on its own and
      // there is nowhere on a 48-wide grid to write a label. Built from the
      // same tables the map draws with, so it cannot drift out of date.
      out.push({ t: "", c: "" })
      out.push({ t: root.t("h.legend"), c: "accent" })
      var legRow = "", legN = 0
      for (var bq = 1; bq <= 17; bq++) {
        var bg = root.buildGlyph[bq]
        if (!bg) continue
        legRow += "  " + bg + " " + Sim.buildName(bq)
        if (++legN % 3 === 0) { out.push({ t: legRow, c: "", wrap: true }); legRow = "" }
      }
      if (legRow) out.push({ t: legRow, c: "", wrap: true })
      out.push({ t: "  ☺ " + root.t("h.leg.dwarf") + "   g " + root.t("unit.goblin") + "   w " + root.t("unit.wolf") + "   d " + root.t("unit.deer") + "   k " + root.t("unit.kobold") + "   c " + root.t("h.leg.deep") + "   S " + root.t("h.leg.sentinel"), c: "", wrap: true })
      out.push({ t: root.t("h.leg.note"), c: "muted", wrap: true })
      out.push({ t: "", c: "" })
      out.push({ t: root.t("h.tail"), c: "muted", wrap: true })
    }
    root.lines = out
  }

  // ---- window --------------------------------------------------------------------
  // Small reusable bits for the chrome
  component Chip: Rectangle {
    property string text: ""
    property string tip: ""
    property color fg: Color.popups.text
    property bool strong: false
    implicitHeight: chipText.implicitHeight + Style.space(6)
    implicitWidth: chipText.implicitWidth + Style.space(14)
    radius: height / 2
    color: strong ? Util.alpha(fg, 0.16) : (chipArea.containsMouse && tip ? Util.alpha(Color.popups.text, 0.12) : Util.alpha(Color.popups.text, 0.06))
    border.width: 1
    border.color: strong ? Util.alpha(fg, 0.35) : Util.alpha(Color.popups.text, 0.08)
    Text { id: chipText; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: parent.fg; text: parent.text }
    // The tip goes to a property on the root rather than a child Rectangle,
    // because the header's Row would clip anything taller than a chip.
    MouseArea {
      id: chipArea
      anchors.fill: parent
      hoverEnabled: !!parent.tip
      acceptedButtons: Qt.NoButton
      onEntered: if (parent.tip) root.tipText = parent.tip
      onExited: if (root.tipText === parent.tip) root.tipText = ""
    }
  }
  component KeyHint: Row {
    property string key: ""
    property string label: ""
    spacing: Style.space(5)
    Rectangle {
      anchors.verticalCenter: parent.verticalCenter
      width: kt.implicitWidth + Style.space(8); height: kt.implicitHeight + Style.space(3)
      radius: 4; color: Util.alpha(Color.accent, 0.14); border.width: 1; border.color: Util.alpha(Color.accent, 0.35)
      Text { id: kt; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.caption; color: Color.accent; text: parent.parent.key }
    }
    Text { anchors.verticalCenter: parent.verticalCenter; font.family: root.mono; font.pixelSize: Style.font.caption; color: Util.alpha(Color.popups.text, 0.6); text: parent.label }
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: win
      required property var modelData
      screen: modelData

      readonly property bool isTarget: {
        var f = Hyprland.focusedMonitor
        var want = f ? String(f.name || "") : ""
        if (want === "") return true
        return String(modelData.name || "") === want
      }

      visible: root.opened && isTarget
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "zed-omahold"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
      anchors { top: true; right: true; bottom: true; left: true }

      onVisibleChanged: if (visible) { root.refreshLines(); map.requestPaint() }

      // geometry
      readonly property int pad: Style.space(14)
      readonly property int sideW: Style.space(350)
      readonly property int headH: Style.space(34)
      readonly property int logH: Style.space(118)
      readonly property int cell: Math.max(8, Math.floor(Math.min((width - Style.space(60) - sideW - pad * 3) / Sim.W, (height - Style.space(60) - headH - logH - pad * 4) / Sim.H)))
      readonly property int mapW: cell * Sim.W
      readonly property int mapH: cell * Sim.H
      readonly property int cardW: mapW + sideW + pad * 3
      readonly property int cardH: mapH + headH + logH + pad * 4

      FocusScope {
        anchors.fill: parent
        focus: true
        Keys.onPressed: function (e) { root.keyPressed(e) }

        Rectangle { anchors.fill: parent; color: Color.menu.scrim; MouseArea { anchors.fill: parent; onClicked: World.open = false } }

        Rectangle {
          id: card
          width: win.cardW; height: win.cardH
          anchors.centerIn: parent
          color: Color.popups.background
          border.color: Color.popups.border
          border.width: 1
          radius: Style.cornerRadius
          clip: true
          MouseArea { anchors.fill: parent; onClicked: {} }

          // ---- header ----
          Item {
            id: head
            x: win.pad; y: win.pad; width: parent.width - win.pad * 2; height: win.headH
            Row {
              id: headLeft
              anchors { left: parent.left; verticalCenter: parent.verticalCenter }
              spacing: Style.space(10)
              Text {
                anchors.verticalCenter: parent.verticalCenter
                font.family: root.mono; font.pixelSize: Style.font.title; font.bold: true
                color: Color.popups.text
                text: World.w ? World.w.name : "Omahold"
              }
              Text {
                anchors.verticalCenter: parent.verticalCenter
                visible: !!(World.w && World.w.preset)
                font.family: root.mono; font.pixelSize: Style.font.caption
                color: Util.alpha(Color.popups.text, 0.5)
                text: World.w && World.w.preset ? World.w.preset : ""
              }
            }
            Text {
              anchors { right: headChips.left; rightMargin: Style.space(14); verticalCenter: parent.verticalCenter }
              width: Math.min(implicitWidth, parent.width - headLeft.width - headChips.width - Style.space(40))
              elide: Text.ElideLeft
              font.family: root.mono; font.pixelSize: Style.font.body
              color: Util.alpha(Color.popups.text, 0.75)
              text: {
                World.rev
                if (!World.w) return World.loadError || root.t("bar.loading2")
                var d = Sim.date(World.w)
                var wx = World.w.weather === 1 ? root.t("wx.rain") : World.w.weather === 2 ? root.t("wx.snow") : ""
                var sunNow = Sim.sunLevel(World.w)
                return root.fmtDate(d) + wx + (sunNow < 0.25 ? root.t("sun.night") : sunNow < 0.55 ? root.t(d.hour < 12 ? "sun.dawn" : "sun.dusk") : "")
              }
            }
            Row {
              id: headChips
              anchors { right: parent.right; verticalCenter: parent.verticalCenter }
              spacing: Style.space(6)
              Chip { text: "z" + root.vz + " " + root.levelName(root.vz); tip: root.t("tip.level"); fg: Color.accent; strong: true }
              Chip {
                // the tip goes on its own line: a property whose value is an
                // expression block cannot be followed by `; next:` — QML's
                // parser stops at the semicolon after the closing brace
                tip: root.t("tip.pop")
                text: { World.rev; var s = World.summary || {}; return "☺ " + (s.pop || 0) + (s.militia ? " · ⚔ " + s.militia : "") }
              }
              Chip {
                visible: !!(World.w && Sim.digDepth(World.w) < Sim.iz(World.w.depot))
                tip: root.t("tip.deep")
                fg: World.w && World.w.stirred ? Color.urgent : Color.popups.text
                strong: !!(World.w && World.w.stirred)
                text: { World.rev; var w = World.w; if (!w) return ""; return root.tf("chip.deep", Sim.digDepth(w)) + (w.stirred ? " !" : "") }
              }
              Chip {
                tip: root.t("tip.wealth")
                text: { World.rev; var s = World.summary || {}; return "☼ " + (s.wealth || 0) }
              }
              Chip { text: World.paused ? root.t("chip.paused") : "▶ " + World.speed + "×"; tip: root.t("tip.speed"); fg: World.paused ? Color.urgent : Color.popups.text; strong: World.paused }
              Chip { visible: !!(World.w && World.w.lockdown); text: root.t("chip.locked"); tip: root.t("tip.locked"); fg: Color.urgent; strong: true }
              Chip { visible: !!(World.w && World.w.fallen); text: root.t("chip.fallen"); tip: root.t("tip.fallen"); fg: Color.urgent; strong: true }
              Chip { visible: World.viewMode !== "normal"; text: root.tf("chip.view", root.t("view." + World.viewMode)); tip: root.t("tip.view"); fg: Color.accent; strong: true }
              Chip {
                visible: !!(World.w && World.w.scenario && !World.w.peaceful)
                fg: World.w && World.w.raid ? Color.urgent : Color.popups.text
                strong: !!(World.w && World.w.raid)
                tip: root.t("tip.wave")
                text: { World.rev; var w = World.w; if (!w || !w.scenario) return ""; return w.raid ? root.tf("chip.wave.now", w.raid.wave || "") : root.tf("chip.wave.in", w.scenario.wave, Math.max(0, Math.ceil((w.scenario.nextRaid - w.tick) / Sim.DAY))) }
              }
              Rectangle {
                width: menuBtnText.implicitWidth + Style.space(16); height: Style.space(24); radius: height / 2
                color: menuBtnArea.containsMouse ? Util.alpha(Color.accent, 0.22) : Util.alpha(Color.accent, 0.12)
                border.width: 1; border.color: Util.alpha(Color.accent, 0.4)
                Text { id: menuBtnText; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: Color.accent; text: root.t("chip.menu") }
                MouseArea { id: menuBtnArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.openMenu("main"); onEntered: root.tipText = root.t("tip.menu"); onExited: root.tipText = "" }
              }
            }
          }

          // ---- tooltip ----
          // Sits between the header and the map, on the side the chips are, so
          // it never covers what it explains.
          Rectangle {
            visible: root.tipText !== ""
            z: 50
            x: Math.max(win.pad, win.pad + win.mapW - width)
            y: head.y + head.height + 2
            width: tipLabel.implicitWidth + Style.space(18)
            height: tipLabel.implicitHeight + Style.space(10)
            radius: Style.space(6)
            color: Util.alpha(Color.popups.background, 0.96)
            border.width: 1; border.color: Util.alpha(Color.accent, 0.35)
            Text {
              id: tipLabel
              anchors.centerIn: parent
              font.family: root.mono; font.pixelSize: Style.font.bodySmall
              color: Color.popups.text
              text: root.tipText
            }
          }

          // ---- map ----
          Rectangle {
            id: mapFrame
            x: win.pad; y: head.y + head.height + win.pad
            width: win.mapW; height: win.mapH
            color: root.pal.bg
            border.color: Util.alpha(Color.popups.border, 0.5); border.width: 1

            Canvas {
              id: map
              anchors.fill: parent
              renderStrategy: Canvas.Immediate

              Connections {
                target: World
                function onTicked() { if (win.visible) map.requestPaint() }
                function onRevChanged() { if (win.visible) map.requestPaint() }
                function onViewZChanged() { if (win.visible) map.requestPaint() }
                function onSelectedIdChanged() { if (win.visible) map.requestPaint() }
                function onGlyphsChanged() { if (win.visible) map.requestPaint() }
                function onViewModeChanged() { if (win.visible) map.requestPaint() }
              }
              Connections {
                target: root
                function onCxChanged() { if (win.visible) map.requestPaint() }
                function onCyChanged() { if (win.visible) map.requestPaint() }
                function onSelStartChanged() { if (win.visible) map.requestPaint() }
                function onToolChanged() { if (win.visible) map.requestPaint() }
              }
              onWidthChanged: requestPaint()

              onPaint: {
                var ctx = getContext("2d"), w = World.w, p = root.pal
                var c = win.cell, N = Sim.N, WW = Sim.W, HH = Sim.H, z = root.vz, glyphs = World.glyphs
                ctx.fillStyle = p.bg; ctx.fillRect(0, 0, width, height)
                if (!w) return
                var fpx = Math.round(c * 0.82)
                ctx.font = fpx + "px '" + root.mono + "'"
                ctx.textAlign = "center"; ctx.textBaseline = "middle"
                var sun = Sim.sunLevel(w), snow = w.weather === 2, rain = w.weather === 1
                var RL = Sim.renderLight(w, w.tick), torchLight = RL.torch, fireLight = RL.fire
                var half = c / 2
                var mode = World.viewMode
                function bright(i, isOut) { var L = isOut ? Math.max(sun, torchLight[i], fireLight[i]) : Math.max(torchLight[i], fireLight[i]); return isOut ? 0.22 + 0.78 * L : 0.36 + 0.64 * L }
                // pass 1: terrain
                for (var y = 0; y < HH; y++) for (var x = 0; x < WW; x++) {
                  var i0 = z * N + y * WW + x, i = i0, t = w.tile[i], f = w.floor[i], b = w.build[i], k = 0
                  while (t === Sim.T_OPEN && f === Sim.F_NONE && k < 3 && i - N >= 0) { i -= N; k++; t = w.tile[i]; f = w.floor[i]; b = w.build[i] }
                  var fill = null, glyph = null, gcol = null, jit = Sim.hash(i) & 3
                  if (t !== Sim.T_OPEN) {
                    switch (t) {
                      case Sim.T_SOIL: fill = p.v.soil[jit]; if (glyphs) { glyph = "▒"; gcol = p.g.soil } break
                      case Sim.T_STONE: fill = p.v.stone[jit]; if (glyphs) { glyph = "▓"; gcol = p.g.stone } break
                      case Sim.T_ORE: fill = p.v.ore[jit]; glyph = "£"; gcol = p.g.ore; break
                      case Sim.T_GEM: fill = p.v.gem[jit]; glyph = "☼"; gcol = p.g.gem; break
                      case Sim.T_TREE: fill = glyphs ? p.v.fGrass[jit] : p.v.tree[jit]; glyph = "♠"; gcol = p.treeGlyph; break
                      case Sim.T_SHRUB: fill = p.v.fGrass[jit]; glyph = "\""; gcol = p.shrubGlyph; break
                      case Sim.T_FUNGUS: fill = glyphs ? p.v.fMoss[jit] : p.v.fungus[jit]; glyph = "♣"; gcol = p.fungusGlyph; break
                      case Sim.T_WATER: fill = p.v.water[jit]; glyph = "≈"; gcol = p.waterGlyph; break
                      case Sim.T_MAGMA: fill = p.v.magma[jit]; glyph = "≈"; gcol = p.magmaGlyph; break
                    }
                    if (glyphs && t !== Sim.T_TREE && t !== Sim.T_SHRUB && t !== Sim.T_FUNGUS) fill = p.bg
                  } else if (f !== Sim.F_NONE) {
                    var outdoor = z - k >= w.ground[y * WW + x]
                    switch (f) {
                      case Sim.F_SOIL: fill = p.v.fSoil[jit]; if (glyphs) { glyph = "."; gcol = p.g.fSoil } break
                      case Sim.F_STONE: fill = p.v.fStone[jit]; if (glyphs) { glyph = "."; gcol = p.g.fStone } break
                      case Sim.F_GRASS: fill = snow && outdoor ? p.v.fSnow[jit] : p.v.fGrass[jit]; if (glyphs) { glyph = snow && outdoor ? "." : ","; gcol = snow && outdoor ? p.g.fSnow : p.g.fGrass } break
                      case Sim.F_MOSS: fill = p.v.fMoss[jit]; if (glyphs) { glyph = ":"; gcol = p.g.fMoss } break
                    }
                    if (glyphs) fill = p.bg
                    switch (b) {
                      case Sim.B_STAIR: glyph = "X"; gcol = p.bStair; break
                      case Sim.B_BED: glyph = "θ"; gcol = p.bBed; break
                      case Sim.B_TABLE: glyph = "Π"; gcol = p.bTable; break
                      case Sim.B_FARM: if (!glyphs) fill = p.v.bFarm[jit]; var g = w.grow[i]; glyph = g === 0 ? "≡" : g < 100 ? "," : g < 200 ? "\"" : "♣"; gcol = g >= 200 ? p.bFarmRipe : p.bTable; break
                      case Sim.B_STILL: glyph = "¶"; gcol = p.bStill; break
                      case Sim.B_WORKSHOP: glyph = "⌂"; gcol = p.bWorkshop; break
                      case Sim.B_WALL: fill = glyphs ? p.bg : p.v.bWall[jit]; glyph = glyphs ? "O" : "▒"; gcol = p.bWallGlyph; break
                      case Sim.B_DOOR: glyph = "+"; gcol = p.bDoor; break
                      case Sim.B_STOCK: glyph = "="; gcol = p.bStock; break
                      case Sim.B_STATUE: glyph = "Ω"; gcol = p.bStatue; break
                      case Sim.B_GRAVE: glyph = "†"; gcol = p.bStatue; break
                      case Sim.B_KITCHEN: glyph = "π"; gcol = p.bKitchen; break
                      case Sim.B_SMELTER: glyph = "∆"; gcol = p.bSmelter; break
                      case Sim.B_FORGE: glyph = "‡"; gcol = p.bForge; break
                      case Sim.B_TORCH: glyph = "¡"; gcol = p.bTorch; break
                      case Sim.B_TRAINING: glyph = "Ξ"; gcol = p.bTraining; break
                      case Sim.B_JEWELER: glyph = "◊"; gcol = p.bJeweler; break
                    }
                  } else fill = p.bg
                  // lighting: sun on what lies under the sky, torches and magma anywhere,
                  // shadow behind rock; rock faces catch the light too
                  if (k === 0 && b !== Sim.B_TORCH && t !== Sim.T_MAGMA) {
                    var isOut = z >= w.ground[y * WW + x], tl = torchLight[i], fl = fireLight[i]
                    var L = isOut ? Math.max(sun, tl, fl) : Math.max(tl, fl)
                    var solidCell = t !== Sim.T_OPEN || b === Sim.B_WALL
                    if (fill && fill !== p.bg) fill = Pal.lit(fill, p, L, tl, fl, sun, isOut, solidCell)
                    if (gcol) gcol = Pal.lit(gcol, p, Math.max(0.3, L), tl, fl, sun, isOut, solidCell)
                  } else if (k === 0 && b === Sim.B_TORCH) {
                    // the flame itself breathes
                    var fk = Sim.flickerAt(w, i, w.tick)
                    gcol = Pal.lit(gcol, p, 1, fk, 0, sun, false)
                  }
                  if (k > 0) { if (fill && fill !== p.bg) fill = Pal.dimmed(fill, p.bgRgb, p.dim[k]); if (gcol) gcol = Pal.dimmed(gcol, p.bgRgb, p.dim[k]) }
                  if (fill && fill !== p.bg) { ctx.fillStyle = fill; ctx.fillRect(x * c, y * c, c, c) }
                  // solid cells read as masonry: a dark seam inside every block, and a bright
                  // lip on any side that faces open ground. Floor stays smooth, so you can
                  // tell at a glance where something can be built and where it is rock.
                  if (k === 0 && !glyphs && fill && fill !== p.bg && (t === Sim.T_SOIL || t === Sim.T_STONE || t === Sim.T_ORE || t === Sim.T_GEM || b === Sim.B_WALL)) {
                    var eL = (z >= w.ground[y * WW + x]) ? Math.max(sun, torchLight[i], fireLight[i]) : Math.max(torchLight[i], fireLight[i])
                    var eg = Pal.edges(fill, p, eL)
                    ctx.fillStyle = eg.seam
                    ctx.fillRect(x * c, y * c, c, 1); ctx.fillRect(x * c, y * c, 1, c)
                    ctx.fillStyle = eg.face
                    var lw = Math.max(2, Math.floor(c / 8))
                    if (x > 0 && !Sim.opaque(w, i - 1)) ctx.fillRect(x * c, y * c, lw, c)
                    if (x < WW - 1 && !Sim.opaque(w, i + 1)) ctx.fillRect((x + 1) * c - lw, y * c, lw, c)
                    if (y > 0 && !Sim.opaque(w, i - WW)) ctx.fillRect(x * c, y * c, c, lw)
                    if (y < HH - 1 && !Sim.opaque(w, i + WW)) ctx.fillRect(x * c, (y + 1) * c - lw, c, lw)
                  }
                  if (glyph) { ctx.fillStyle = gcol; ctx.fillText(glyph, x * c + half, y * c + half + 1) }
                  // designations live on the viewed level only
                  var dg = w.desig[i0]
                  if (dg) {
                    var bad = Sim.isUnreachable(w, i0)
                    ctx.fillStyle = bad ? p.desigBad : p.desig; ctx.fillRect(x * c, y * c, c, c)
                    ctx.fillStyle = bad ? p.desigBadGlyph : p.desigGlyph
                    var dgl = dg === Sim.DG_DIG ? "·" : dg === Sim.DG_STAIR ? "X" : dg === Sim.DG_CHOP ? "♠" : root.buildGlyph[w.dbuild[i0]] || "?"
                    ctx.fillText(dgl, x * c + half, y * c + half + 1)
                  }
                }
                // pass 2: items on this level (top item per cell) and, dimmed, on levels seen through open air;
                // a building other than a stockpile hides what lies on it
                var itemAt = {}
                for (var q = 0; q < w.items.length; q++) {
                  var it = w.items[q]; if (it.by) continue
                  var dk = Sim.depthBelow(w, it.i, z); if (dk < 0) continue
                  var bb = w.build[it.i]; if (bb && bb !== Sim.B_STOCK) continue
                  // a plain record: stashing the depth on the item itself put render
                  // state (`_dk`) into every item, and serialize() copies w.items whole
                  if (!itemAt[it.i] || it.t === "artifact") itemAt[it.i] = { t: it.t, i: it.i, dk: dk }
                }
                var IG = { log: "≡", stone: "•", ore: "*", gem: "♦", food: "%", booze: "!", craft: "☼", weapon: "/", artifact: "☼", remains: "†", bar: "▬", pick: "¬", axe: "Γ", armor: "[", meal: "%", cutgem: "◆", jewel: "¤" }
                var IC = { log: p.itemLog, stone: p.itemStone, ore: p.itemOre, gem: p.itemGem, food: p.itemFood, booze: p.itemBooze, craft: p.itemCraft, weapon: p.itemWeapon, artifact: p.itemArtifact, remains: p.itemRemains, bar: p.itemBar, pick: p.itemTool, axe: p.itemTool, armor: p.itemArmor, meal: p.itemMeal, cutgem: p.itemCutGem, jewel: p.itemJewel }
                for (var key in itemAt) { var it2 = itemAt[key]; var icol = IC[it2.t] || p.item; if (it2.dk) icol = Pal.dimmed(icol, p.bgRgb, p.dim[it2.dk]); else { var ib = bright(it2.i, Sim.outdoor(w, it2.i)); if (ib < 0.98) icol = Pal.dimmed(icol, p.bgRgb, Math.max(0.45, ib)) } ctx.fillStyle = icol; ctx.fillText(IG[it2.t] || "?", Sim.ix(it2.i) * c + half, Sim.iy(it2.i) * c + half + 1) }
                // pass 3: creatures; those on lower levels seen through open air show dimmed, like the ground they stand on
                for (var u = 0; u < w.units.length; u++) {
                  var un = w.units[u], udk = Sim.depthBelow(w, un.i, z)
                  if (udk < 0) continue
                  var col = un.k === "dwarf" ? (un.mood_state === "berserk" ? p.urgent : un.mood_state ? p.kobold : p.dwarf) : un.k === "goblin" ? p.goblin : un.k === "wolf" ? p.wolf : un.k === "deer" ? p.deer : un.k === "kobold" ? p.kobold : un.k === "crawler" ? p.crawler : un.k === "sentinel" ? p.sentinel : p.merchant
                  if (un.id === World.selectedId) { ctx.fillStyle = p.select; ctx.fillRect(Sim.ix(un.i) * c, Sim.iy(un.i) * c, c, c); col = p.dwarfSel }
                  if (udk) col = Pal.dimmed(col, p.bgRgb, p.dim[udk])
                  else if (un.id !== World.selectedId) { var ub = bright(un.i, Sim.outdoor(w, un.i)); if (ub < 0.98) col = Pal.dimmed(col, p.bgRgb, Math.max(0.5, ub)) }
                  var gl = un.k === "dwarf" ? "☺" : un.k === "goblin" ? "g" : un.k === "wolf" ? "w" : un.k === "deer" ? "d" : un.k === "kobold" ? "k" : un.k === "crawler" ? "c" : un.k === "sentinel" ? "S" : "☻"
                  ctx.fillStyle = col; ctx.fillText(gl, Sim.ix(un.i) * c + half, Sim.iy(un.i) * c + half + 1)
                }
                // pass 4: weather over outdoor cells (light itself is baked into the fills)
                if (rain || snow) {
                  var seed = w.tick * 7
                  for (var y2 = 0; y2 < HH; y2++) for (var x2 = 0; x2 < WW; x2++) {
                    var gI = y2 * WW + x2
                    if (z < w.ground[gI]) continue
                    var hsh = Sim.hash(gI * 31 + seed)
                    if (rain && (hsh % 23) === 0) { ctx.fillStyle = p.rain; ctx.fillText("/", x2 * c + half, y2 * c + half) }
                    else if (snow && (hsh % 29) === 0) { ctx.fillStyle = p.snowGlyph; ctx.fillText("·", x2 * c + half, y2 * c + half) }
                  }
                }
                // pass 4b: inspection views
                if (mode === "light") {
                  for (var ly = 0; ly < HH; ly++) for (var lx = 0; lx < WW; lx++) {
                    var li = z * N + ly * WW + lx, lo = z >= w.ground[ly * WW + lx]
                    var LL = lo ? Math.max(sun, torchLight[li], fireLight[li]) : Math.max(torchLight[li], fireLight[li])
                    ctx.globalAlpha = 0.5; ctx.fillStyle = p.heat[Math.min(4, Math.floor(LL * 4.999))]; ctx.fillRect(lx * c, ly * c, c, c); ctx.globalAlpha = 1
                  }
                } else if (mode === "mood") {
                  for (var mu = 0; mu < w.units.length; mu++) {
                    var md = w.units[mu]; if (md.k !== "dwarf" || Sim.iz(md.i) !== z) continue
                    ctx.globalAlpha = 0.55
                    ctx.fillStyle = md.mood_state ? p.kobold : md.mood < 18 ? p.urgent : md.mood < 35 ? p.heat[2] : md.mood < 55 ? p.heat[3] : p.itemFood
                    ctx.beginPath(); ctx.arc(Sim.ix(md.i) * c + half, Sim.iy(md.i) * c + half, c * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1
                    ctx.fillStyle = p.dwarf; ctx.fillText("☺", Sim.ix(md.i) * c + half, Sim.iy(md.i) * c + half + 1)
                  }
                } else if (mode === "access") {
                  // the same field the dwarves use to decide what is workable, so the
                  // red cells here are exactly the red designations on the map
                  var am = Sim.reachField(w)
                  for (var ay = 0; ay < HH; ay++) for (var ax = 0; ax < WW; ax++) {
                    var ai = z * N + ay * WW + ax
                    if (!Sim.passable(w, ai)) continue
                    ctx.globalAlpha = am[ai] ? 0.18 : 0.45; ctx.fillStyle = am[ai] ? p.desigGlyph : p.urgent; ctx.fillRect(ax * c, ay * c, c, c); ctx.globalAlpha = 1
                  }
                }
                // pass 5: selection and cursor
                if (root.selStart >= 0 && Sim.iz(root.selStart) === z) {
                  var sx0 = Math.min(Sim.ix(root.selStart), root.cx), sx1 = Math.max(Sim.ix(root.selStart), root.cx)
                  var sy0 = Math.min(Sim.iy(root.selStart), root.cy), sy1 = Math.max(Sim.iy(root.selStart), root.cy)
                  ctx.fillStyle = p.select; ctx.fillRect(sx0 * c, sy0 * c, (sx1 - sx0 + 1) * c, (sy1 - sy0 + 1) * c)
                  ctx.strokeStyle = p.cursor; ctx.lineWidth = 1; ctx.strokeRect(sx0 * c + 0.5, sy0 * c + 0.5, (sx1 - sx0 + 1) * c - 1, (sy1 - sy0 + 1) * c - 1)
                }
                ctx.strokeStyle = p.cursor; ctx.lineWidth = 2
                ctx.strokeRect(root.cx * c + 1, root.cy * c + 1, c - 2, c - 2)
              }
            }

            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              acceptedButtons: Qt.LeftButton | Qt.RightButton
              function cellAt(m) { return { x: Math.max(0, Math.min(Sim.W - 1, Math.floor(m.x / win.cell))), y: Math.max(0, Math.min(Sim.H - 1, Math.floor(m.y / win.cell))) } }
              onPositionChanged: function (m) { var p = cellAt(m); if (p.x !== root.cx || p.y !== root.cy) { if (World.followId && !root.dragging) return; root.cx = p.x; root.cy = p.y } }
              onPressed: function (m) {
                var p = cellAt(m); root.cx = p.x; root.cy = p.y; World.followId = 0
                if (m.button === Qt.RightButton) { root.selectAt(root.cursorIdx()); return }
                if (root.isAreaTool()) { root.dragging = true; root.dragStart = root.cursorIdx(); root.selStart = root.dragStart }
                else root.selectAt(root.cursorIdx())
              }
              onReleased: function (m) {
                if (!root.dragging) return
                root.dragging = false
                var p = cellAt(m); root.cx = p.x; root.cy = p.y
                root.apply(root.dragStart, root.cursorIdx()); root.selStart = -1
              }
              onWheel: function (e) { root.setZ(root.vz + (e.angleDelta.y > 0 ? 1 : -1)) }
            }
          }


          // ---- sidebar ----
          Item {
            id: side
            x: mapFrame.x + mapFrame.width + win.pad; y: mapFrame.y
            width: win.sideW; height: win.mapH
            clip: true

            Connections { target: World; function onTicked() { if (win.visible && (World.rev % 2 === 0)) root.refreshLines() } function onSelectedIdChanged() { root.refreshLines() } }
            Connections { target: root; function onPageChanged() { root.refreshLines() } function onCxChanged() { if (root.page === "local") root.refreshLines() } function onCyChanged() { if (root.page === "local") root.refreshLines() } function onToolChanged() { root.refreshLines() } function onBuildTypeChanged() { root.refreshLines() } function onSelStartChanged() { root.refreshLines() } }

            // tabs as pills
            Row {
              id: tabs
              spacing: Style.space(4)
              Repeater {
                model: [["units", root.t("tab.units"), "u"], ["local", root.t("tab.local"), "i"], ["orders", root.t("tab.orders"), "w"], ["legends", root.t("tab.legends"), "y"], ["help", root.t("tab.help"), "?"]]
                delegate: Rectangle {
                  required property var modelData
                  readonly property bool active: root.page === modelData[0]
                  width: tabText.implicitWidth + Style.space(18); height: Style.space(24); radius: height / 2
                  color: active ? Util.alpha(Color.accent, 0.18) : tabArea.containsMouse ? Util.alpha(Color.popups.text, 0.08) : "transparent"
                  border.width: 1; border.color: active ? Util.alpha(Color.accent, 0.45) : Util.alpha(Color.popups.text, 0.1)
                  Text { id: tabText; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: parent.active ? Color.accent : Util.alpha(Color.popups.text, 0.7); text: parent.modelData[1] }
                  MouseArea { id: tabArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.page = parent.modelData[0] }
                }
              }
            }

            Flickable {
              anchors { top: tabs.bottom; left: parent.left; right: parent.right; bottom: parent.bottom; topMargin: Style.space(10) }
              contentHeight: sideCol.implicitHeight
              clip: true
              boundsBehavior: Flickable.StopAtBounds
              Column {
                id: sideCol
                width: parent.width
                spacing: 3
                Repeater {
                  model: root.lines
                  delegate: Item {
                    required property var modelData
                    required property int index
                    readonly property bool selRow: modelData.c === "accent" && !!modelData.id
                    width: sideCol.width
                    height: Math.max(lineText.implicitHeight, tailText.visible ? tailText.implicitHeight : 0) + (selRow ? 4 : 0)
                    Rectangle { visible: parent.selRow; anchors.fill: parent; radius: 4; color: Util.alpha(Color.accent, 0.1) }
                    Rectangle { visible: parent.selRow; width: 3; height: parent.height - 4; y: 2; radius: 1.5; color: Color.accent }
                    Rectangle { visible: !!modelData.id && rowArea.containsMouse && !parent.selRow; anchors.fill: parent; radius: 4; color: Util.alpha(Color.popups.text, 0.05) }
                    MouseArea { id: rowArea; anchors.fill: parent; hoverEnabled: !!modelData.id; enabled: !!modelData.id; cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor; onClicked: root.focusUnit(Sim.unitById(World.w, modelData.id)) }
                    Text {
                      id: lineText
                      x: parent.selRow ? 8 : 0
                      y: parent.selRow ? 2 : 0
                      width: (tailText.visible ? Math.min(implicitWidth, side.width * 0.62) : side.width) - x
                      font.family: root.mono; font.pixelSize: Style.font.bodySmall
                      wrapMode: modelData.wrap ? Text.Wrap : Text.NoWrap
                      elide: modelData.wrap ? Text.ElideNone : Text.ElideRight
                      color: modelData.c === "accent" ? Color.accent : modelData.c === "urgent" ? Color.urgent : modelData.c === "muted" ? Util.alpha(Color.popups.text, 0.6)
                           : modelData.c === "warn" ? Qt.tint(Color.popups.text, Util.alpha(Color.urgent, 0.55)) : modelData.c === "good" ? Qt.tint(Color.popups.text, Util.alpha(Color.accent, 0.5)) : Color.popups.text
                      text: modelData.t
                    }
                    Text {
                      id: tailText
                      visible: !!modelData.tail
                      anchors { right: parent.right; top: parent.top; rightMargin: parent.selRow ? 6 : 0; topMargin: parent.selRow ? 2 : 0 }
                      width: side.width - lineText.width - 12
                      horizontalAlignment: Text.AlignRight
                      elide: Text.ElideRight
                      font.family: root.mono; font.pixelSize: Style.font.bodySmall
                      color: modelData.c2 === "urgent" ? Color.urgent : modelData.c2 === "warn" ? Qt.tint(Color.popups.text, Util.alpha(Color.urgent, 0.55)) : modelData.c2 === "magenta" ? Color.accent : Util.alpha(Color.popups.text, 0.7)
                      text: modelData.tail || ""
                    }
                  }
                }
              }
            }

            // build menu popup
            Rectangle {
              visible: root.buildMenu
              anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
              height: buildCol.implicitHeight + Style.space(20)
              color: Color.popups.background
              border.color: Util.alpha(Color.accent, 0.6); border.width: 1
              radius: Math.min(Style.cornerRadius, 8)
              Column {
                id: buildCol
                anchors { fill: parent; margins: Style.space(10) }
                spacing: 3
                Text { font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: Color.accent; text: root.t("h.buildwhat") }
                Repeater {
                  model: root.buildOrder
                  delegate: Item {
                    required property var modelData
                    width: buildCol.width; height: bRow.implicitHeight + 4
                    Rectangle { visible: bArea.containsMouse; anchors.fill: parent; radius: 4; color: Util.alpha(Color.accent, 0.1) }
                    Row {
                      id: bRow
                      anchors.verticalCenter: parent.verticalCenter
                      spacing: Style.space(8)
                      Rectangle { width: bk.implicitWidth + 10; height: bk.implicitHeight + 2; radius: 3; color: Util.alpha(Color.accent, 0.14); border.width: 1; border.color: Util.alpha(Color.accent, 0.35)
                        Text { id: bk; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.caption; color: Color.accent; text: modelData } }
                      Text { font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: Color.popups.text; text: { var bt = root.buildKeys[modelData], bi = Sim.BUILD_INFO[bt]; return bi.name + (bi.mat ? "  · 1 " + Sim.ITEM_NAME[bi.mat] : bt === Sim.B_FARM ? "  · terra/grama/musgo" : "") } }
                    }
                    MouseArea { id: bArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { root.buildType = root.buildKeys[modelData]; root.tool = "build"; root.buildMenu = false; root.selStart = -1 } }
                  }
                }
              }
            }
          }

          // ---- log + hints ----
          Item {
            id: foot
            x: win.pad; y: mapFrame.y + mapFrame.height + win.pad
            width: parent.width - win.pad * 2; height: win.logH
            Column {
              anchors { left: parent.left; right: parent.right; top: parent.top }
              spacing: 1
              Repeater {
                model: {
                  World.rev
                  var w = World.w; if (!w) return []
                  var n = Math.min(5, w.log.length), out = []
                  for (var k = w.log.length - n; k < w.log.length; k++) out.push(w.log[k])
                  return out
                }
                delegate: Row {
                  required property var modelData
                  required property int index
                  width: foot.width
                  spacing: Style.space(8)
                  opacity: 0.45 + 0.14 * index
                  Text { width: Style.space(52); font.family: root.mono; font.pixelSize: Style.font.caption; color: Util.alpha(Color.popups.text, 0.6); text: { var d = Sim.date({ tick: modelData.t }); return d.seasonName.substr(0, 3) + " d" + d.day } }
                  // The announcements are the stories: a caravan arriving, an
                  // artifact being named, a wave repelled. Eliding them cut off
                  // the end, which is the part worth reading. The Row grows in
                  // height and the Column above accommodates it.
                  Text { width: foot.width - Style.space(60); wrapMode: Text.Wrap; font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: modelData.l === 2 ? Color.urgent : modelData.l === 1 ? Color.accent : Color.popups.text; text: modelData.m }
                }
              }
            }
            Text {
              anchors { right: parent.right; bottom: parent.bottom; bottomMargin: 2 }
              font.family: root.mono; font.pixelSize: Style.font.caption; font.letterSpacing: 1
              color: Util.alpha(Color.popups.text, 0.45)
              text: "OMAHOLD · by ZeD"
            }
            Flow {
              anchors { left: parent.left; right: parent.right; rightMargin: Style.space(150); bottom: parent.bottom }
              spacing: Style.space(10)
              KeyHint { key: "d"; label: root.t("tool.dig") } KeyHint { key: "s"; label: root.t("tool.stair") } KeyHint { key: "c"; label: root.t("tool.chop") } KeyHint { key: "b"; label: root.t("tool.build") }
              KeyHint { key: "x"; label: root.t("hint.cancel") } KeyHint { key: "r"; label: root.t("hint.remove") } KeyHint { key: "< >"; label: root.t("hint.levels") } KeyHint { key: "Enter"; label: root.t("hint.apply") }
              KeyHint { key: root.t("key.space"); label: root.t("hint.pause") } KeyHint { key: "] ["; label: root.t("hint.dwarves") } KeyHint { key: "?"; label: root.t("hint.help") } KeyHint { key: "Esc"; label: root.t("hint.menu") }
            }
          }

          // ---- toast ----
          Rectangle {
            visible: root.status !== "" && !root.menuOpen
            anchors { horizontalCenter: mapFrame.horizontalCenter; bottom: mapFrame.bottom; bottomMargin: Style.space(12) }
            width: toastText.width + Style.space(28); height: toastText.implicitHeight + Style.space(14)
            radius: height / 2
            color: Util.alpha(Color.popups.background, 0.92)
            border.width: 1; border.color: Util.alpha(Color.accent, 0.5)
            // wrap, not elide: these are the key hints, and eliding cut them at
            // the end - which is the half that says what to press
            Text { id: toastText; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: Color.popups.text; text: root.status; width: Math.min(implicitWidth, mapFrame.width - Style.space(60)); wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter }
          }
          Rectangle {
            visible: root.status === "" && !root.menuOpen
            anchors { left: mapFrame.left; bottom: mapFrame.bottom; leftMargin: Style.space(8); bottomMargin: Style.space(8) }
            width: toolText.implicitWidth + Style.space(16); height: toolText.implicitHeight + Style.space(8)
            radius: height / 2
            color: Util.alpha(Color.popups.background, 0.85)
            border.width: 1; border.color: Util.alpha(root.tool === "look" ? Color.popups.text : Color.accent, 0.35)
            Text { id: toolText; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.caption; color: root.tool === "look" ? Util.alpha(Color.popups.text, 0.7) : Color.accent; text: root.toolLabel() }
          }

          // ---- menu ----
          Rectangle {
            visible: root.menuOpen
            anchors.fill: parent
            color: Util.alpha(Color.popups.background, 0.72)
            MouseArea { anchors.fill: parent; onClicked: root.closeMenu() }
            Rectangle {
              id: menuCard
              anchors.centerIn: parent
              width: Math.min(parent.width - Style.space(80), Style.space(620))
              height: Math.min(parent.height - Style.space(60), menuCol.implicitHeight + Style.space(36))
              radius: Math.max(6, Style.cornerRadius)
              color: Color.popups.background
              border.width: 1; border.color: Util.alpha(Color.accent, 0.55)
              MouseArea { anchors.fill: parent; onClicked: {} }
              Flickable {
                anchors { fill: parent; margins: Style.space(18) }
                contentHeight: menuCol.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                Column {
                  id: menuCol
                  width: parent.width
                  spacing: 2
                  Repeater {
                    model: root.menuRows
                    delegate: Item {
                      required property var modelData
                      required property int index
                      readonly property bool isItem: modelData.kind === "item"
                      readonly property bool current: isItem && index === root.menuIndex
                      width: menuCol.width
                      height: modelData.kind === "brand" ? Style.space(34) : modelData.kind === "gap" ? Style.space(10) : modelData.kind === "title" ? (mTitle.implicitHeight + (modelData.sub ? mSub.implicitHeight + 4 : 0) + Style.space(12)) : modelData.kind === "note" ? mNote.implicitHeight + 8 : mLabel.implicitHeight + (modelData.hint && modelData.wrap ? mHintWrap.implicitHeight + 2 : 0) + Style.space(12)
                      // brand
                      Row {
                        visible: modelData.kind === "brand"
                        spacing: Style.space(8)
                        Text { font.family: root.mono; font.pixelSize: Style.font.display; font.bold: true; font.letterSpacing: 2; color: Color.accent; text: "OMAHOLD" }
                        Text { anchors.baseline: parent.children[0].baseline; font.family: root.mono; font.pixelSize: Style.font.caption; color: Util.alpha(Color.popups.text, 0.55); text: "by ZeD" }
                      }
                      Rectangle {
                        visible: modelData.kind === "brand"
                        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; bottomMargin: 4 }
                        height: 1
                        color: Util.alpha(Color.accent, 0.3)
                      }
                      // title
                      Text { id: mTitle; visible: modelData.kind === "title"; font.family: root.mono; font.pixelSize: Style.font.heading; font.bold: true; color: Color.popups.text; text: modelData.t || "" }
                      Text { id: mSub; visible: modelData.kind === "title" && !!modelData.sub; anchors.top: mTitle.bottom; anchors.topMargin: 4; width: parent.width; wrapMode: Text.Wrap; font.family: root.mono; font.pixelSize: Style.font.caption; color: Util.alpha(Color.popups.text, 0.55); text: modelData.sub || "" }
                      // width and wrap, or a long note runs off the menu: the
                      // longest string in the game is one of these, and English
                      // makes it 30% longer than the Portuguese it was sized for
                      Text { id: mNote; visible: modelData.kind === "note"; width: parent.width - Style.space(24); wrapMode: Text.Wrap; font.family: root.mono; font.pixelSize: Style.font.bodySmall; color: Util.alpha(Color.popups.text, 0.55); text: modelData.t || "" }
                      // item
                      Rectangle {
                        visible: parent.isItem
                        anchors.fill: parent
                        radius: 6
                        color: parent.current ? Util.alpha(Color.accent, 0.16) : (mArea.containsMouse ? Util.alpha(Color.popups.text, 0.06) : "transparent")
                        border.width: parent.current ? 1 : 0; border.color: Util.alpha(Color.accent, 0.5)
                      }
                      Rectangle { visible: parent.current; width: 3; height: parent.height - 8; y: 4; x: 0; radius: 1.5; color: Color.accent }
                      Text {
                        id: mLabel
                        visible: parent.isItem
                        x: Style.space(12); y: Style.space(6)
                        font.family: root.mono; font.pixelSize: Style.font.body
                        color: parent.current ? Color.accent : (modelData.empty ? Util.alpha(Color.popups.text, 0.5) : Color.popups.text)
                        text: modelData.t || ""
                        width: parent.width - Style.space(24) - (mKey.visible ? mKey.width + Style.space(8) : 0) - (mHint.visible ? mHint.implicitWidth + Style.space(8) : 0)
                        wrapMode: modelData.wrap ? Text.Wrap : Text.NoWrap
                        elide: modelData.wrap ? Text.ElideNone : Text.ElideRight
                      }
                      Text {
                        id: mHintWrap
                        visible: parent.isItem && !!modelData.hint && !!modelData.wrap
                        anchors { top: mLabel.bottom; left: mLabel.left; topMargin: 2 }
                        width: parent.width - Style.space(24) - (mKey.visible ? mKey.width + Style.space(8) : 0)
                        wrapMode: Text.Wrap
                        font.family: root.mono; font.pixelSize: Style.font.caption
                        color: Util.alpha(Color.popups.text, 0.55)
                        text: modelData.hint || ""
                      }
                      Text {
                        id: mHint
                        visible: parent.isItem && !!modelData.hint && !modelData.wrap
                        anchors { verticalCenter: mLabel.verticalCenter; right: mKey.visible ? mKey.left : parent.right; rightMargin: Style.space(8) }
                        font.family: root.mono; font.pixelSize: Style.font.bodySmall
                        color: modelData.value ? (parent.current ? Color.popups.text : Util.alpha(Color.popups.text, 0.85)) : Util.alpha(Color.popups.text, 0.5)
                        text: modelData.hint || ""
                      }
                      Rectangle {
                        id: mKey
                        visible: parent.isItem && !!modelData.key
                        anchors { verticalCenter: mLabel.verticalCenter; right: parent.right; rightMargin: Style.space(8) }
                        width: mKeyText.implicitWidth + Style.space(10); height: mKeyText.implicitHeight + 4; radius: 4
                        color: Util.alpha(Color.accent, parent.current ? 0.22 : 0.1); border.width: 1; border.color: Util.alpha(Color.accent, 0.35)
                        Text { id: mKeyText; anchors.centerIn: parent; font.family: root.mono; font.pixelSize: Style.font.caption; color: Color.accent; text: modelData.key || "" }
                      }
                      MouseArea {
                        id: mArea
                        anchors.fill: parent
                        enabled: parent.isItem
                        hoverEnabled: parent.isItem
                        cursorShape: parent.isItem ? Qt.PointingHandCursor : Qt.ArrowCursor
                        acceptedButtons: Qt.LeftButton | Qt.RightButton
                        onEntered: if (parent.isItem) root.menuIndex = index
                        onClicked: function (m) { root.menuIndex = index; root.menuActivate(m.button === Qt.RightButton ? -1 : 1) }
                        onWheel: function (e) { if (modelData.adjust) modelData.adjust(e.angleDelta.y > 0 ? 1 : -1); else e.accepted = false }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
