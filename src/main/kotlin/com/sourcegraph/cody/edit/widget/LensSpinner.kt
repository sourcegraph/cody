package com.sourcegraph.cody.edit.widget

import java.awt.FontMetrics
import java.awt.Graphics2D
import javax.swing.Icon

class LensSpinner(group: LensWidgetGroup, private val icon: Icon) : LensWidget(group) {
  override fun paint(g: Graphics2D, x: Float, y: Float) {
    icon.paintIcon(parentGroup.editor.contentComponent, g, x.toInt(), y.toInt())
  }

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int = icon.iconWidth

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int = icon.iconHeight
}
