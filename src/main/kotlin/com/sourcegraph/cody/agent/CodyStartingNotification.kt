package com.sourcegraph.cody.agent

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupListener
import com.intellij.openapi.ui.popup.LightweightWindowEvent
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class CodyStartingNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("notification.general.cody-not-running.title"),
        CodyBundle.getString("notification.general.cody-not-running.detail"),
        NotificationType.INFORMATION),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogo
  }

  override fun notify(project: Project?) {
    // only show if not already being shown
    if (instance == null) {
      instance = this
      super.notify(project)
      balloon?.addListener(
          object : JBPopupListener {
            override fun onClosed(event: LightweightWindowEvent) {
              instance = null
            }
          })
    }
  }

  companion object {
    var instance: CodyStartingNotification? = null
  }
}
