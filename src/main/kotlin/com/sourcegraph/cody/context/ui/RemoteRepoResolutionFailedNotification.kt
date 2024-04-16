package com.sourcegraph.cody.context.ui

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class RemoteRepoResolutionFailedNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("context-panel.remote-repo.error-resolution-failed.title"),
        CodyBundle.getString("context-panel.remote-repo.error-resolution-failed.detail"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.RepoHostGeneric

    addAction(
        object :
            NotificationAction(
                CodyBundle.getString(
                    "context-panel.remote-repo.error-resolution-failed.do-not-show-again")) {
          override fun actionPerformed(event: AnActionEvent, notification: Notification) {
            PropertiesComponent.getInstance().setValue(ignore, true)
            notification.expire()
          }
        })
  }

  companion object {
    val ignore = CodyBundle.getString("context-panel.remote-repo.error-resolution-failed.ignore")
  }
}
