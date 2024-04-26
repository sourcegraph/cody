package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.editor.event.EditorMouseEvent
import com.sourcegraph.cody.edit.EditCommandPrompt
import java.awt.Color
import java.awt.FontMetrics
import java.awt.Graphics2D

@Suppress("UseJBColor")
open class LensLabel(group: LensWidgetGroup, private val text: String) : LensWidget(group) {

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int = fontMetrics.stringWidth(text)

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int = fontMetrics.height

  var hoverText: String? = null

  override fun onMouseEnter(e: EditorMouseEvent) {
    mouseInBounds = true
    showTooltip(hoverText ?: return, e.mouseEvent)
  }

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    g.color =
        when {
          text.trim() == "!" -> Color.red // TODO: Remove when we get the SVG
          text == LensGroupFactory.SEPARATOR -> EditCommandPrompt.boldLabelColor()
          else -> baseTextColor
        }
    g.drawString(text, x, y + g.fontMetrics.ascent)
  }

  override fun toString(): String {
    return "LensLabel(text=$text)"
  }

  companion object {
    const val HOTKEY_HIGHLIGHT_MARGIN = 2
    const val HOTKEY_TEXT_MARGIN = 5
  }
}
