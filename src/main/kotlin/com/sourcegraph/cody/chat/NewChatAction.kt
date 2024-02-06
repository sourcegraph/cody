package com.sourcegraph.cody.chat

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.config.CodyAuthenticationManager

class NewChatAction : DumbAwareAction() {

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
      switchToChatSession(AgentChatSession.createNew(project))
    }
    showToolbar(project)
  }

  override fun update(event: AnActionEvent) {
    val project = event.project ?: return
    val hasActiveAccount = !CodyAuthenticationManager.instance.hasNoActiveAccount(project)
    event.presentation.isEnabledAndVisible = hasActiveAccount
  }

  private fun showToolbar(project: Project) =
      ToolWindowManager.getInstance(project)
          .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
          ?.show()
}
