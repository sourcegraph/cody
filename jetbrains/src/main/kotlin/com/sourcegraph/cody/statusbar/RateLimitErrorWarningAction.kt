package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.telemetry.TelemetryV2
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil

class RateLimitErrorWarningAction(
    actionText: String,
    private val dialogContent: String,
    private val dialogTitle: String,
    private val shouldShowUpgradeOption: Boolean
) : DumbAwareEDTAction(actionText) {
  override fun actionPerformed(e: AnActionEvent) {

    val actions =
        if (shouldShowUpgradeOption) {
          arrayOf("Close", "Upgrade")
        } else {
          arrayOf("Ok")
        }

    val result =
        Messages.showDialog(
            e.project,
            dialogContent,
            dialogTitle,
            actions,
            /* defaultOptionIndex= */ 1,
            Icons.CodyLogo)

    val feature =
        if (shouldShowUpgradeOption) "upsellUsageLimitStatusBar" else "abuseUsageLimitStatusBar"
    e.project?.let { TelemetryV2.sendTelemetryEvent(it, feature, "shown") }

    if (result == 1) {
      e.project?.let { TelemetryV2.sendTelemetryEvent(it, "upsellUsageLimitStatusBar", "clicked") }
      BrowserOpener.openInBrowser(e.project, "https://sourcegraph.com/cody/subscription")
    }
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isEnabledAndVisible = ConfigUtil.isCodyEnabled()
  }
}
