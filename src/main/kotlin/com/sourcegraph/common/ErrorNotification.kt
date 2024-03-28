package com.sourcegraph.common

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons

object ErrorNotification {
  fun show(project: Project?, errorMessage: String) {
    val notification = create(errorMessage)
    val dismissAction: AnAction =
        object : DumbAwareAction("Dismiss") {
          override fun actionPerformed(anActionEvent: AnActionEvent) {
            notification.expire()
          }
        }
    notification.addAction(dismissAction)
    Notifications.Bus.notify(notification)
    notification.notify(project)
  }

  fun create(errorMessage: String): Notification {
    val notification =
        Notification(
            NotificationGroups.SOURCEGRAPH_ERRORS,
            "Sourcegraph",
            errorMessage,
            NotificationType.WARNING)
    notification.setIcon(Icons.CodyLogo)
    return notification
  }
}
