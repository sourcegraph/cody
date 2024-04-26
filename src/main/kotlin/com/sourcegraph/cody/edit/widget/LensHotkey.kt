package com.sourcegraph.cody.edit.widget

import com.sourcegraph.cody.edit.EditCommandPrompt
import java.awt.Color
import java.awt.FontMetrics
import java.awt.Graphics2D

@Suppress("UseJBColor")
class LensHotkey(group: LensWidgetGroup, private val text: String) : LensLabel(group, text) {

  private val hotkeyHighlightColor = Color(49, 51, 56) // TODO: Put this in resources

  private val highlight = LabelHighlight(hotkeyHighlightColor)

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int {
    return fontMetrics.stringWidth(text) + 8
  }

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    // TODO: This will all break with larger font sizes. Use percentages of font width/height.
    val width = g.fontMetrics.stringWidth(text) + 5
    val height = g.fontMetrics.height - 3
    highlight.drawHighlight(g, x + 2, y + 2, width, height)

    g.color = EditCommandPrompt.boldLabelColor()
    g.drawString(text, x + 4, y + g.fontMetrics.ascent)
  }

  override fun toString(): String {
    return "LensHotkey(text=$text)"
  }
}
