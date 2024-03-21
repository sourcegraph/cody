package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.ui.JBColor
import com.sourcegraph.cody.edit.FixupSession
import java.awt.Font
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.font.TextAttribute
import java.awt.geom.Rectangle2D

class LensAction(
    group: LensWidgetGroup,
    private val text: String,
    private val command: String,
    private val onClick: () -> Unit
) : LensWidget(group) {

  private val underline = mapOf(TextAttribute.UNDERLINE to TextAttribute.UNDERLINE_ON)

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int = fontMetrics.stringWidth(text)

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int = fontMetrics.height

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    val originalFont = g.font
    val originalColor = g.color
    try {
      if (mouseInBounds) {
        g.font = originalFont.deriveFont(underline)
      } else {
        g.font = originalFont.deriveFont(Font.PLAIN)
      }
      if (mouseInBounds) g.color = JBColor.BLUE // TODO: use theme link rollover color
      g.drawString(text, x, y + g.fontMetrics.ascent)

      // After drawing, update lastPaintedBounds with the area we just used.
      val metrics = g.fontMetrics
      val width = metrics.stringWidth(text)
      val height = metrics.height
      lastPaintedBounds =
          Rectangle2D.Float(x, y - metrics.ascent, width.toFloat(), height.toFloat())
    } finally {
      g.font = originalFont
      g.color = originalColor
    }
  }

  override fun onClick(x: Int, y: Int): Boolean {
    onClick.invoke()
    return true
  }

  override fun onMouseEnter(e: EditorMouseEvent) {
    mouseInBounds = true
    showTooltip(FixupSession.getHotKey(command), e.mouseEvent)
  }

  override fun toString(): String {
    return "LensAction(text=$text)"
  }
}
