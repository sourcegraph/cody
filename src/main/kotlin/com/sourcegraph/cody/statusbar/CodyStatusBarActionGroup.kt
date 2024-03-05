package com.sourcegraph.cody.statusbar

import com.intellij.ide.actions.AboutAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.sourcegraph.cody.ui.BGTActionSetter
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil

class CodyStatusBarActionGroup : DefaultActionGroup() {

  init {
    BGTActionSetter.runUpdateOnBackgroundThread(this)
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isVisible = ConfigUtil.isCodyEnabled()

    removeAll()
    if (CodyStatusService.getCurrentStatus() == CodyStatus.CodyAgentNotRunning) {
      addAll(
          OpenLogAction(),
          AboutAction().apply { templatePresentation.text = "Open About To Troubleshoot Issue" },
          ReportCodyBugAction())
    } else {
      addAll(listOfNotNull(deriveWarningAction()))
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

    val shouldShowUpgradeOption =
        autocompleteRLE?.upgradeIsAvailable ?: chatRLE?.upgradeIsAvailable ?: false

    val suggestionOrExplanation =
        if (shouldShowUpgradeOption) CodyBundle.getString("status-widget.warning.upgrade")
        else CodyBundle.getString("status-widget.warning.explain")

    var (action, content, title) =
        when {
          autocompleteRLE != null && chatRLE != null -> {
            Triple(
                CodyBundle.getString("status-widget.warning.autocompletion-and-chat.action-title"),
                CodyBundle.getString("status-widget.warning.autocompletion-and-chat.content")
                    .fmt(suggestionOrExplanation),
                CodyBundle.getString("status-widget.warning.autocompletion-and-chat.dialog-title"))
          }
          autocompleteRLE != null -> {

            Triple(
                CodyBundle.getString("status-widget.warning.autocompletion.action-title"),
                CodyBundle.getString("status-widget.warning.autocompletion.content")
                    .fmt(suggestionOrExplanation),
                CodyBundle.getString("status-widget.warning.autocompletion.dialog-title"))
          }
          chatRLE != null -> {
            Triple(
                CodyBundle.getString("status-widget.warning.chat.action-title"),
                CodyBundle.getString("status-widget.warning.chat.content")
                    .fmt(suggestionOrExplanation),
                CodyBundle.getString("status-widget.warning.chat.dialog-title"))
          }
          else -> return null
        }

    if (!shouldShowUpgradeOption) {
      title = CodyBundle.getString("status-widget.warning.pro.dialog-title")
      content = CodyBundle.getString("status-widget.warning.pro.content")
    }

    return RateLimitErrorWarningAction(action, content, title, shouldShowUpgradeOption)
  }
}
