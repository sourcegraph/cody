package com.sourcegraph.cody.edit.lenses.actions

import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.EditTask_AcceptParams

class EditAcceptAction :
    LensEditAction({ project, _, _, taskId ->
      CodyAgentService.withAgent(project) {
        it.server.editTask_accept(EditTask_AcceptParams(taskId))
      }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.accept"
  }
}
