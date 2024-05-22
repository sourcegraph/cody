package com.sourcegraph.cody.edit.widget

import com.intellij.util.ui.UIUtil
import java.awt.Color
import java.awt.Graphics2D

class LabelHighlight(private val color: Color) {

  /**
   * Draws a highlighted background around the text centered in the widget.
   *
   * @param g the Graphics2D object to draw on.
   * @param y the top of the highlight
   * @param x the x-coordinate of the text's start position.
   * @param textWidth the width of the text.
   * @param textHeight the height of the text.
   */
  fun drawHighlight(g: Graphics2D, x: Float, y: Float, textWidth: Int, textHeight: Int) {
    // Draw shadow
    g.color = UIUtil.shade(color, 0.5, 0.35)
    g.fillRoundRect((x + 0).toInt(), (y + 0.5).toInt(), textWidth, textHeight, RADIUS, RADIUS)

    // Draw highlight
    g.color = color
    g.fillRoundRect(x.toInt(), y.toInt(), textWidth, textHeight, RADIUS, RADIUS)
  }

  companion object {
    const val RADIUS = 4
  }
}
