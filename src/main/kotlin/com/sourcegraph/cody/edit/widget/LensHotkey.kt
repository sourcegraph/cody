package com.sourcegraph.cody.edit.widget

import java.awt.Color
import java.awt.FontMetrics
import java.awt.Graphics2D

class LensHotkey(group: LensWidgetGroup, private val text: String) : LensLabel(group, text) {

  private val hotkeyHighlightColor = LensAction.actionColor

  private val highlight = LabelHighlight(hotkeyHighlightColor)

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int {
    return fontMetrics.stringWidth(text) + 8
  }

  @Suppress("UseJBColor")
  override fun paint(g: Graphics2D, x: Float, y: Float) {
    // TODO: This will all break with larger font sizes. Use percentages of font width/height.
    val width = g.fontMetrics.stringWidth(text) + 5
    val height = g.fontMetrics.height - 3
    highlight.drawHighlight(g, x + 2, y + 2, width, height)

    g.color = Color.white // JBColor.WHITE looks like crap in Darcula theme (very dark)
    g.drawString(text, x + 4, y + g.fontMetrics.ascent)
  }

  override fun toString(): String {
    return "LensHotkey(text=$text)"
  }
}
