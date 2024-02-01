package com.sourcegraph.cody.chat

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.CodyToolWindowFactory

class NewChatAction : DumbAwareAction() {

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
      switchToChatSession(AgentChatSession.createNew(project))
    }
    showToolbar(project)
  }

  private fun showToolbar(project: Project) =
      ToolWindowManager.getInstance(project)
          .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
          ?.show()
}
