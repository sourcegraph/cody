package com.sourcegraph.cody.initialization

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.impl.jdkDownloader.RuntimeChooserCurrentItem
import com.intellij.openapi.projectRoots.impl.jdkDownloader.RuntimeChooserUtil
import com.intellij.openapi.projectRoots.impl.jdkDownloader.currentRuntime
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups

class VerifyJavaBootRuntimeVersion : Activity {

  override fun runActivity(project: Project) {
    if (isCurrentRuntimeMissingJcef()) {
      JcefRuntimeNotification().notify(project)
    }
  }

  companion object {
    fun isCurrentRuntimeMissingJcef(): Boolean {
      val model = RuntimeChooserCurrentItem.currentRuntime()
      val doesNameContainJcefSuffix = model.version?.endsWith("-jcef") ?: true
      return !doesNameContainJcefSuffix
    }
  }
}

class JcefRuntimeNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("JcefRuntimeNotification.title"),
        CodyBundle.getString("JcefRuntimeNotification.content"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogoSlash

    addAction(
        object : NotificationAction(CodyBundle.getString("chooseRuntimeWithJcef.button")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            RuntimeChooserUtil.showRuntimeChooserPopup()
          }
        })
  }
}
