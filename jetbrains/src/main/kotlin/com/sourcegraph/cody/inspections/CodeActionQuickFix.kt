package com.sourcegraph.cody.inspections

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.codeInsight.intention.PriorityAction
import com.intellij.codeInspection.HintAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideParams
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_TriggerParams
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCodeAction
import com.sourcegraph.cody.agent.protocol_generated.ProtocolDiagnostic
import com.sourcegraph.cody.agent.protocol_generated.ProtocolLocation
import com.sourcegraph.cody.edit.actions.EditCodeAction

data class CodeActionQuickFixParams(
    val action: ProtocolCodeAction,
    val location: ProtocolLocation,
)

class CodeActionQuickFix(private val params: CodeActionQuickFixParams) :
    IntentionAction, HintAction, PriorityAction {
  companion object {
    const val FAMILY_NAME = "Cody Code Action"
  }

  public fun getDiagnostics(): List<ProtocolDiagnostic>? {
    return params.action.diagnostics
  }

  override fun getPriority(): PriorityAction.Priority {
    return if (isFixAction()) {
      PriorityAction.Priority.NORMAL
    } else if (isExplainAction()) {
      PriorityAction.Priority.LOW
    } else {
      if (params.action.isPreferred == true) PriorityAction.Priority.NORMAL
      else PriorityAction.Priority.LOW
    }
  }

  override fun startInWriteAction(): Boolean {
    // Commands will initialize their own edit sequence
    return false
  }

  override fun getText(): String {
    return params.action.title
  }

  private fun isFixAction(): Boolean {
    // TODO: Ideally we have some flag indicating the semantic action type
    return params.action.title.lowercase() == "ask cody to fix"
  }

  private fun isExplainAction(): Boolean {
    // TODO: Ideally we have some flag indicating the semantic action type
    return params.action.title.lowercase() == "ask cody to explain"
  }

  private fun isKnownAction(): Boolean {
    return isFixAction() || isExplainAction()
  }

  override fun getFamilyName(): String {
    return FAMILY_NAME
  }

  override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean {
    if (file == null || editor == null) {
      return false
    }

    if (isExplainAction()) {
      // TODO: Temporarily disable explain action since it's not implemented
      return false
    }

    if (!isKnownAction()) {
      // TODO: We temporarily disable unknown actions until we've verified they work.
      return false
    }

    return true
  }

  override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
    // TODO: We could be more clever with when we update CODY-3124
    if (editor == null || file == null) {
      return
    }

    // There's no way of receiving a stable ID from the agent and after invoking an action
    // the ID is no longer valid, yet no re-highlighting has occurred. Therefore, we must
    // manually get a new ID from the agent and immediately invoke it
    CodyAgentService.withAgent(project) { agent ->
      val provideResponse =
          agent.server
              .codeActions_provide(
                  CodeActions_ProvideParams(location = params.location, triggerKind = "Invoke"))
              .get()
      val action =
          provideResponse.codeActions.find {
            it.title == params.action.title && it.kind == params.action.kind
          }
      if (action == null) {
        // TODO: handle this with a user notification
        throw Exception("Could not find action")
      }
      // TODO: Need to refactor agent to not return edit session for every action CODY-3125
      val result = agent.server.codeActions_trigger(CodeActions_TriggerParams(id = action.id)).get()
      EditCodeAction.completedEditTasks[result.id] = result
    }
  }

  override fun showHint(editor: Editor): Boolean {
    return true
  }
}
