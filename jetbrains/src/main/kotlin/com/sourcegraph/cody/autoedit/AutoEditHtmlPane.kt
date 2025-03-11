package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.text.StringUtil
import com.intellij.util.ui.ExtendableHTMLViewFactory
import com.intellij.util.ui.GraphicsUtil
import com.intellij.util.ui.HTMLEditorKitBuilder
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.accessibility.ScreenReader
import java.awt.AWTEvent
import java.awt.Color
import java.awt.Graphics
import java.awt.event.KeyEvent
import java.beans.PropertyChangeEvent
import javax.swing.JEditorPane
import javax.swing.KeyStroke
import javax.swing.text.EditorKit
import kotlinx.coroutines.flow.MutableStateFlow

class AutoEditHtmlPane : JEditorPane(), Disposable {

  private var myText: String = "" // getText() surprisingly crashes…, let's cache the text
  private val mutableBackgroundFlow: MutableStateFlow<Color> = MutableStateFlow(background)

    init {
    enableEvents(AWTEvent.KEY_EVENT_MASK)
    isEditable = false
    if (ScreenReader.isActive()) {
      // Note: Making the caret visible is merely for convenience
      caret.isVisible = true
    } else {
      putClientProperty(
          "caretWidth",
          0) // do not reserve space for caret (making content one pixel narrower than the
      // component)

      UIUtil.doNotScrollToCaret(this)
    }
    val extensions = listOf(ExtendableHTMLViewFactory.Extensions.BASE64_IMAGES)

    val editorKit =
        HTMLEditorKitBuilder().replaceViewFactoryExtensions(*extensions.toTypedArray()).build()

    // The value might have changed already since the flow was created,
    // so we need to update it manually just before we register the listener.
    // For example, the background is changed when we set isEditable above.
    mutableBackgroundFlow.value = background
    addPropertyChangeListener { evt: PropertyChangeEvent ->
      val propertyName = evt.propertyName
      if ("background" == propertyName || "UI" == propertyName) {
        mutableBackgroundFlow.value = background
      }
    }

    super.setEditorKit(editorKit)
    border = JBUI.Borders.empty()
  }

  override fun dispose() {
    caret.isVisible = false // Caret, if blinking, has to be deactivated.
  }

  override fun getSelectedText(): String? =
      // We need to replace zero-width space char used to represent <wbr>
      // in JBHtmlEditorKit.JBHtmlDocument.JBHtmlReader.addSpecialElement().
      // Swing HTML control does not accept elements with no text.
      super.getSelectedText()?.replace("\u200B", "")

  override fun getText(): String {
    return myText
  }

  override fun setText(t: String?) {
    if (t != null && t.length > 50000)
        thisLogger()
            .warn(
                "HTML pane text is very long (${t.length}): ${StringUtil.shortenTextWithEllipsis(t, 1000, 250, "<TRUNCATED>")}")
    myText = t ?: ""
    try {
      super.setText(myText)
    } catch (e: Throwable) {
      thisLogger().error("Failed to set contents of the HTML pane", e)
    }
  }

  override fun setEditorKit(kit: EditorKit) {
    throw UnsupportedOperationException("Cannot change EditorKit for JBHtmlPane")
  }

  override fun processKeyEvent(e: KeyEvent) {
    val keyStroke = KeyStroke.getKeyStrokeForEvent(e)
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
