package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.ui.JBColor
import com.intellij.util.ui.UIUtil
import java.awt.FontMetrics
import java.awt.Graphics2D

open class LensLabel(group: LensWidgetGroup, val text: String) : LensWidget(group) {

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int = fontMetrics.stringWidth(text)

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int = fontMetrics.height

  var hoverText: String? = null

  override fun onMouseEnter(e: EditorMouseEvent) {
    mouseInBounds = true
    showTooltip(hoverText ?: return, e.mouseEvent)
  }

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    g.color =
        if (text == LensGroupFactory.SEPARATOR) {
          UIUtil.shade(JBColor.foreground(), 1.0, 0.4)
        } else {
          baseTextColor
        }
    g.drawString(text, x, y + g.fontMetrics.ascent)
  }

  override fun toString(): String {
    return "LensLabel(text=$text)"
  }
}
