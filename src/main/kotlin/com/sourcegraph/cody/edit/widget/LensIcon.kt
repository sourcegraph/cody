package com.sourcegraph.cody.edit.widget

import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.Image
import java.awt.image.BufferedImage
import javax.swing.Icon
import javax.swing.ImageIcon

class LensIcon(group: LensWidgetGroup, val icon: Icon) : LensWidget(group) {

  private var scaledImage: Image? = null

  // Squish the icon down to make it better fit the text. Eyeballed based on logo image.
  private val scaleFactor = 0.6

  private fun getScaleFactor(fontMetrics: FontMetrics) = (fontMetrics.height * scaleFactor).toInt()

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int {
    if (scaledImage == null) {
      scaledImage = scaleImage(icon, getScaleFactor(fontMetrics))
    }
    return scaledImage?.getWidth(null) ?: icon.iconWidth
  }

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int {
    if (scaledImage == null) {
      scaledImage = scaleImage(icon, getScaleFactor(fontMetrics))
    }
    return fontMetrics.height
  }

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    val fontMetrics = g.fontMetrics
    val textCenterLine = y + (fontMetrics.ascent + fontMetrics.descent) / 2.0f

    if (scaledImage != null) {
      val iconHeight = scaledImage!!.getHeight(null)
      val iconY = textCenterLine - (iconHeight / 2.0f)
      g.drawImage(scaledImage, x.toInt(), iconY.toInt(), null)
    } else {
      // If for some reason the image is null, still attempt to center the icon.
      val iconY = textCenterLine - (icon.iconHeight / 2.0f)
      icon.paintIcon(null, g, x.toInt(), iconY.toInt())
    }
  }

  private fun scaleImage(icon: Icon, targetHeight: Int): Image {
    val originalImage =
        if (icon is ImageIcon) {
          icon.image
        } else {
          // Note that hovering over this shows "Please use UIUtil.createImage() instead".
          // And that is also deprecated. If you know the right way, please fix this.
          val bufferedImage =
              BufferedImage(icon.iconWidth, icon.iconHeight, BufferedImage.TYPE_INT_ARGB)
          val g = bufferedImage.createGraphics()
          icon.paintIcon(null, g, 0, 0)
          g.dispose()
          bufferedImage
        }
    val aspectRatio = icon.iconWidth.toDouble() / icon.iconHeight
    val targetWidth = (targetHeight * aspectRatio).toInt()
    return originalImage.getScaledInstance(targetWidth, targetHeight, Image.SCALE_SMOOTH)
  }

  override fun toString(): String {
    return "LensIcon(icon=$icon)"
  }
}
