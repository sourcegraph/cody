package com.sourcegraph.cody.edit

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.edit.EditCommandPrompt.Companion.textFieldBackground
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.event.FocusEvent
import java.awt.event.FocusListener
import javax.swing.JTextArea
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

class InstructionsInputTextArea(parentDisposable: Disposable) :
    JTextArea(), FocusListener, Disposable {

  private inner class GhostTextDocumentListener : DocumentListener {
    private var previousTextEmpty = true

    override fun insertUpdate(e: DocumentEvent) {
      handleDocumentChange(e)
    }

    override fun removeUpdate(e: DocumentEvent) {
      handleDocumentChange(e)
    }

    override fun changedUpdate(e: DocumentEvent) {
      // Ignore changedUpdate events
    }

    private fun handleDocumentChange(e: DocumentEvent) {
      val currentTextEmpty = e.document.getText(0, e.document.length).isNullOrBlank()
      if (currentTextEmpty != previousTextEmpty) {
        previousTextEmpty = currentTextEmpty
        repaint()
      }
    }
  }

  private val ghostTextDocumentListener = GhostTextDocumentListener()

  init {
    Disposer.register(parentDisposable, this)

    addFocusListener(this)
    document.addDocumentListener(ghostTextDocumentListener)

    lineWrap = true
    wrapStyleWord = true
    border = JBUI.Borders.empty(JBUI.insets(10, 15, 10, 15))
  }

  override fun paintComponent(g: Graphics) {
    background = textFieldBackground()
    (g as Graphics2D).background = textFieldBackground()
    super.paintComponent(g)

    if (text.isNullOrBlank()) {
      g.apply {
        setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        color = EditUtil.getThemeColor("Component.infoForeground")
        val leftMargin = 15
        drawString(GHOST_TEXT, leftMargin, (fontMetrics.height * 1.5).toInt() - 2)
      }
    }
  }

  // This is used by the up/down arrow keys to insert a history item.
  fun setTextAndSelectAll(newContents: String?) {
    if (newContents != null) {
      text = newContents
      selectAll()
    }
  }

  // Focus tracking ensures the ghost text is hidden or shown on focus change.
  // The superclass has a tendency to hide the text when we lose the focus.
  override fun focusGained(e: FocusEvent?) {
    repaint()
  }

  override fun focusLost(e: FocusEvent?) {
    repaint()
  }

  override fun dispose() {
    removeFocusListener(this)
    document.removeDocumentListener(ghostTextDocumentListener)
  }

  companion object {
    // TODO: Put this back when @-includes are in
    // const val GHOST_TEXT = "Instructions (@ to include code)"
    const val GHOST_TEXT = "Type what changes you want to make to this file..."
  }
}
