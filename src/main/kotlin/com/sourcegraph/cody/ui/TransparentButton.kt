package com.sourcegraph.cody.ui

import com.intellij.ide.ui.UISettings
import com.intellij.ui.ColorUtil
import com.intellij.util.ui.UIUtil
import java.awt.AlphaComposite
import java.awt.BasicStroke
import java.awt.Dimension
import java.awt.FontMetrics
import java.awt.Graphics
import java.awt.Graphics2D
import javax.swing.JButton

open class TransparentButton(text: String) : JButton(text) {
  private val cornerRadius = 5
  private val fontMetric: FontMetrics

  init {
    isContentAreaFilled = false
    isFocusPainted = false
    isBorderPainted = false
    isVisible = false

    this.fontMetric = getFontMetrics(font)
    updatePreferredSize()
  }

  /** Calculate the preferred size based on the size of the text. */
  fun updatePreferredSize() {
    val horizontalPadding = 10
    val verticalPadding = 5
    val width = fontMetric.stringWidth(text) + horizontalPadding * 2
    val height = fontMetric.height + verticalPadding * 2
    preferredSize = Dimension(width, height)
  }

  override fun paintComponent(g: Graphics) {
    UISettings.setupAntialiasing(g)
    val g2 = g.create() as Graphics2D

    if (isEnabled) {
      g2.composite = AlphaComposite.SrcOver.derive(0.7f)
      g.color = UIUtil.getLabelForeground()
    } else {
      g2.composite = AlphaComposite.SrcOver.derive(0.4f)
      g.color = ColorUtil.darker(UIUtil.getLabelForeground(), 3)
    }

    g2.color = background
    g2.fillRoundRect(0, 0, width, height, cornerRadius, cornerRadius)
    g2.color = foreground
    g2.stroke = BasicStroke(1f)
    g2.drawRoundRect(0, 0, width - 1, height - 1, cornerRadius, cornerRadius)
    g2.dispose()

    val fm = g.fontMetrics
    val rect = fm.getStringBounds(text, g)
    val textHeight = rect.height.toInt()
    val textWidth = rect.width.toInt()

    // Center text horizontally and vertically
    val x = (width - textWidth) / 2
    val y = (height - textHeight) / 2 + fm.ascent
    g.drawString(text, x, y)
  }
}
