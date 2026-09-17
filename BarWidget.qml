import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "sim.js" as Sim

// The bar side: a dwarf and a head count. A dot appears when something
// happened since you last looked (a caravan, a death, an artifact) - no
// numbers, no notifications. Click opens the hold; right click toggles the
// corner window; wheel changes the z-level shown there.
Panel {
  id: root

  moduleName: "zed.omahold"
  ipcTarget: "zed.omahold.widget"

  readonly property color foreground: bar ? bar.barForeground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property bool alerting: World.alerts > 0
  readonly property bool danger: !!(World.summary && World.summary.raid)

  // Inline options from the widget entry in shell.json. They are handed over
  // rather than applied: World decides, once options.json has been read, which
  // of them the player has not already overridden in the menu.
  Component.onCompleted: {
    var o = ({})
    var bg = setting("backgroundMs", null); if (bg !== null) o.backgroundMs = Number(bg)
    var cap = setting("popCap", null); if (cap !== null) o.popCap = Number(cap)
    var pk = setting("peek", null); if (pk !== null) o.peek = !!pk
    World.setWidgetSettings(o)
  }

  TextMetrics { id: metrics; font.family: root.fontFamily; font.pixelSize: Style.font.bodySmall; text: World.ready ? String(World.pop) : "…" }
  readonly property int textW: Math.ceil(metrics.advanceWidth) + Style.space(8)
  readonly property int barSlot: Style.bar.iconFont + textW + Style.space(12)
  implicitWidth: bar && bar.vertical ? (bar ? bar.barSize : Style.bar.sizeHorizontal) : barSlot
  implicitHeight: bar && bar.vertical ? barSlot : (bar ? bar.barSize : Style.bar.sizeHorizontal)

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    slotSize: root.barSlot
    opticalSize: Style.bar.iconFont
    tooltipText: {
      World.rev
      var s = World.summary || {}, d = s.date || {}
      if (!World.w) return "Omahold: carregando o mundo"
      var moodWord = s.mood >= 60 ? "contentes" : s.mood >= 40 ? "ok" : "infelizes"
      return World.w.name + "\n" + (d.seasonName || "") + ", dia " + (d.day || 1) + " do ano " + (d.year || 1)
        + "\n" + s.pop + " anões, " + moodWord + " · comida " + s.food + " · bebida " + s.booze + " · riqueza " + s.wealth
        + (s.raid ? "\n!! emboscada em curso" : "") + (s.caravan ? "\ncaravana no depósito" : "")
        + (s.fallen ? "\na fortaleza caiu" : "") + (World.paused ? "\npausado" : "")
    }

    iconComponent: Component {
      Item {
        Row {
          anchors.centerIn: parent
          spacing: Style.space(4)
          Text {
            text: "☺"
            font.family: root.fontFamily
            font.pixelSize: Style.bar.iconFont
            renderType: Text.NativeRendering
            color: root.danger ? Color.urgent : root.foreground
          }
          Text {
            text: World.ready ? String(World.pop) : "…"
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            renderType: Text.NativeRendering
            color: root.foreground
            anchors.verticalCenter: parent.verticalCenter
          }
        }
        Rectangle {
          visible: root.alerting
          width: 6; height: 6; radius: 3
          color: root.danger ? Color.urgent : Color.accent
          anchors { right: parent.right; top: parent.top; rightMargin: -1; topMargin: -1 }
          SequentialAnimation on opacity {
            running: root.alerting
            loops: Animation.Infinite
            NumberAnimation { from: 1; to: 0.35; duration: 1400; easing.type: Easing.InOutQuad }
            NumberAnimation { from: 0.35; to: 1; duration: 1400; easing.type: Easing.InOutQuad }
          }
        }
      }
    }

    onPressed: function (b) {
      if (b === Qt.RightButton) World.peek = !World.peek
      else World.open = !World.open
    }
  }
}
