package com.sourcegraph.cody.edit

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.sourcegraph.cody.edit.EditCommandPrompt.Companion.EDIT_COMMAND_PROMPT_KEY

internal class InlineEditPromptEditCodeAction : DumbAwareAction() {
  private fun getInlineEditPrompt(event: AnActionEvent) = EDIT_COMMAND_PROMPT_KEY.get(event.project)

  override fun update(event: AnActionEvent) {
    event.presentation.isEnabledAndVisible = getInlineEditPrompt(event)?.isOkActionEnabled() == true
  }

  override fun actionPerformed(e: AnActionEvent) {
    getInlineEditPrompt(e)?.performOKAction()
  }

  override fun getActionUpdateThread(): ActionUpdateThread {
    return ActionUpdateThread.EDT
  }
}
