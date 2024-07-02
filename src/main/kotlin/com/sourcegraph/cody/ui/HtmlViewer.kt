package com.sourcegraph.cody.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.BrowserHyperlinkListener
import com.intellij.util.ui.HTMLEditorKitBuilder
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.SwingHelper
import com.sourcegraph.cody.chat.ChatUIConstants
import com.sourcegraph.cody.telemetry.TelemetryV2
import com.sourcegraph.common.CodyBundle
import java.awt.Insets
import java.net.URL
import javax.swing.JEditorPane
import javax.swing.event.HyperlinkEvent

object HtmlViewer {
  @JvmStatic
  fun createHtmlViewer(project: Project): JEditorPane {
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
    jEditorPane.addHyperlinkListener(MyBrowserHyperlinkListener(project))
    return jEditorPane
  }

  class MyBrowserHyperlinkListener(val project: Project) : BrowserHyperlinkListener() {
    override fun hyperlinkActivated(e: HyperlinkEvent) {
      if (e.url.sameFile(URL(CodyBundle.getString("url.sourcegraph.subscription")))) {
        TelemetryV2.sendTelemetryEvent(project, "upsellUsageLimitCTA", "clicked")
      }
      super.hyperlinkActivated(e)
    }
  }
}
