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
    shouldShowUpgradeOption: Boolean
) :
    Notification(NotificationGroups.SOURCEGRAPH_ERRORS, title, content, NotificationType.WARNING),
    NotificationFullContent {
  init {
    icon = Icons.CodyLogo
    val learnMoreAction =
        SimpleDumbAwareEDTAction("Learn more") { anActionEvent ->
          val learnMoreLink = if (shouldShowUpgradeOption) UPGRADE_URL else RATE_LIMITS_URL
          openInBrowser(anActionEvent.project, learnMoreLink)
          hideBalloon()
        }
    val dismissAction: AnAction = SimpleDumbAwareEDTAction("Dismiss") { hideBalloon() }

    if (shouldShowUpgradeOption) {
      val upgradeAction =
          SimpleDumbAwareEDTAction("Upgrade") { anActionEvent ->
            TelemetryV2.sendTelemetryEvent(project, "upsellUsageLimitCTA", "clicked")
            openInBrowser(anActionEvent.project, UPGRADE_URL)
            hideBalloon()
          }
      addAction(upgradeAction)
    }

    addAction(learnMoreAction)
    addAction(dismissAction)
  }

  companion object {

    const val UPGRADE_URL = "https://sourcegraph.com/cody/subscription"
    const val RATE_LIMITS_URL =
        "https://sourcegraph.com/docs/cody/core-concepts/cody-gateway#rate-limits-and-quotas"

    fun notify(rateLimitError: RateLimitError, project: Project) {

      val shouldShowUpgradeOption = rateLimitError.upgradeIsAvailable
      val content =
          when {
            shouldShowUpgradeOption ->
                CodyBundle.getString("UpgradeToCodyProNotification.content.upgrade")
            else -> CodyBundle.getString("UpgradeToCodyProNotification.content.explain")
          }
      val title =
          when {
            shouldShowUpgradeOption ->
                CodyBundle.getString("UpgradeToCodyProNotification.title.upgrade")
            else -> CodyBundle.getString("UpgradeToCodyProNotification.title.explain")
          }

      val feature =
          if (rateLimitError.upgradeIsAvailable) "upsellUsageLimitCTA" else "abuseUsageLimitCTA"
      TelemetryV2.sendTelemetryEvent(project, feature, "shown")

      UpgradeToCodyProNotification(project, title, content, shouldShowUpgradeOption).notify(project)
    }

    var isFirstRLEOnAutomaticAutocompletionsShown: Boolean = false
    var autocompleteRateLimitError: AtomicReference<RateLimitError?> = AtomicReference(null)
    var chatRateLimitError: AtomicReference<RateLimitError?> = AtomicReference(null)
  }
}
