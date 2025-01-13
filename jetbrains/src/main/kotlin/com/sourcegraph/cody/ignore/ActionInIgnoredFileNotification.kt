package com.sourcegraph.cody.ignore

import com.intellij.ide.BrowserUtil
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.statusbar.CodyStatus
import com.sourcegraph.cody.statusbar.CodyStatusService
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

  companion object {
    val log = logger<ActionInIgnoredFileNotification>()

    fun maybeNotify(project: Project) {
      val status = CodyStatusService.getCurrentStatus(project)
      val endpoint = CodyAuthService.getInstance(project).getEndpoint()
      when {
        status == CodyStatus.CodyUninit ||
            status == CodyStatus.CodyDisabled ||
            status == CodyStatus.CodyNotSignedIn ||
            status == CodyStatus.CodyInvalidToken ||
            status == CodyStatus.CodyAgentNotRunning ||
            status == CodyStatus.AgentError ||
            status == CodyStatus.RateLimitError -> {
          // Do nothing. These errors are not related to context filters; displaying them
          // is handled by the status bar widget.
        }
        endpoint.isDotcom() == true -> {
          // Show nothing. We do not use context filters on sourcegraph.com; should be
          // unreachable.
          log.warn(
              "got 'action in ignored file' notification with a dotcom account, which should be unreachable")
        }
        else -> runInEdt { ActionInIgnoredFileNotification().notify(project) }
      }
    }
  }

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
