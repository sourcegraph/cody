package com.sourcegraph.common

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol.RateLimitError
import com.sourcegraph.common.BrowserOpener.openInBrowser
import java.util.concurrent.atomic.AtomicReference

class UpgradeToCodyProNotification
private constructor(content: String, shouldShowUpgradeOption: Boolean) :
    Notification(
        "Sourcegraph errors",
        "You've used up your autocompletes for the month",
        content,
        NotificationType.WARNING),
    NotificationFullContent {
  init {
    setIcon(Icons.CodyLogo)
    val learnMoreAction: AnAction =
        object : DumbAwareAction("Learn more") {
          override fun actionPerformed(anActionEvent: AnActionEvent) {
            val learnMoreLink =
                when {
                  shouldShowUpgradeOption -> "https://sourcegraph.com/cody/subscription"
                  else ->
                      "https://docs.sourcegraph.com/cody/core-concepts/cody-gateway#rate-limits-and-quotas"
                }
            openInBrowser(anActionEvent.project, learnMoreLink)
            hideBalloon()
          }
        }
    val dismissAction: AnAction =
        object : DumbAwareAction("Dismiss") {
          override fun actionPerformed(anActionEvent: AnActionEvent) {
            hideBalloon()
          }
        }

    if (shouldShowUpgradeOption) {
      val upgradeAction: AnAction =
          object : DumbAwareAction("Upgrade") {
            override fun actionPerformed(anActionEvent: AnActionEvent) {
              openInBrowser(anActionEvent.project, "https://sourcegraph.com/cody/subscription")
              hideBalloon()
            }
          }
      addAction(upgradeAction)
    }

    addAction(learnMoreAction)
    addAction(dismissAction)
  }

  companion object {
    fun create(rateLimitError: RateLimitError): UpgradeToCodyProNotification {

      val isGa = java.lang.Boolean.getBoolean("cody.isGa")
      // TODO(mikolaj):
      // RFC 872 mentions `feature flag cody-pro: true`
      // the flag should be a factor in whether to show the upgrade option
      val shouldShowUpgradeOption = isGa && rateLimitError.upgradeIsAvailable
      val content =
          when {
            shouldShowUpgradeOption -> {
              "You've used all${rateLimitError.limit?.let { " $it" }} autocomplete suggestions for the month. " +
                  "Upgrade to Cody Pro for unlimited autocompletes, chats, and commands."
            }
            else -> {
              "You've used all${rateLimitError.quotaString()} autocompletion suggestions.${rateLimitError.resetString()}"
            }
          }
      return UpgradeToCodyProNotification(content, shouldShowUpgradeOption)
    }

    var isFirstRLEOnAutomaticAutocompletionsShown: Boolean = false
    var autocompleteRateLimitError: AtomicReference<RateLimitError?> = AtomicReference(null)
    var chatRateLimitError: AtomicReference<RateLimitError?> = AtomicReference(null)
  }
}
