package com.sourcegraph.cody.edit.widget

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
    g.color = color
    g.fillRoundRect(x.toInt(), y.toInt(), textWidth, textHeight, RADIUS, RADIUS)
  }

  companion object {
    const val RADIUS = 6
  }
}
