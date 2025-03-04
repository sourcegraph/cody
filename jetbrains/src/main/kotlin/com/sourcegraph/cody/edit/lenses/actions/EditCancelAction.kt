package com.sourcegraph.cody.edit.lenses.actions

import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.EditTask_CancelParams

class EditCancelAction :
    LensEditAction({ project, _, _, taskId ->
      CodyAgentService.withServer(project) { it.editTask_cancel(EditTask_CancelParams(taskId)) }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.cancel"
  }
}
