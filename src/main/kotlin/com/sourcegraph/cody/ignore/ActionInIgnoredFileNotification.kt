package com.sourcegraph.cody.context.ui

import com.intellij.ide.BrowserUtil
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.Icons
import com.sourcegraph.cody.ignore.CODY_IGNORE_DOCS_URL
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class ActionInIgnoredFileNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        "",
        CodyBundle.getString("ignore.action-in-ignored-file.detail"),
        NotificationType.INFORMATION),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogoSlash

    addAction(
        object :
            NotificationAction(
                CodyBundle.getString("ignore.action-in-ignored-file.learn-more-cta")) {
          override fun actionPerformed(event: AnActionEvent, notification: Notification) {
            BrowserUtil.browse(CODY_IGNORE_DOCS_URL)
          }
        })
  }
}
