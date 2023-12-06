package com.sourcegraph.cody.statusbar

import com.intellij.ide.actions.AboutAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil

class CodyStatusBarActionGroup : DefaultActionGroup() {
  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isVisible = ConfigUtil.isCodyEnabled()

    removeAll()
    if (CodyAutocompleteStatusService.getCurrentStatus() ==
        CodyAutocompleteStatus.CodyAgentNotRunning) {
      addAll(
          OpenLogAction(),
          AboutAction().apply { templatePresentation.text = "Open About To Troubleshoot Issue" },
          ReportCodyBugAction())
    } else {

      val warningActions = deriveWarningAction()

      addAll(listOfNotNull(warningActions))
      addSeparator()
      addAll(
          CodyDisableAutocompleteAction(),
          CodyEnableLanguageForAutocompleteAction(),
          CodyDisableLanguageForAutocompleteAction(),
          CodyManageAccountsAction(),
          CodyOpenSettingsAction(),
      )
    }
  }

  private fun deriveWarningAction() =
      if (UpgradeToCodyProNotification.autocompleteRateLimitError &&
          UpgradeToCodyProNotification.chatRateLimitError) {
        RateLimitErrorWarningAction(
            "<html><b>Warning:</b> Chat and Autocomplete Limit Reached...</html>",
            "You've used all chat messages and commands, and autocompletion suggestions. The allowed number of request per day is limited at the moment to ensure the service stays functional.",
            "Chat and Autocomplete Limit Reached",
        )
      } else if (UpgradeToCodyProNotification.autocompleteRateLimitError) {
        RateLimitErrorWarningAction(
            "<html><b>Warning:</b> Autocomplete Limit Reached...</html>",
            "You've used all autocompletion suggestions. The allowed number of request per day is limited at the moment to ensure the service stays functional.",
            "Autocomplete Limit Reached",
        )
      } else if (UpgradeToCodyProNotification.chatRateLimitError) {
        RateLimitErrorWarningAction(
            "<html><b>Warning:</b> Chat Limit Reached...</html>",
            "You've used all chat messages and commands. The allowed number of request per day is limited at the moment to ensure the service stays functional.",
            "Chat Limit Reached",
        )
      } else {
        null
      }
}
