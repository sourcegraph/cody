package com.sourcegraph.cody.chat.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ExecuteCommandParams
import com.sourcegraph.common.ui.DumbAwareEDTAction

class ExportChatsAction : DumbAwareEDTAction() {

  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    CodyAgentService.withAgent(project) { agent ->
      agent.server.command_execute(ExecuteCommandParams("cody.chat.history.export", emptyList()))
    }
  }
}
