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

  private fun deriveWarningAction(): RateLimitErrorWarningAction? {
    val autocompleteRLE = UpgradeToCodyProNotification.autocompleteRateLimitError.get()
    val chatRLE = UpgradeToCodyProNotification.chatRateLimitError.get()

    // TODO(mikolaj):
    // RFC 872 mentions `feature flag cody-pro: true`
    // the flag should be a factor in whether to show the upgrade option
    val isGa = java.lang.Boolean.getBoolean("cody.isGa")
    val shouldShowUpgradeOption =
        isGa && autocompleteRLE?.upgradeIsAvailable ?: chatRLE?.upgradeIsAvailable ?: false

    val suggestionOrExplanation =
        if (shouldShowUpgradeOption)
            "Upgrade to Cody Pro for unlimited autocompletes, chats, and commands."
        else
            " The allowed number of request per day is limited at the moment to ensure the service stays functional."

    return when {
      autocompleteRLE != null && chatRLE != null -> {
        RateLimitErrorWarningAction(
            "<html><b>Warning:</b> Autocomplete and Chat and Commands Limit Reached...</html>",
            "You've used all${autocompleteRLE.limit?.let { " $it" }} autocomplete suggestions, " +
                "and all${chatRLE.limit?.let { " $it" }} chat messages and commands for the month. " +
                suggestionOrExplanation,
            "You've used up your autocompletes, chat and commands for the month",
            shouldShowUpgradeOption)
      }
      autocompleteRLE != null -> {
        RateLimitErrorWarningAction(
            "<html><b>Warning:</b> Autocomplete Limit Reached...</html>",
            "You've used all${autocompleteRLE.limit?.let { " $it" }} autocomplete suggestions for the month. " +
                suggestionOrExplanation,
            "You've used up your autocompletes for the month",
            shouldShowUpgradeOption)
      }
      chatRLE != null -> {
        RateLimitErrorWarningAction(
            "<html><b>Warning:</b> Chat and Commands Limit Reached...</html>",
            "You've used all${chatRLE.limit?.let { " $it" }} chat messages and commands for the month. " +
                suggestionOrExplanation,
            "You've used up your chat and commands for the month",
            shouldShowUpgradeOption)
      }
      else -> {
        null
      }
    }
  }
}
