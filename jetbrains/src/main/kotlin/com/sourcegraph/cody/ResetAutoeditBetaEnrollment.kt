package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.common.ui.DumbAwareEDTAction

class ResetAutoeditBetaEnrollment : DumbAwareEDTAction() {
  override fun actionPerformed(e: AnActionEvent) {
    CodyAgentService.withAgent(e.project!!) { agent ->
      agent.server.testing_resetAutoeditBetaEnrollment(null)
    }
  }
}
