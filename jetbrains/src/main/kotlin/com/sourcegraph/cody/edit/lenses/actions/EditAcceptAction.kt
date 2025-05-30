package com.sourcegraph.cody.edit.lenses.actions

import com.sourcegraph.cody.agent.CodyAgentService

class EditAcceptAction :
    LensEditAction({ project, _, _, taskId ->
      CodyAgentService.withAgent(project) { it.server.editTask_accept(taskId) }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.accept"
  }
}
