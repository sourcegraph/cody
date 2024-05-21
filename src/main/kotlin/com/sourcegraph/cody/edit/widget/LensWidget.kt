package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.colors.ColorKey
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorColorsScheme
import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.ui.HintHint
import com.intellij.ui.LightweightHint
import java.awt.Color
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.event.MouseEvent
import java.awt.geom.Rectangle2D
import javax.swing.BorderFactory
import javax.swing.JLabel
import javax.swing.UIManager

abstract class LensWidget(val parentGroup: LensWidgetGroup) : Disposable {
  protected val logger = Logger.getInstance(LensWidget::class.java)

  protected var mouseInBounds = false

  // Note: JBColor.white is actually a dark gray in some themes,
  // which doesn't work with our widget backgrounds, which are red/green/gray.
  @Suppress("UseJBColor") protected val baseTextColor: Color = Color.WHITE

  private var showingTooltip = false
  private var tooltip: LightweightHint? = null

  // Bounds of the last paint call, to check for clicks.
  // Currently only set by LensActions, the only clickable widget type.
  protected var lastPaintedBounds: Rectangle2D.Float? = null

  abstract fun calcWidthInPixels(fontMetrics: FontMetrics): Int

  abstract fun calcHeightInPixels(fontMetrics: FontMetrics): Int

  abstract fun paint(g: Graphics2D, x: Float, y: Float)

  /** Optional method for updating the widget state, useful for animations. */
  open fun update() {}

  /** Called only when widget is clicked. Coordinates are relative to the widget. */
  open fun onClick(e: EditorMouseEvent): Boolean {
    return true
  }

  open fun onMouseEnter(e: EditorMouseEvent) {
    mouseInBounds = true
    hideTooltip()
  }

  open fun onMouseExit(e: EditorMouseEvent) {
    mouseInBounds = false
    hideTooltip()
  }

  override fun dispose() {
    hideTooltip()
  }

  private val tooltipBackground = UIManager.getColor("ToolTip.background")
  private val tooltipForeground = UIManager.getColor("ToolTip.foreground")

  protected fun showTooltip(text: String, e: MouseEvent) {
    hideTooltip()

    val globalScheme: EditorColorsScheme = EditorColorsManager.getInstance().globalScheme
    val tooltipLabel =
        JLabel(text).apply {
          foreground =
              globalScheme.getColor(
                  ColorKey.createColorKey("TOOLTIP_FOREGROUND", tooltipForeground))
                  ?: globalScheme.defaultForeground
          background =
              globalScheme.getColor(
                  ColorKey.createColorKey("TOOLTIP_BACKGROUND", tooltipBackground))
                  ?: globalScheme.defaultBackground
          isOpaque = true
          font = parentGroup.widgetFont.get()
          border = BorderFactory.createEmptyBorder(2, 8, 0, 8)
        }
    val hint = LightweightHint(tooltipLabel)
    val p = parentGroup.widgetXY(this)
    val hintHint =
        HintHint(e.component, p)
            .setPreferredPosition(Balloon.Position.above)
            .setMayCenterPosition(false)
    hint.show(
        parentGroup.editor.contentComponent,
        p.x,
        p.y,
        parentGroup.editor.contentComponent,
        hintHint)
    showingTooltip = true
    tooltip = hint
  }

  protected fun hideTooltip() {
    if (showingTooltip) {
      tooltip?.apply {
        hide()
        tooltip = null
      }
      showingTooltip = false
    }
  }
}
