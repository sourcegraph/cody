package com.sourcegraph.cody.agent.action

import com.intellij.notification.NotificationsManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.CodyConnectionTimeoutExceptionNotification
import com.sourcegraph.common.ui.DumbAwareEDTAction

class CodyAgentRestartAction : DumbAwareEDTAction("Restart Cody") {
  override fun actionPerformed(event: AnActionEvent) {
    event.project?.let { project ->
      CodyAgentService.getInstance(project).restartAgent(project)
      NotificationsManager.getNotificationsManager()
          .getNotificationsOfType(CodyConnectionTimeoutExceptionNotification::class.java, project)
          .forEach { it.expire() }
    }
  }
}
