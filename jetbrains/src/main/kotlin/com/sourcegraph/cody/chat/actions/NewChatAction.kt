package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.ui.DumbAwareEDTAction

class NewChatAction : DumbAwareEDTAction() {
  override fun actionPerformed(event: AnActionEvent) {
    CodyAgentService.withAgent(event.project ?: return) { agent -> agent.server.chat_web_new(null) }
  }

  override fun update(event: AnActionEvent) {
    event.presentation.isEnabled = CodyAccount.hasActiveAccount()
    if (!event.presentation.isEnabled) {
      event.presentation.description =
          CodyBundle.getString("action.sourcegraph.disabled.description")
    }
  }
}
