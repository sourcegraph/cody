package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.common.ui.DumbAwareEDTAction

class OpenWebviewDevToolsAction(val toolWindowContent: CodyToolWindowContent) :
    DumbAwareEDTAction("Open WebView DevTools") {
  override fun actionPerformed(e: AnActionEvent) {
    toolWindowContent.openDevTools()
  }
}
