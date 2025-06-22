package com.sourcegraph.cody.edit.lenses.actions

import com.sourcegraph.cody.agent.CodyAgentService

class EditRetryAction :
    LensEditAction({ project, _, _, taskId ->
      CodyAgentService.withAgent(project) { it.server.editTask_retry(taskId) }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.retry"
  }
}
