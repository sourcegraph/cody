package com.sourcegraph.cody.initialization

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.Icons
import com.sourcegraph.common.BrowserOpener.openInBrowser
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class TrialEndedNotification(val disposable: Disposable) :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("TrialEndedNotification.ended.title"),
        CodyBundle.getString("TrialEndedNotification.ended.content"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogo

    addAction(
        object :
            NotificationAction(CodyBundle.getString("EndOfTrialNotification.link-action-name")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            openInBrowser(
                anActionEvent.project, CodyBundle.getString("TrialEndedNotification.ended.link"))
            notification.expire()
          }
        })
    addAction(
        object :
            NotificationAction(CodyBundle.getString("EndOfTrialNotification.do-not-show-again")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            PropertiesComponent.getInstance().setValue(ignore, true)
            disposable.dispose()
            notification.expire()
          }
        })
  }

  companion object {
    val ignore: String = CodyBundle.getString("TrialEndedNotification.ignore")
  }
}
