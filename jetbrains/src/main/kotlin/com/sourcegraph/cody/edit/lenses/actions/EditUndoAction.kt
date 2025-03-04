package com.sourcegraph.cody.edit.lenses.actions

import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.EditTask_UndoParams

class EditUndoAction :
    LensEditAction({ project, _, _, taskId ->
      CodyAgentService.withServer(project) { it.editTask_undo(EditTask_UndoParams(taskId)) }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.undo"
  }
}
