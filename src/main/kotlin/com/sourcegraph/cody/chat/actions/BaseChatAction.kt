package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.common.ui.DumbAwareBGTAction

abstract class BaseChatAction : DumbAwareBGTAction() {

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
    val hasActiveAccount = !CodyAuthenticationManager.instance.hasNoActiveAccount(project)
    event.presentation.isEnabledAndVisible = hasActiveAccount
  }

  private fun showToolbar(project: Project) =
      ToolWindowManager.getInstance(project)
          .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
          ?.show()
}
