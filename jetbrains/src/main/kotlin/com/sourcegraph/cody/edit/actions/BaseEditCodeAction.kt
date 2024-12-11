package com.sourcegraph.cody.edit.actions

import com.intellij.codeInsight.hint.HintManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Ignore_TestResult
import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.cody.autocomplete.action.CodyAction
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.config.ConfigUtil

open class BaseEditCodeAction(runAction: (Editor) -> Unit) :
    EditorAction(BaseEditCodeActionHandler(runAction)), CodyAction, DumbAware {

  private fun isBlockedByPolicy(project: Project, event: AnActionEvent): Boolean {
    val editor = event.getData(com.intellij.openapi.actionSystem.CommonDataKeys.EDITOR)
    return editor != null &&
        IgnoreOracle.getInstance(project).policyForEditor(editor) !=
            Ignore_TestResult.PolicyEnum.Use
  }

  private fun isCodyWorking(project: Project): Boolean {
    return ConfigUtil.isCodyEnabled() && CodyAgentService.isConnected(project)
  }

  override fun update(event: AnActionEvent) {
    super.update(event)

    val project = event.project ?: return
    val (isEnabled, description) =
        if (!isCodyWorking(project)) {
          false to CodyBundle.getString("action.cody.not-working")
        } else if (isBlockedByPolicy(project, event)) {
          false to CodyBundle.getString("filter.action-in-ignored-file.detail")
        } else if (!CodyAccount.hasActiveAccount()) {
          false to CodyBundle.getString("action.sourcegraph.disabled.description")
        } else {
          true to ""
        }

    if (!isEnabled) {
      runInEdt {
        val editor = event.getData(com.intellij.openapi.actionSystem.CommonDataKeys.EDITOR)
        if (editor != null) {
          HintManager.getInstance().showErrorHint(editor, description)
        }
        CodyToolWindowContent.show(project)
      }
    }

    event.presentation.description = description
    event.presentation.isEnabled = isEnabled
  }
}
