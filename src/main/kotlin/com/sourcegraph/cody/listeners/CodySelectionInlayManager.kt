package com.sourcegraph.cody.listeners

import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.colors.EditorColors
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Ignore_TestResult
import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Rectangle
import java.awt.event.KeyEvent
import java.awt.geom.GeneralPath
import java.util.Locale

class CodySelectionInlayManager(val project: Project) {
  private var currentInlay: Inlay<*>? = null

  private val disposable = Disposer.newDisposable()

  fun handleSelectionChanged(editor: Editor, event: SelectionEvent) {
    clearInlay()

    if (!ConfigUtil.isCodyEnabled() ||
        !CodyAgentService.isConnected(project) ||
        !ConfigUtil.isCodyUIHintsEnabled() ||
        !CodyEditorUtil.isEditorValidForAutocomplete(editor) ||
        !CodyAccount.hasActiveAccount() ||
        IgnoreOracle.getInstance(project).policyForEditor(editor) !=
            Ignore_TestResult.PolicyEnum.Use) {
      return
    }

    val startOffset = event.newRange.startOffset
    val endOffset = event.newRange.endOffset
    if (startOffset == endOffset) {
      return // Don't show if there's no selection.
    }
    val document = editor.document
    val startLine = document.getLineNumber(startOffset)
    val endLine = document.getLineNumber(endOffset)
    val selectionEndLine = if (startOffset > endOffset) startLine else endLine
    // Don't show if selection is only on one line, as it can be distracting.
    if (startLine == selectionEndLine) {
      return
    }
    val editShortcutText = getKeyStrokeText("cody.editCodeAction")
    val inlayContent = "$editShortcutText  to Edit"

    val bottomLine = // Try to put it beneath the selection. At the end was unpopular.
        if (selectionEndLine + 1 < document.lineCount) selectionEndLine + 1 else selectionEndLine
    updateInlay(editor, inlayContent, bottomLine)
  }

  private fun updateInlay(editor: Editor, content: String, line: Int) {
    editor.inlayModel
        .addInlineElement(
            editor.document.getLineEndOffset(line),
            object : EditorCustomElementRenderer {

              private fun getFont() = editor.colorsScheme.getFont(EditorFontType.PLAIN)

              private fun getSmallerFont(): Font {
                val font = getFont()
                return Font(font.name, font.style.or(Font.BOLD), font.size - 2)
              }

              private fun getSmallerFontMetrics() =
                  editor.contentComponent.getFontMetrics(getSmallerFont())

              override fun calcWidthInPixels(inlay: Inlay<*>): Int {
                return getSmallerFontMetrics().stringWidth(content + RIGHT_SPACER)
              }

              override fun paint(
                  inlay: Inlay<*>,
                  g: Graphics,
                  targetRegion: Rectangle,
                  textAttributes: TextAttributes
              ) {
                g.font = getSmallerFont()

                val backgroundColor =
                    editor.colorsScheme.getColor(EditorColors.SELECTION_BACKGROUND_COLOR)?.darker()
                g.color = backgroundColor

                val arcSize =
                    getFont().size // Larger number = arc is more round, smaller = more square
                val x = targetRegion.x.toDouble()
                val y = targetRegion.y.toDouble()
                val width = targetRegion.width.toDouble()
                val height = targetRegion.height.toDouble()

                // Draw an "upside-down tab" shape for the background.
                val path = GeneralPath()
                path.moveTo(x, y) // Start at top-left
                path.lineTo(x + width, y) // Top edge
                path.lineTo(x + width, y + height - arcSize) // Right edge
                path.quadTo(x + width, y + height, x + width - arcSize, y + height)
                path.lineTo(x + arcSize, y + height) // Bottom edge
                path.lineTo(x, y + height)
                path.lineTo(x, y) // Left edge
                path.closePath()
                (g as Graphics2D).fill(path)

                val descent = g.fontMetrics.descent
                val leftMargin = g.fontMetrics.stringWidth("C") / 2.0
                val textColor = editor.colorsScheme.getColor(EditorColors.CARET_COLOR)
                g.color = textColor

                val baseline = y + height - descent - 2
                g.drawString(content, (x + leftMargin).toFloat(), baseline.toFloat())
              }
            })
        ?.let {
          Disposer.register(disposable, it)
          currentInlay = it
        }
  }

  private fun clearInlay() {
    currentInlay?.let { Disposer.dispose(it) }
    currentInlay = null
  }

  @Suppress("SameParameterValue")
  private fun getKeyStrokeText(actionId: String): String {
    val shortcuts = KeymapManager.getInstance().activeKeymap.getShortcuts(actionId)
    if (shortcuts.isNotEmpty()) {
      val firstShortcut = shortcuts[0]
      if (firstShortcut is KeyboardShortcut) {
        val keyStroke = firstShortcut.firstKeyStroke
        val modifiers = keyStroke.modifiers
        val key = KeyEvent.getKeyText(keyStroke.keyCode)
        val isMac = System.getProperty("os.name").lowercase(Locale.getDefault()).contains("mac")
        val separator = " + "

        val altName = if (isMac) "Option$separator" else "Alt$separator"
        val modText = buildString {
          append(" ") // Add some separation from the end of the source code.
          if (modifiers and KeyEvent.CTRL_DOWN_MASK != 0) append("Ctrl$separator")
          if (modifiers and KeyEvent.SHIFT_DOWN_MASK != 0) append("Shift$separator")
          if (modifiers and KeyEvent.ALT_DOWN_MASK != 0) append(altName)
          if (isMac && modifiers and KeyEvent.META_DOWN_MASK != 0) append("Cmd$separator")
        }
        return (modText + key).removeSuffix(separator)
      }
    }
    return ""
  }

  fun dispose() {
    Disposer.dispose(disposable)
  }

  companion object {
    // For some reason the font metrics string width calculation is coming in short.
    // We don't actually draw this string; it's just used to calculate the widget width.
    private val RIGHT_SPACER = "C".repeat(2)
  }
}
