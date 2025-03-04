package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.ui.DumbAwareEDTAction

class NewChatAction : DumbAwareEDTAction() {
  override fun actionPerformed(event: AnActionEvent) {
    CodyAgentService.withServer(event.project ?: return) { server -> server.chat_web_new(null) }
  }

  override fun update(event: AnActionEvent) {
    val project = event.project
    event.presentation.isEnabled =
        project != null && CodyAuthService.getInstance(project).isActivated()
    if (!event.presentation.isEnabled) {
      event.presentation.description =
          CodyBundle.getString("action.sourcegraph.disabled.description")
    }
  }
}
