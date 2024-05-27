package com.sourcegraph.cody.ignore

import com.intellij.ide.BrowserUtil
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

const val CODY_IGNORE_DOCS_URL = "https://sourcegraph.com/docs/cody/capabilities/ignore-context"

class ActionInIgnoredFileNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("filter.action-in-ignored-file.title"),
        CodyBundle.getString("filter.action-in-ignored-file.detail"),
        NotificationType.INFORMATION),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogoSlash

    addAction(
        object :
            NotificationAction(
                CodyBundle.getString("filter.action-in-ignored-file.learn-more-cta")) {
          override fun actionPerformed(event: AnActionEvent, notification: Notification) {
            BrowserUtil.browse(CODY_IGNORE_DOCS_URL)
          }
        })
  }
}
