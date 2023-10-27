package com.sourcegraph.cody.chat

import com.intellij.util.ui.UIUtil
import java.awt.Dimension
import java.awt.Font
import java.awt.Graphics
import javax.swing.JPanel
import javax.swing.Timer

class BlinkingCursorComponent private constructor() : JPanel() {
  private var showCursor = true
  val timer: Timer =
      Timer(500) {
        showCursor = !showCursor
        repaint()
      }

  override fun paintComponent(g: Graphics) {
    super.paintComponent(g)
    if (showCursor) {
      g.font = Font("Monospaced", Font.PLAIN, 12)
      g.drawString("█", 10, 20)
      g.color = UIUtil.getActiveTextColor()
      background = UIUtil.getPanelBackground()
    }
  }

  override fun getPreferredSize(): Dimension {
    return Dimension(30, 30)
  }

  companion object {
    var instance = BlinkingCursorComponent()
  }
}
