package com.sourcegraph.common

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.common.ui.SimpleDumbAwareEDTAction
import java.awt.datatransfer.StringSelection
import java.net.URI

object BrowserErrorNotification {
  fun show(project: Project?, uri: URI) {
    val notification =
        Notification(
            NotificationGroups.SOURCEGRAPH_ERRORS,
            "Sourcegraph",
            "Opening an external browser is not supported. You can still copy the URL to your clipboard and open it manually.",
            NotificationType.WARNING)
    val copyUrlAction: AnAction =
        SimpleDumbAwareEDTAction("Copy URL") {
          CopyPasteManager.getInstance().setContents(StringSelection(uri.toString()))
          notification.expire()
        }
    val dismissAction: AnAction = SimpleDumbAwareEDTAction("Dismiss") { notification.expire() }
    notification.setIcon(Icons.CodyLogo)
    notification.addAction(copyUrlAction)
    notification.addAction(dismissAction)
    Notifications.Bus.notify(notification)
    notification.notify(project)
  }
}
