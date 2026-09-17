pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "sim.js" as Sim
import "palette.js" as Pal

// The one copy of the world, shared by the bar widget, the corner window and
// the overlay. Owns the clock, the save file and the theme palette.
//
// Pacing is the whole trick for a game that lives in the shell: while nobody
// is looking it ticks every couple of seconds (a day of fortress time every
// few minutes, so there is something new when you come back); while the
// overlay or the corner window is up it runs at four ticks a second, and
// nothing is ever drawn unless a surface is visible.
Singleton {
  id: root

  property var w: null
  property int rev: 0                 // bumps once per tick; bindings hang off it
  property bool ready: false
  property string loadError: ""

  property bool open: false           // the overlay
  property bool menu: false           // the overlay's menu
  property string viewMode: "normal"  // normal light mood access
  property bool peek: false           // the corner window
  property bool paused: false
  property int speed: 1               // 1, 2, 4 while watched
  property int backgroundMs: 2000     // tick interval while nobody watches (0 = freeze)
  property int popCap: 20
  property bool glyphs: false         // pure-glyph rendering instead of blocks
  property int viewZ: 5
  property int followId: 0
  property int selectedId: 0

  // What the bar shows; refreshed every tick, cheap
  property int pop: 0
  property int alerts: 0
  property var summary: ({})

  property var theme: ({})
  property var pal: Pal.build({})

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || (home + "/.local/state")) + "/omarchy/omahold"
  readonly property string savePath: stateDir + "/world.json"
  readonly property string slotsPath: stateDir + "/slots.json"
  readonly property string optionsPath: stateDir + "/options.json"
  property var slots: ({})            // "1".."5" -> meta from Sim.slotMeta
  property int waveMul: 1             // 0 calm (half), 1 normal, 2 brutal — see difficulty()
  property string difficulty: "normal"
  property bool enemies: true
  readonly property string colorsPath: (Quickshell.env("XDG_STATE_HOME") || (home + "/.local/state")) + "/omarchy/current/theme/colors.toml"

  // ---- the disk ---------------------------------------------------------------
  // Everything that touches a file goes through save.py, always invoked as
  // `/usr/bin/python3 -I save.py <mode> <relative paths>`. This used to be
  // `Process` running `sh -c 'mkdir -p "$1"; cat "$2" …'` plus `FileView` for
  // writes plus `execDetached(["rm", "-f", …])` for clearing a slot — three
  // different ways in, none of which could check the file it was about to
  // touch and then touch that same file. The marketplace security review
  // blocked omarchy-ganja twice over exactly that (issue #6530): in shell each
  // command resolves the path again, so a check and a use are two resolutions
  // and what was checked can be exchanged in between. The guarantees are in
  // save.py's header; `test/hostile.py` is the proof, 40 checks.
  //
  // `-I` is isolated mode: the interpreter ignores PYTHON*, the user site and
  // the script's own directory on sys.path.
  readonly property string helper: String(Qt.resolvedUrl("save.py")).replace("file://", "")

  // The helper only works inside $HOME, which is its root of trust: every
  // component below it is opened from a descriptor of the one above. An
  // XDG_STATE_HOME pointing outside $HOME falls back to the default location
  // rather than losing the guarantee.
  readonly property string relDir: {
    var h = root.home, sd = root.stateDir
    if (h && sd.indexOf(h + "/") === 0) return sd.substring(h.length + 1)
    return ".local/state/omarchy/omahold"
  }

  // Closed environment: the child inherits nothing from the bar's shell. HOME
  // goes because it is the helper's root of trust; PATH because a process
  // needs one.
  readonly property var helperEnv: ({ "PATH": "/usr/bin:/bin", "HOME": root.home })

  // The last reason a write was refused, cleared by the next good one.
  property string saveError: ""

  readonly property bool watched: root.open || root.peek

  signal ticked()
  signal worldReplaced()

  // ---- clock ----------------------------------------------------------------
  Timer {
    id: clock
    interval: root.watched ? Math.max(60, Math.round(250 / root.speed)) : Math.max(250, root.backgroundMs)
    running: root.ready && root.w !== null && !root.paused && (root.watched || root.backgroundMs > 0)
    repeat: true
    onTriggered: root.step()
  }

  function step() {
    if (!root.w) return
    try { Sim.tick(root.w) } catch (e) { root.loadError = "tick: " + e + " @" + e.lineNumber; root.paused = true; console.warn("omahold tick failed", e, e.lineNumber); return }
    root.rev++
    root.pop = Sim.pop(root.w)
    root.alerts = root.open ? 0 : root.w.alerts
    if (root.open) root.w.alerts = 0
    if (root.rev % 4 === 0 || root.open) root.summary = Sim.summary(root.w)
    if (root.followId) {
      var u = Sim.unitById(root.w, root.followId)
      if (u) root.viewZ = Sim.iz(u.i); else root.followId = 0
    }
    root.ticked()
  }

  onOpenChanged: {
    if (root.open) { if (root.w) { root.w.alerts = 0; root.alerts = 0 } }
    else root.save()
  }

  // ---- world lifecycle --------------------------------------------------------
  function newWorld(seed) {
    var s = seed === undefined || seed === null || seed === "" ? Math.floor(Math.random() * 4294967295) : (parseInt(seed, 10) >>> 0)
    root.w = Sim.newWorld(s)
    root.w.popCap = root.popCap
    root.viewZ = Sim.iz(root.w.depot)
    root.followId = 0; root.selectedId = 0
    root.rev++
    root.pop = Sim.pop(root.w)
    root.summary = Sim.summary(root.w)
    root.ready = true
    root.worldReplaced()
    root.save()
  }

  function newFromPreset(presetId, n, seed) {
    var sd = seed === undefined || seed === null || seed === "" ? Math.floor(Math.random() * 4294967295) : (parseInt(seed, 10) >>> 0)
    var count = parseInt(n, 10); if (!isFinite(count) || count <= 0) count = 0
    root.w = Sim.newFromPreset(sd, presetId, count)
    root.w.popCap = Math.max(root.popCap, Sim.pop(root.w) + 6)
    root.w.waveMul = root.difficulty === "calma" ? 0.6 : root.difficulty === "brutal" ? 1.6 : 1
    if (!root.enemies) root.w.peaceful = true
    root.viewZ = root.w.scenario || root.w.preset === "Vale tranquilo" ? Sim.iz(root.w.depot) - 2 : Sim.iz(root.w.depot)
    root.followId = 0; root.selectedId = 0
    root.rev++
    root.pop = Sim.pop(root.w)
    root.summary = Sim.summary(root.w)
    root.ready = true
    root.worldReplaced()
    root.save()
  }
  function newScenario(n) {
    var count = parseInt(n, 10); if (!isFinite(count) || count <= 0) count = 12
    root.w = Sim.newScenario(Math.floor(Math.random() * 4294967295), count)
    root.w.popCap = Math.max(root.popCap, count + 6)
    root.viewZ = Sim.iz(root.w.depot) - 2
    root.followId = 0; root.selectedId = 0
    root.rev++
    root.pop = Sim.pop(root.w)
    root.summary = Sim.summary(root.w)
    root.ready = true
    root.worldReplaced()
    root.save()
  }
  function raidNow() {
    if (!root.w || root.w.raid) return false
    var ok = Sim.spawnRaid(root.w, Sim.date(root.w), root.w.scenario ? root.w.scenario.wave : 0)
    root.rev++; return ok
  }

  function adopt(json) {
    var w = null
    try { w = Sim.deserialize(json) } catch (e) { console.warn("omahold: save unreadable", e); w = null }
    if (!w) { root.newWorld(); return }
    root.w = w
    root.w.popCap = root.popCap
    root.w.waveMul = root.difficulty === "calma" ? 0.6 : root.difficulty === "brutal" ? 1.6 : 1
    if (!root.enemies) root.w.peaceful = true
    root.viewZ = Sim.iz(root.w.depot)
    root.rev++
    root.pop = Sim.pop(root.w)
    root.summary = Sim.summary(root.w)
    root.ready = true
    root.worldReplaced()
  }

  // Three files in one read, because the panel needs all three at startup and
  // three processes would be three chances to be raced.
  property string loaded: ""
  Process {
    id: loader
    running: true
    command: ["/usr/bin/python3", "-I", root.helper, "read", root.relDir, "options.json", "slots.json", "world.json"]
    clearEnvironment: true
    environment: root.helperEnv
    stderr: StdioCollector { id: loaderErr; waitForEnd: true }
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.loaded = String(text) }
    onExited: (exitCode, exitStatus) => {
      if (exitCode !== 0) {
        // A refusal is not an empty disk. Treating it as one would start a new
        // fortress and let the next autosave write over the save the helper
        // just refused to read — which is the whole reason save.py tells the
        // two apart instead of answering "no save" to both.
        root.loadError = String(loaderErr.text).trim() || ("exit " + exitCode)
        console.warn("omahold: load refused:", root.loadError)
        return
      }
      var parts = root.loaded.split(String.fromCharCode(30))
      try { if (parts[0] && parts[0].trim()) root.applyOptions(JSON.parse(parts[0]), true) } catch (e) { console.warn("omahold: options unreadable", e) }
      root.optionsLoaded = true
      root.mergeWidgetSettings()
      try { if (parts[1] && parts[1].trim()) root.slots = JSON.parse(parts[1]) } catch (e2) { console.warn("omahold: slots index unreadable", e2) }
      var t = parts[2] || ""
      if (t.trim().length > 0) root.adopt(t)
      else root.newWorld()
    }
  }

  // One writer, one file at a time, with a queue: saving a slot writes the
  // slot and the index, and an autosave can land while either is in flight.
  property var writeQueue: []
  property string pendingName: ""
  property string pendingText: ""

  function queueWrite(name, text) {
    if (!name || !text) return
    var q = root.writeQueue.slice()
    // One pending write per file: a newer world supersedes an older one that
    // has not gone out yet, instead of both being written in order.
    for (var k = 0; k < q.length; k++) if (q[k].name === name) { q.splice(k, 1); break }
    q.push({ name: name, text: text })
    root.writeQueue = q
    root.pumpWrites()
  }
  function pumpWrites() {
    if (writer.running || root.writeQueue.length === 0) return
    var q = root.writeQueue.slice(), job = q.shift()
    root.writeQueue = q
    root.pendingName = job.name
    root.pendingText = job.text
    // Assigning `true` to something already `true` is not a transition and
    // emits nothing, so stdin would stay closed from the previous round and
    // the write would never reach the helper. It is reopened here, every time.
    writer.stdinEnabled = true
    writer.running = true
  }

  Process {
    id: writer
    stdinEnabled: true
    command: ["/usr/bin/python3", "-I", root.helper, "write", root.relDir, root.pendingName]
    clearEnvironment: true
    environment: root.helperEnv
    onStarted: {
      writer.write(root.pendingText)
      writer.stdinEnabled = false     // this is what closes stdin
    }
    stderr: StdioCollector { id: writerErr; waitForEnd: true }
    onExited: (exitCode, exitStatus) => {
      if (exitCode !== 0) {
        root.saveError = String(writerErr.text).trim() || ("exit " + exitCode)
        console.warn("omahold: write refused:", root.saveError)
      } else if (root.saveError !== "") root.saveError = ""
      root.pumpWrites()
    }
  }

  function saveSlot(n) {
    if (!root.w || n < 1 || n > 5) return false
    root.queueWrite("slot-" + n + ".json", Sim.serialize(root.w))
    var meta = Sim.slotMeta(root.w)
    var next = JSON.parse(JSON.stringify(root.slots || {})); next[String(n)] = meta
    root.slots = next
    root.queueWrite("slots.json", JSON.stringify(next))
    return true
  }
  function clearSlot(n) {
    if (n < 1 || n > 5) return
    var next = JSON.parse(JSON.stringify(root.slots || {})); delete next[String(n)]
    root.slots = next
    root.queueWrite("slots.json", JSON.stringify(next))
    root.removingSlot = n
    remover.running = true
  }
  property int removingSlot: 0
  Process {
    id: remover
    command: ["/usr/bin/python3", "-I", root.helper, "remove", root.relDir, "slot-" + root.removingSlot + ".json"]
    clearEnvironment: true
    environment: root.helperEnv
  }

  property int loadingSlot: 0
  property string loadedSlot: ""
  Process {
    id: slotReader
    command: ["/usr/bin/python3", "-I", root.helper, "read", root.relDir, "slot-" + root.loadingSlot + ".json"]
    clearEnvironment: true
    environment: root.helperEnv
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.loadedSlot = String(text) }
    onExited: (exitCode, exitStatus) => {
      if (exitCode !== 0) { console.warn("omahold: slot read refused"); return }
      if (root.loadedSlot.trim().length > 0) { root.adopt(root.loadedSlot); root.save() }
      else console.warn("omahold: slot empty")
    }
  }
  function loadSlot(n) { if (!root.slots || !root.slots[String(n)]) return false; root.loadingSlot = n; slotReader.running = true; return true }

  // ---- options -----------------------------------------------------------------
  // Two sources disagree about the same settings: options.json (what the player
  // chose in the menu) and the widget entry in shell.json (what they wrote by
  // hand). They used to race - the bar widget's Component.onCompleted could land
  // before or after the loader Process - and whoever came last also rewrote
  // options.json. Now options.json wins for any key it actually contains, and
  // the shell.json values fill in the rest, once, without saving back.
  property bool optionsLoaded: false
  property var savedOptionKeys: ({})
  property var widgetSettings: ({})
  property bool applyingOptions: false

  function setWidgetSettings(o) {
    root.widgetSettings = o || ({})
    if (root.optionsLoaded) root.mergeWidgetSettings()
  }
  function mergeWidgetSettings() {
    var o = root.widgetSettings || ({}), saved = root.savedOptionKeys || ({}), out = ({}), any = false
    for (var k in o) { if (o[k] === undefined || o[k] === null || saved[k]) continue; out[k] = o[k]; any = true }
    if (any) root.applyOptions(out)
  }

  function applyOptions(o, remember) {
    if (!o) return
    root.applyingOptions = true
    if (remember) { var ks = ({}); for (var rk in o) ks[rk] = true; root.savedOptionKeys = ks }
    if (o.backgroundMs !== undefined) root.backgroundMs = Number(o.backgroundMs)
    if (o.glyphs !== undefined) root.glyphs = !!o.glyphs
    if (o.peek !== undefined) root.peek = !!o.peek
    if (o.popCap !== undefined) { root.popCap = Number(o.popCap); if (root.w) root.w.popCap = root.popCap }
    if (o.difficulty !== undefined) root.setDifficulty(String(o.difficulty), true)
    if (o.enemies !== undefined) { root.enemies = !!o.enemies; if (root.w) root.w.peaceful = !root.enemies }
    if (o.speed !== undefined) root.speed = Number(o.speed)
    root.applyingOptions = false
  }
  function saveOptions() {
    var o = { backgroundMs: root.backgroundMs, glyphs: root.glyphs, peek: root.peek, popCap: root.popCap, difficulty: root.difficulty, enemies: root.enemies, speed: root.speed }
    root.queueWrite("options.json", JSON.stringify(o))
  }
  function setDifficulty(d, quiet) {
    root.difficulty = d
    var mul = d === "calma" ? 0.6 : d === "brutal" ? 1.6 : 1
    if (root.w) root.w.waveMul = mul
    if (!quiet) root.saveOptions()
  }
  function setEnemies(on) { root.enemies = on; if (root.w) root.w.peaceful = !on; root.saveOptions() }
  // read both flags directly: an intermediate binding would only be as fresh as
  // the engine's next evaluation, and applyingOptions flips inside one call
  onBackgroundMsChanged: if (root.ready && !root.applyingOptions) root.saveOptions()
  onGlyphsChanged: if (root.ready && !root.applyingOptions) root.saveOptions()
  onPeekChanged: if (root.ready && !root.applyingOptions) root.saveOptions()
  onSpeedChanged: if (root.ready && !root.applyingOptions) root.saveOptions()
  onPopCapChanged: { if (root.w) root.w.popCap = root.popCap; if (root.ready && !root.applyingOptions) root.saveOptions() }

  property int savedRev: -1
  function save() {
    if (!root.w) return
    root.queueWrite("world.json", Sim.serialize(root.w))
    root.savedRev = root.rev
  }
  // frozen in the background, or paused for an hour: nothing changed, nothing to write
  Timer { interval: 90000; running: root.ready; repeat: true; onTriggered: if (root.rev !== root.savedRev) root.save() }

  // ---- theme -----------------------------------------------------------------
  FileView {
    id: colorsFile
    path: root.colorsPath
    watchChanges: true
    printErrors: false
    onLoaded: root.applyTheme(text())
    onFileChanged: reload()
  }
  // The shell singleton updates on theme switch; when it does, re-read the
  // full 16-color file (the singleton only carries the four roles).
  Connections {
    target: Color
    function onAccentChanged() { colorsFile.reload() }
    function onBackgroundChanged() { colorsFile.reload() }
    function onForegroundChanged() { colorsFile.reload() }
  }
  function applyTheme(text) {
    var t = Pal.parseToml(text)
    if (!t.background) t.background = Pal.hex(String(Color.background))
    if (!t.foreground) t.foreground = Pal.hex(String(Color.foreground))
    if (!t.accent) t.accent = Pal.hex(String(Color.accent))
    root.theme = t
    root.pal = Pal.build(t)
    root.rev++
  }

  // ---- orders from the UI -----------------------------------------------------
  function designateRect(a, b, tool, bt) { if (!root.w) return 0; var n = Sim.designateRect(root.w, a, b, tool, bt); if (n) root.rev++; return n }
  function toggleLockdown() { if (!root.w) return; root.w.lockdown = !root.w.lockdown; Sim.announce(root.w, root.w.lockdown ? "Portas trancadas. Ninguém de fora entra." : "Portas destrancadas.", 0); root.rev++ }
  function cycleSpeed() { root.speed = root.speed >= 4 ? 1 : root.speed * 2 }

  // ---- IPC: omarchy-shell omahold <method> --------------------------------------
  IpcHandler {
    target: "omahold"
    function toggle(): string { root.open = !root.open; return root.open ? "open" : "closed" }
    function open(): string { root.open = true; return "ok" }
    function close(): string { root.open = false; return "ok" }
    function peek(): string { root.peek = !root.peek; return root.peek ? "peek on" : "peek off" }
    function pause(): string { root.paused = !root.paused; return root.paused ? "paused" : "running" }
    function status(): string { if (!root.w) return "no world"; var s = Sim.summary(root.w); s.open = root.open; s.peek = root.peek; s.paused = root.paused; s.viewZ = root.viewZ; return JSON.stringify(s) }
    function save(): string { root.save(); return "ok" }
    function newWorld(seed: string): string { root.newWorld(seed); return root.w ? root.w.name + " (seed " + root.w.seed + ")" : "failed" }
    function scenario(n: string): string { root.newScenario(n); return root.w ? root.w.name + " (cenário, " + Sim.pop(root.w) + " anões)" : "failed" }
    function hour(h: string): string { if (!root.w) return "no world"; Sim.setHour(root.w, parseFloat(h)); root.rev++; return String(Sim.sunLevel(root.w).toFixed(2)) }
    function view(mode: string): string { root.viewMode = mode; return mode }
    function raid(): string { return root.raidNow() ? "goblins a caminho" : "já há um ataque em curso (ou sem mundo)" }
    function preset(id: string): string { root.newFromPreset(id, 0, ""); return root.w ? root.w.name + " · " + (root.w.preset || id) : "failed" }
    function presets(): string { return Sim.PRESETS.map(function (p) { return p.id + ": " + p.name }).join("\n") }
    function saveSlot(n: string): string { return root.saveSlot(parseInt(n, 10)) ? "ok" : "failed" }
    function loadSlot(n: string): string { return root.loadSlot(parseInt(n, 10)) ? "loading" : "empty" }
    function slots(): string { return JSON.stringify(root.slots) }
    function speed(n: string): string { var v = parseInt(n, 10); if (v === 1 || v === 2 || v === 4) root.speed = v; return String(root.speed) }
    function background(ms: string): string { var v = parseInt(ms, 10); if (isFinite(v) && v >= 0) root.backgroundMs = v; return String(root.backgroundMs) }
  }
}
