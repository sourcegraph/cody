package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.common.ui.DumbAwareEDTAction

class OpenWebviewDevToolsAction : DumbAwareEDTAction("Open WebView DevTools") {
  override fun actionPerformed(e: AnActionEvent) {
    CodyToolWindowContent.executeOnInstanceIfNotDisposed(e.project ?: return) { openDevTools() }
  }
}
