package com.sourcegraph.cody.statusbar

import com.intellij.ide.actions.AboutAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.ui.BGTActionSetter
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil
import java.util.concurrent.TimeUnit

class CodyStatusBarActionGroup : DefaultActionGroup() {

  init {
    BGTActionSetter.runUpdateOnBackgroundThread(this)
  }

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
    val isCodyPro =
        UpgradeToCodyProNotification.isCodyProJetbrains(project)
            .completeOnTimeout(false, 500, TimeUnit.MILLISECONDS)
            .get()

    val shouldShowUpgradeOption =
        isCodyPro && autocompleteRLE?.upgradeIsAvailable ?: chatRLE?.upgradeIsAvailable ?: false

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
