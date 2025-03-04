package com.sourcegraph.cody.edit.actions

import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Commands_CustomParams
import com.sourcegraph.cody.agent.protocol_generated.CustomEditCommandResult

class TestCodeAction :
    BaseEditCodeAction({ editor ->
      editor.project?.let { project ->
        CodyAgentService.withServer(project) { server ->
          val customCommandResult = server.commands_custom(Commands_CustomParams("test")).get()
          val result = customCommandResult as? CustomEditCommandResult ?: return@withServer
          EditCodeAction.completedEditTasks[result.editResult.id] = result.editResult
        }
      }
    }) {
  companion object {
    const val ID: String = "cody.testCodeAction"
  }
}
