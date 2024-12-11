package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.sourcegraph.cody.agent.action.CodyAgentRestartAction
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil

class CodyStatusBarActionGroup : DefaultActionGroup() {

  override fun getActionUpdateThread(): ActionUpdateThread {
    return ActionUpdateThread.EDT
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isVisible = ConfigUtil.isCodyEnabled()

    removeAll()
    val status = e.project?.let { CodyStatusService.getCurrentStatus(it) }
    if (status == CodyStatus.CodyAgentNotRunning || status == CodyStatus.AgentError) {
      addAll(CodyAgentRestartAction(), OpenLogAction(), ReportCodyBugAction())
    } else {
      addAll(listOfNotNull(deriveRateLimitErrorAction()))
      addSeparator()
      addAll(
          CodyOpenSettingsAction(),
      )
      addSeparator()
      addAll(
          CodyEnableAutocompleteAction(),
          CodyDisableAutocompleteAction(),
          CodyEnableLanguageForAutocompleteAction(),
          CodyDisableLanguageForAutocompleteAction(),
      )
    }
  }

  private fun deriveRateLimitErrorAction(): RateLimitErrorWarningAction? {
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
