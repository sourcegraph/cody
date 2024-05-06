package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.application.runInEdt
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.geom.AffineTransform
import javax.swing.Icon
import javax.swing.Timer

class LensSpinner(group: LensWidgetGroup, private val icon: Icon) : LensWidget(group) {
  private var rotationDegrees = 0f
  private val animationDelay = 50 // Milliseconds between frames

  private val timer =
      Timer(animationDelay) {
        if (parentGroup.editor.isDisposed) {
          stop()
        } else {
          rotationDegrees = (rotationDegrees + 10) % 360
          parentGroup.update()
        }
      }

  init {
    runInEdt { start() }
  }

  fun start() {
    timer.start()
  }

  fun stop() {
    timer.stop()
  }

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int = icon.iconWidth

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int = icon.iconHeight

  override fun paint(g: Graphics2D, x: Float, y: Float) {
    val originalTransform = g.transform
    val iconCenterX = x + icon.iconWidth / 2
    val iconCenterY = y + icon.iconHeight / 2
    val transform =
        AffineTransform.getRotateInstance(
            Math.toRadians(rotationDegrees.toDouble()),
            iconCenterX.toDouble(),
            iconCenterY.toDouble())
    g.transform(transform)
    icon.paintIcon(null, g, x.toInt(), y.toInt())
    g.transform = originalTransform
  }

  override fun dispose() {
    stop()
  }

  override fun toString(): String {
    return "LensSpinner($rotationDegrees°,$animationDelay ms)"
  }
}
