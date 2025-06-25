package com.sourcegraph.common

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol.RateLimitError
import com.sourcegraph.cody.telemetry.TelemetryV2
import com.sourcegraph.common.BrowserOpener.openInBrowser
import com.sourcegraph.common.ui.SimpleDumbAwareEDTAction
import java.util.concurrent.atomic.AtomicReference

class UpgradeToCodyProNotification
private constructor(
    project: Project,
    title: String,
    content: String,
) :
    Notification(NotificationGroups.SOURCEGRAPH_ERRORS, title, content, NotificationType.WARNING),
    NotificationFullContent {
  init {
    icon = Icons.CodyLogo
    val learnMoreAction =
        SimpleDumbAwareEDTAction("Learn more") { anActionEvent ->
          openInBrowser(anActionEvent.project, RATE_LIMITS_URL)
          hideBalloon()
        }
    val dismissAction: AnAction = SimpleDumbAwareEDTAction("Dismiss") { hideBalloon() }

    addAction(learnMoreAction)
    addAction(dismissAction)
  }

  companion object {

    const val RATE_LIMITS_URL =
        "https://sourcegraph.com/docs/cody/core-concepts/cody-gateway#rate-limits-and-quotas"

    fun notify(rateLimitError: RateLimitError, project: Project) {

      val content = CodyBundle.getString("UpgradeToCodyProNotification.content.explain")
      val title = CodyBundle.getString("UpgradeToCodyProNotification.title.explain")

      TelemetryV2.sendTelemetryEvent(project, "abuseUsageLimitCTA", "shown")

      UpgradeToCodyProNotification(project, title, content).notify(project)
    }

    var isFirstRLEOnAutomaticAutocompletionsShown: Boolean = false
    var autocompleteRateLimitError: AtomicReference<RateLimitError?> = AtomicReference(null)
    var chatRateLimitError: AtomicReference<RateLimitError?> = AtomicReference(null)
  }
}
