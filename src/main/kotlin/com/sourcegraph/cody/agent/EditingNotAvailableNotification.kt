package com.sourcegraph.cody.agent

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class EditingNotAvailableNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("notifications.edits.editing-not-available.title"),
        CodyBundle.getString("notifications.edits.editing-not-available.detail"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.RepoIgnored
  }
}
