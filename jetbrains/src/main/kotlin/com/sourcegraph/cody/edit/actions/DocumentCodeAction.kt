package com.sourcegraph.cody.edit.actions

import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Commands_CustomParams

class DocumentCodeAction :
    BaseEditCodeAction({ editor ->
      editor.project?.let { project ->
        CodyAgentService.withAgent(project) { agent ->
          agent.server.commands_custom(Commands_CustomParams("cody.command.document-code")).get()
        }
      }
    }) {
  companion object {
    const val ID: String = "cody.documentCodeAction"
  }
}
