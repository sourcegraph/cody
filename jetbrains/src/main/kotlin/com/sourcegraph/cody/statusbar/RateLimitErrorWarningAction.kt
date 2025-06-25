package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import com.sourcegraph.Icons
import com.sourcegraph.cody.telemetry.TelemetryV2
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil

class RateLimitErrorWarningAction(
    actionText: String,
    private val dialogContent: String,
    private val dialogTitle: String,
) : DumbAwareEDTAction(actionText) {
  override fun actionPerformed(e: AnActionEvent) {

    val actions = arrayOf("Ok")

    Messages.showDialog(
        e.project,
        dialogContent,
        dialogTitle,
        actions,
        /* defaultOptionIndex= */ 1,
        Icons.CodyLogo
    )

    e.project?.let { TelemetryV2.sendTelemetryEvent(it, "abuseUsageLimitStatusBar", "shown") }
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isEnabledAndVisible = ConfigUtil.isCodyEnabled()
  }
}
