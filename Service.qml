import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import "sim.js" as Sim
import "palette.js" as Pal

// The always-loaded half: forces the World singleton into existence so the
// hold keeps ticking with or without a bar widget, and hosts the corner
// window ("peek") - a small live view on the top layer, for keeping half an
// eye on the dwarves while doing something else. Like Taskbar Colony's strip,
// but a window into the ground.
Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property bool alive: World.ready

  readonly property int cell: 6
  readonly property int mapW: Sim.W * cell
  readonly property int mapH: Sim.H * cell

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

      visible: World.peek && !World.open && isTarget && World.ready
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "zed-omahold-peek"
      WlrLayershell.layer: WlrLayer.Top
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      anchors { right: true; bottom: true }
      margins { right: Style.gapsOut * 2; bottom: Style.gapsOut * 2 }
      implicitWidth: root.mapW + 2
      implicitHeight: root.mapH + 18 + 2

      Rectangle {
        anchors.fill: parent
        color: Color.popups.background
        border.color: Color.popups.border
        border.width: 1
        radius: Math.min(Style.cornerRadius, 6)

        Canvas {
          id: mini
          x: 1; y: 1
          width: root.mapW; height: root.mapH
          renderStrategy: Canvas.Immediate
          Connections { target: World; function onTicked() { if (win.visible) mini.requestPaint() } function onRevChanged() { if (win.visible) mini.requestPaint() } }
          onVisibleChanged: if (visible) requestPaint()
          onPaint: {
            var ctx = getContext("2d"), w = World.w, p = World.pal
            if (!w) return
            var c = root.cell, z = World.viewZ, N = Sim.N, g = p.g
            ctx.fillStyle = p.bg; ctx.fillRect(0, 0, width, height)
            var sun = Sim.sunLevel(w), snow = w.weather === 2, RL = Sim.renderLight(w, w.tick), torchLight = RL.torch, fireLight = RL.fire, beaconLight = RL.beacon
            // Six-pixel cells cannot afford the subtle map palette: at this size the
            // brighter glyph colors are the fills, or the theme's soil is the background.
            var dimK = [1, 0.7, 0.45, 0.25]
            var fog = World.fog
            for (var y = 0; y < Sim.H; y++) for (var x = 0; x < Sim.W; x++) {
              var i0 = z * N + y * Sim.W + x, i = i0, t = w.tile[i], f = w.floor[i], b = w.build[i], col = null, k = 0
              while (t === Sim.T_OPEN && f === Sim.F_NONE && k < 3 && i - N >= 0) { i -= N; k++; t = w.tile[i]; f = w.floor[i]; b = w.build[i] }
              // The corner window had no fog at all, so it showed the caverns,
              // the gem seams and the magma the panel was still hiding — which
              // makes the fog pointless, since the window is always on screen.
              // Tested on `i`, the cell being drawn, not on `i0`: a gap on this
              // level must not expose the unexplored one below it.
              if (fog && !Sim.seenAt(w, i)) {
                ctx.fillStyle = p.fog
                ctx.fillRect(x * c, y * c, c, c)
                if (Sim.hunch(w, i0)) { ctx.fillStyle = p.hunch; ctx.fillRect(x * c + 2, y * c + 2, c - 4, c - 4) }
                if (w.desig[i0]) { ctx.fillStyle = Sim.isUnreachable(w, i0) ? p.desigBad : p.desig; ctx.fillRect(x * c, y * c, c, c) }
                continue
              }
              if (t !== Sim.T_OPEN) col = t === 1 ? g.soil : t === 2 ? g.stone : t === 3 ? g.ore : t === 4 ? g.gem : t === 5 ? g.tree : t === 6 ? g.water : t === 7 ? g.magma : t === 8 ? g.fungus : g.shrub
              else if (f !== Sim.F_NONE) {
                var outdoor = z - k >= w.ground[y * Sim.W + x]
                col = f === 1 ? g.fSoil : f === 2 ? g.fStone : f === 3 ? (snow && outdoor ? g.fSnow : g.fGrass) : g.fMoss
                if (b === Sim.B_WALL) col = p.bWallGlyph
                else if (b === Sim.B_FARM) col = w.grow[i] >= 200 ? p.bFarmRipe : g.fGrass
                else if (b === Sim.B_STOCK) col = p.bStock
                else if (b === Sim.B_STAIR) col = p.bStair
                else if (b === Sim.B_BED) col = p.bBed
                else if (b === Sim.B_TABLE) col = p.bTable
                else if (b === Sim.B_DOOR) col = p.bDoor
                else if (b === Sim.B_STILL) col = p.bStill
                else if (b === Sim.B_WORKSHOP) col = p.bWorkshop
                else if (b === Sim.B_STATUE) col = p.bStatue
                else if (b === Sim.B_KITCHEN) col = p.bKitchen
                else if (b === Sim.B_SMELTER) col = p.bSmelter
                else if (b === Sim.B_FORGE) col = p.bForge
                else if (b === Sim.B_TORCH) col = p.bTorch
                else if (b === Sim.B_TRAINING) col = p.bTraining
                else if (b === Sim.B_JEWELER) col = p.bJeweler
                else if (b === Sim.B_HEARTH) col = p.bHearth
                else if (b === Sim.B_CRYSTAL) col = p.bCrystal
                else if (b === Sim.B_GAMES) col = p.bGames
                else if (b === Sim.B_TRAP) col = p.bTrap
                else if (b === Sim.B_GRAVE) col = p.bStatue
              }
              if (k === 0 && b !== Sim.B_TORCH && b !== Sim.B_HEARTH && t !== Sim.T_MAGMA) { var out2 = z - k >= w.ground[y * Sim.W + x], tl = Math.max(torchLight[i], beaconLight[i]), fl = fireLight[i]; var L = out2 ? Math.max(sun, tl, fl) : Math.max(tl, fl); col = Pal.lit(col, p, L, tl, fl, sun, out2, t !== Sim.T_OPEN || b === Sim.B_WALL) }
              if (!col) continue
              ctx.fillStyle = k ? Pal.dimmed(col, p.bgRgb, dimK[k]) : col
              ctx.fillRect(x * c, y * c, c, c)
              if (k === 0 && (t === 1 || t === 2 || t === 3 || t === 4 || b === Sim.B_WALL)) { ctx.fillStyle = Pal.edges(ctx.fillStyle, p).seam; ctx.fillRect(x * c, y * c, c, 1); ctx.fillRect(x * c, y * c, 1, c) }
              if (w.desig[i0]) { ctx.fillStyle = Sim.isUnreachable(w, i0) ? p.desigBad : p.desig; ctx.fillRect(x * c, y * c, c, c) }
            }
            // items: a dot in the middle of the cell; units: a square. Both dim with depth when seen from above.
            for (var q = 0; q < w.items.length; q++) {
              var it = w.items[q]
              if (it.by) continue
              var dk = Sim.depthBelow(w, it.i, z); if (dk < 0) continue
              if (fog && !Sim.seenAt(w, it.i)) continue
              var icol = it.t === "food" ? p.itemFood : it.t === "booze" ? p.itemBooze : it.t === "log" ? p.itemLog : it.t === "gem" || it.t === "cutgem" || it.t === "jewel" || it.t === "artifact" ? p.itemGem : it.t === "craft" ? p.itemCraft : p.item
              ctx.fillStyle = dk ? Pal.dimmed(icol, p.bgRgb, dimK[dk]) : icol
              ctx.fillRect(Sim.ix(it.i) * c + 2, Sim.iy(it.i) * c + 2, c - 4, c - 4)
            }
            for (var u = 0; u < w.units.length; u++) {
              var un = w.units[u], udk = Sim.depthBelow(w, un.i, z)
              if (udk < 0) continue
              if (fog && un.k !== "dwarf" && !Sim.seenAt(w, un.i)) continue
              var ucol = un.k === "dwarf" ? (un.id === World.selectedId ? p.dwarfSel : p.dwarf) : un.k === "goblin" ? p.goblin : un.k === "wolf" ? p.wolf : un.k === "deer" ? p.deer : un.k === "kobold" ? p.kobold : un.k === "crawler" ? p.crawler : un.k === "sentinel" ? p.sentinel : un.k === "envoy" ? p.envoy : p.merchant
              ctx.fillStyle = udk ? Pal.dimmed(ucol, p.bgRgb, dimK[udk]) : ucol
              ctx.fillRect(Sim.ix(un.i) * c + 1, Sim.iy(un.i) * c + 1, c - 2, c - 2)
            }
          }
        }

        Text {
          anchors { left: parent.left; right: parent.right; bottom: parent.bottom; leftMargin: 5; rightMargin: 5; bottomMargin: 2 }
          font.family: Style.fontFamily
          font.pixelSize: Style.font.caption
          color: Color.popups.text
          elide: Text.ElideRight
          text: {
            World.rev
            var s = World.summary || {}
            var d = s.date || {}
            var last = World.w && World.w.log.length ? World.w.log[World.w.log.length - 1].m : ""
            return "Omahold · " + (World.w ? World.w.name : "") + " · z" + World.viewZ + " · " + (s.pop || 0) + "☺ · " + (d.seasonName || "") + " a" + (d.year || 1) + (World.paused ? " · pausado" : "") + (last ? " · " + last : "")
          }
        }

        MouseArea {
          anchors.fill: parent
          acceptedButtons: Qt.LeftButton | Qt.RightButton
          onClicked: function (m) { if (m.button === Qt.RightButton) World.peek = false; else World.open = true }
          onWheel: function (e) { World.followId = 0; World.viewZ = Math.max(0, Math.min(Sim.D - 1, World.viewZ + (e.angleDelta.y > 0 ? 1 : -1))) }
        }
      }
    }
  }
}
