package com.sourcegraph.cody.edit.widget

import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

class LensIcon(group: LensWidgetGroup, val icon: Icon) : LensWidget(group) {

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int {
    val desiredHeight = (fontMetrics.height + fontMetrics.ascent) / 2.0f
    val scaleFactor = desiredHeight / icon.iconHeight.toFloat()
    return (icon.iconWidth * scaleFactor).toInt()
  }

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int {
    return ((fontMetrics.height + fontMetrics.ascent) / 2.0f).toInt()
  }

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    val fontMetrics = g.fontMetrics
    val textCenterLine = y + (fontMetrics.ascent + fontMetrics.descent) / 2.0f
    val desiredHeight = (fontMetrics.height + fontMetrics.ascent) / 2.0f
    val scaleFactor = desiredHeight / icon.iconHeight.toFloat()
    val iconY = textCenterLine - desiredHeight / 2.0f

    // Set rendering hints for high quality resize
    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
    g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)

    val originalTransform = g.transform
    g.translate(x.toInt(), iconY.toInt())
    g.scale(scaleFactor.toDouble(), scaleFactor.toDouble())

    // Paint the icon a bit down, presumably to account for the font baseline.
    // This 1-"pixel" adjustment works surprisingly well for font sizes ranging
    // from 7 to 24+, and I'm not sure why, but I tested across a wide range of sizes.
    // If you take it out, the logo will be slightly too high and will drive you crazy.
    icon.paintIcon(null, g, 0, 1)

    g.transform = originalTransform
  }

  override fun toString(): String {
    return "LensIcon(icon=$icon)"
  }
}
