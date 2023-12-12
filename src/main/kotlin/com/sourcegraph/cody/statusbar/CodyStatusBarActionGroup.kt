package com.sourcegraph.cody.statusbar

import com.intellij.ide.actions.AboutAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.Project
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
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

      val warningActions = deriveWarningAction(e.project!!)

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

  private fun deriveWarningAction(project: Project): RateLimitErrorWarningAction? {
    val autocompleteRLE = UpgradeToCodyProNotification.autocompleteRateLimitError.get()
    val chatRLE = UpgradeToCodyProNotification.chatRateLimitError.get()

    val codyProJetbrains = UpgradeToCodyProNotification.isCodyProJetbrains(project)
    val shouldShowUpgradeOption =
        codyProJetbrains &&
            autocompleteRLE?.upgradeIsAvailable ?: chatRLE?.upgradeIsAvailable ?: false

    val suggestionOrExplanation =
        if (shouldShowUpgradeOption)
            CodyBundle.getString("status-widget.warning.upgrade-suggestion")
        else CodyBundle.getString("status-widget.warning.explanation")

    return when {
      autocompleteRLE != null && chatRLE != null -> {
        RateLimitErrorWarningAction(
            CodyBundle.getString("status-widget.warning.autocompletion-and-chat.action-title"),
            CodyBundle.getString("status-widget.warning.autocompletion-and-chat.content")
                .fmt(
                    autocompleteRLE.limit?.let { " $it" } ?: "",
                    chatRLE.limit?.let { " $it" } ?: "",
                    suggestionOrExplanation),
            CodyBundle.getString("status-widget.warning.autocompletion-and-chat.dialog-title"),
            shouldShowUpgradeOption)
      }
      autocompleteRLE != null -> {
        RateLimitErrorWarningAction(
            CodyBundle.getString("status-widget.warning.autocompletion.action-title"),
            CodyBundle.getString("status-widget.warning.autocompletion.content")
                .fmt(autocompleteRLE.limit?.let { " $it" } ?: "", suggestionOrExplanation),
            CodyBundle.getString("status-widget.warning.autocompletion.dialog-title"),
            shouldShowUpgradeOption)
      }
      chatRLE != null -> {
        RateLimitErrorWarningAction(
            CodyBundle.getString("status-widget.warning.chat.action-title"),
            CodyBundle.getString("status-widget.warning.chat.content")
                .fmt(chatRLE.limit?.let { " $it" } ?: "", suggestionOrExplanation),
            CodyBundle.getString("status-widget.warning.chat.dialog-title"),
            shouldShowUpgradeOption)
      }
      else -> {
        null
      }
    }
  }
}
