package com.sourcegraph.cody.inspections

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.codeInsight.intention.PriorityAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideParams
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_TriggerParams
import com.sourcegraph.cody.agent.protocol_generated.ProtocolLocation

data class CodeActionQuickFixParams(
    val title: String,
    val kind: String?,
    val location: ProtocolLocation,
)

class CodeActionQuickFix(private val params: CodeActionQuickFixParams) :
    IntentionAction, PriorityAction {
  companion object {
    const val FAMILY_NAME = "Cody Code Action"
  }

  private val logger = Logger.getInstance(CodeActionQuickFix::class.java)

  override fun getPriority(): PriorityAction.Priority {
    return if (isFixAction()) {
      PriorityAction.Priority.TOP
    } else if (isExplainAction()) {
      PriorityAction.Priority.LOW
    } else {
      PriorityAction.Priority.HIGH
    }
  }

  override fun startInWriteAction(): Boolean {
    // Commands will initialize their own edit sequence
    return false
  }

  override fun getText(): String {
    return params.title
  }

  private fun isFixAction(): Boolean {
    // TODO: Ideally we have some flag indicating the semantic action type
    return params.title.lowercase() == "ask cody to fix"
  }

  private fun isExplainAction(): Boolean {
    // TODO: Ideally we have some flag indicating the semantic action type
    return params.title.lowercase() == "ask cody to explain"
  }

  override fun getFamilyName(): String {
    return FAMILY_NAME
  }

  override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean {
    if (file == null || editor == null) {
      return false
    }

    if (!(isFixAction() || isExplainAction())) {
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
          provideResponse.codeActions.find { it.title == params.title && it.kind == params.kind }
      if (action == null) {
        // TODO: handle this with a user notification
        throw Exception("Could not find action")
      }
      // TODO: Need to refactor agent to not return edit session for every action CODY-3125
      agent.server.codeActions_trigger(CodeActions_TriggerParams(id = action.id))
    }
  }
}
