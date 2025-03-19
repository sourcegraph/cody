package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.text.StringUtil
import com.intellij.util.ui.ExtendableHTMLViewFactory
import com.intellij.util.ui.GraphicsUtil
import com.intellij.util.ui.HTMLEditorKitBuilder
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.AWTEvent
import java.awt.Graphics
import java.awt.event.KeyEvent
import javax.swing.JEditorPane
import javax.swing.text.EditorKit

/**
 * Custom implementation of platform/platform-api/src/com/intellij/ui/components/JBHtmlPane.kt This
 * class is not yet available for 2023.2. We can remove this class once we limit our support to
 * 2024.2+.
 */
class AutoeditHtmlPane : JEditorPane(), Disposable {

  init {
    enableEvents(AWTEvent.KEY_EVENT_MASK)
    caret.isVisible = false
    isEditable = false
    // do not reserve space for caret (making content one pixel narrower than the component)
    putClientProperty("caretWidth", 0)
    UIUtil.doNotScrollToCaret(this)

    val extensions = listOf(ExtendableHTMLViewFactory.Extensions.BASE64_IMAGES)
    val editorKit =
        HTMLEditorKitBuilder().replaceViewFactoryExtensions(*extensions.toTypedArray()).build()
    super.setEditorKit(editorKit)

    border = JBUI.Borders.empty()
  }

  override fun dispose() {}

  override fun getSelectedText(): String? =
      // We need to replace zero-width space char used to represent <wbr>
      // in JBHtmlEditorKit.JBHtmlDocument.JBHtmlReader.addSpecialElement().
      // Swing HTML control does not accept elements with no text.
      super.getSelectedText()?.replace("\u200B", "")

  override fun setText(t: String) {
    if (t.length > 50000)
        thisLogger()
            .warn(
                "HTML pane text is very long (${t.length}): ${StringUtil.shortenTextWithEllipsis(t, 1000, 250, "<TRUNCATED>")}")
    try {
      super.setText(t)
    } catch (e: Throwable) {
      thisLogger().error("Failed to set contents of the HTML pane", e)
    }
  }

  override fun setEditorKit(kit: EditorKit) {
    throw UnsupportedOperationException("Cannot change EditorKit for JBHtmlPane")
  }

  override fun processKeyEvent(e: KeyEvent) {
    // todo: probably redundant - remove
    //    val keyStroke = KeyStroke.getKeyStrokeForEvent(e)
    //        val listener = myPaneConfiguration.keyboardActions[keyStroke]
    //        if (listener != null) {
    //            listener.actionPerformed(ActionEvent(this, 0, ""))
    //            e.consume()
    //            return
    //        }
    super.processKeyEvent(e)
  }

  override fun paintComponent(g: Graphics) {
    GraphicsUtil.setupAntialiasing(g)
    super.paintComponent(g)
  }
}
