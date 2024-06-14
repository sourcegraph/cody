package com.sourcegraph.cody.ui

import com.intellij.ui.BrowserHyperlinkListener
import com.intellij.util.ui.HTMLEditorKitBuilder
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.SwingHelper
import com.sourcegraph.cody.chat.ChatUIConstants
import java.awt.Insets
import javax.swing.JEditorPane

object HtmlViewer {
  @JvmStatic
  fun createHtmlViewer(): JEditorPane {
    val jEditorPane = SwingHelper.createHtmlViewer(true, null, null, null)
    jEditorPane.editorKit = HTMLEditorKitBuilder().withWordWrapViewFactory().build()
    jEditorPane.isFocusable = true
    jEditorPane.margin =
        JBInsets.create(
            Insets(
                ChatUIConstants.TEXT_MARGIN,
                ChatUIConstants.TEXT_MARGIN,
                ChatUIConstants.TEXT_MARGIN,
                ChatUIConstants.TEXT_MARGIN))
    jEditorPane.addHyperlinkListener(BrowserHyperlinkListener.INSTANCE)
    return jEditorPane
  }
}
