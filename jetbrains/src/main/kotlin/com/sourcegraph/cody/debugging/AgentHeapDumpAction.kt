package com.sourcegraph.cody.debugging

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.common.ui.DumbAwareEDTAction

class AgentHeapDumpAction : DumbAwareEDTAction("Agent Heap Dump") {
  override fun actionPerformed(e: AnActionEvent) {
    CodyAgentService.withAgent(e.project ?: return) { agent -> agent.server.testing_heapdump(null) }
  }
}
