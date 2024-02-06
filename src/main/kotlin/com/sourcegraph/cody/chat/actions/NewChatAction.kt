package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.chat.AgentChatSession

class NewChatAction : BaseChatAction() {

  override fun doAction(project: Project) {
    CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) {
      switchToChatSession(AgentChatSession.createNew(project))
    }
  }
}
