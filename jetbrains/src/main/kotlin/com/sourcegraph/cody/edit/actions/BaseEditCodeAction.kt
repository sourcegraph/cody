package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Ignore_TestResult
import com.sourcegraph.cody.autocomplete.action.CodyAction
import com.sourcegraph.cody.config.CodyAuthenticationManager
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
    event.presentation.description =
        if (!isCodyWorking(project)) {
          CodyBundle.getString("action.cody.not-working")
        } else if (isBlockedByPolicy(project, event)) {
          CodyBundle.getString("filter.action-in-ignored-file.detail")
        } else if (CodyAuthenticationManager.getInstance().hasNoActiveAccount()) {
          CodyBundle.getString("action.sourcegraph.disabled.description")
        } else {
          ""
        }
    event.presentation.isEnabled = event.presentation.description.isBlank()
  }
}
