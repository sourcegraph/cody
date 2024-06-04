package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.ui.DumbAwareEDTAction

abstract class BaseChatAction : DumbAwareEDTAction() {

  abstract fun doAction(project: Project)

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return

    ToolWindowManager.getInstance(project)
        .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
        ?.show()

    doAction(project)
  }

  override fun update(event: AnActionEvent) {
    val project = event.project ?: return
    val hasActiveAccount = CodyAuthenticationManager.getInstance(project).hasActiveAccount()
    event.presentation.isEnabled = hasActiveAccount
    if (!event.presentation.isEnabled) {
      event.presentation.description =
          CodyBundle.getString("action.sourcegraph.disabled.description")
    }
  }

  private fun showToolbar(project: Project) =
      ToolWindowManager.getInstance(project)
          .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
          ?.show()
}
