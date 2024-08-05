package com.sourcegraph.cody.agent

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.action.CodyAgentRestartAction
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class CodyConnectionTimeoutExceptionNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("notifications.cody-connection-timeout.title"),
        CodyBundle.getString("notifications.cody-connection-timeout.detail"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogoSlash
    addAction(CodyAgentRestartAction())
  }
}
