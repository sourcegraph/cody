package com.sourcegraph.cody.chat

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.sourcegraph.cody.CodyToolWindowContent

class NewChatAction : DumbAwareAction() {

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
      addChatSession(AgentChatSession.createNew(project))
    }
  }
}
