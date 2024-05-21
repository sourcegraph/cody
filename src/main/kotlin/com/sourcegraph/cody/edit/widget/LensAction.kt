package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.ui.JBColor
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.edit.EditUtil
import com.sourcegraph.cody.edit.sessions.FixupSession
import java.awt.Color
import java.awt.Font
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.event.MouseEvent
import java.awt.font.TextAttribute
import java.awt.geom.Rectangle2D
import javax.swing.UIManager

@Suppress("UseJBColor")
class LensAction(
    val group: LensWidgetGroup,
    private val text: String,
    private val actionId: String
) : LensWidget(group) {

  private val highlight =
      LabelHighlight(
          when (actionId) {
            FixupSession.ACTION_ACCEPT -> acceptColor
            FixupSession.ACTION_UNDO -> undoColor
            else -> actionColor
          })

  override fun calcWidthInPixels(fontMetrics: FontMetrics): Int {
    return fontMetrics.stringWidth(text) + 2 * SIDE_MARGIN
  }

  override fun calcHeightInPixels(fontMetrics: FontMetrics): Int = fontMetrics.height

  @Suppress("UseJBColor")
  override fun paint(g: Graphics2D, x: Float, y: Float) {
    val originalFont = g.font
    val originalColor = g.color
    try {
      g.background = EditUtil.getEnhancedThemeColor("Panel.background")

      val metrics = g.fontMetrics
      val width = calcWidthInPixels(metrics)
      val textHeight = metrics.height

      highlight.drawHighlight(g, x, y, width, textHeight)

      if (mouseInBounds) {
        g.font = g.font.deriveFont(underline)
        g.color = UIManager.getColor("Link.hoverForeground")
      } else {
        g.font = g.font.deriveFont(Font.PLAIN)
        g.color = Color.WHITE
      }

      g.drawString(text, x + SIDE_MARGIN, y + g.fontMetrics.ascent)

      lastPaintedBounds =
          Rectangle2D.Float(x, y - metrics.ascent, width.toFloat(), textHeight.toFloat())
    } finally {
      g.font = originalFont
      g.color = originalColor
    }
  }

  override fun onClick(e: EditorMouseEvent): Boolean {
    triggerAction(actionId, e.editor, e.mouseEvent)
    return true
  }

  override fun onMouseEnter(e: EditorMouseEvent) {
    mouseInBounds = true
    showTooltip(EditCommandPrompt.getShortcutText(actionId) ?: return, e.mouseEvent)
  }

  private fun triggerAction(actionId: String, editor: Editor, mouseEvent: MouseEvent) {
    val action = ActionManager.getInstance().getAction(actionId)
    if (action != null) {
      val dataContext = createDataContext(editor, mouseEvent)
      val actionEvent =
          AnActionEvent(
              null,
              dataContext,
              "",
              action.templatePresentation.clone(),
              ActionManager.getInstance(),
              0)
      action.actionPerformed(actionEvent)
    }
  }

  private fun createDataContext(editor: Editor, mouseEvent: MouseEvent): DataContext {
    return DataContext { dataId ->
      when (dataId) {
        PlatformDataKeys.CONTEXT_COMPONENT.name -> mouseEvent.component
        PlatformDataKeys.EDITOR.name -> editor
        PlatformDataKeys.PROJECT.name -> editor.project
        else -> null
      }
    }
  }

  override fun toString(): String {
    return "LensAction(text=$text)"
  }

  companion object {
    const val SIDE_MARGIN = 5

    private val underline = mapOf(TextAttribute.UNDERLINE to TextAttribute.UNDERLINE_ON)

    val actionColor = JBColor(Color.DARK_GRAY, Color(44, 45, 50))
    private val acceptColor = Color(37, 92, 53)
    private val undoColor = Color(114, 38, 38)
  }
}
