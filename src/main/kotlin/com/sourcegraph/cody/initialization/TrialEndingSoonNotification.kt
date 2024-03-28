package com.sourcegraph.cody.initialization

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.Icons
import com.sourcegraph.common.BrowserOpener.openInBrowser
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class TrialEndingSoonNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("TrialEndingSoonNotification.ending-soon.title"),
        CodyBundle.getString("TrialEndingSoonNotification.ending-soon.content"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogo

    addAction(
        object :
            NotificationAction(CodyBundle.getString("EndOfTrialNotification.link-action-name")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            openInBrowser(
                anActionEvent.project,
                CodyBundle.getString("TrialEndingSoonNotification.ending-soon.link"))
            notification.expire()
          }
        })
    addAction(
        object :
            NotificationAction(CodyBundle.getString("EndOfTrialNotification.do-not-show-again")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            PropertiesComponent.getInstance().setValue(ignore, true)
            notification.expire()
          }
        })
  }

  companion object {
    val ignore: String = CodyBundle.getString("TrialEndingSoonNotification.ignore")
  }
}
