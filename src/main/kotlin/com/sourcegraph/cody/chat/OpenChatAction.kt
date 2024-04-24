package com.sourcegraph.cody.chat

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.common.ui.DumbAwareBGTAction

class OpenChatAction : DumbAwareBGTAction() {

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    ToolWindowManager.getInstance(project)
        .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
        ?.show()
    CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { focusOnChat() }
  }
}
