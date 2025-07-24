package com.sourcegraph.cody.util

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCodeLens
import com.sourcegraph.cody.edit.lenses.LensListener
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.cody.edit.lenses.providers.EditAcceptCodeVisionProvider
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail

class EditCodeFixture(recordingName: String) :
    BaseIntegrationTextFixture(
        recordingName,
        credentials = TestingCredentials.enterprise,
        CodyAgentService.clientCapabilities.copy(
            globalState = ClientCapabilities.GlobalStateEnum.Stateless)),
    LensListener {
  private val lensSubscribers = mutableListOf<(List<ProtocolCodeLens>) -> Boolean>()

  override fun checkInitialConditionsForOpenFile() {

    // Check the initial state of the action's presentation
    val action = ActionManager.getInstance().getAction("cody.documentCodeAction")
    val event = AnActionEvent.createFromAnAction(action, null, "", createEditorContext(editor))
    action.update(event)
    val presentation = event.presentation
    assertEquals("Action description should be empty", "", presentation.description)
    assertTrue("Action should be enabled", presentation.isEnabled)
    assertTrue("Action should be visible", presentation.isVisible)
  }

  private fun createEditorContext(editor: Editor): DataContext {
    return (editor as? EditorEx)?.dataContext ?: DataContext.EMPTY_CONTEXT
  }

  override fun onLensesUpdate(vf: VirtualFile, codeLenses: List<ProtocolCodeLens>) {
    synchronized(lensSubscribers) { lensSubscribers.removeAll { it(codeLenses) } }
  }

  fun waitForSuccessfulEdit() {
    var attempts = 0
    val maxAttempts = 10

    while (attempts < maxAttempts) {
      val hasAcceptLens =
          LensesService.getInstance(myFixture.project).getLenses(editor).any {
            it.command?.command == EditAcceptCodeVisionProvider.command
          }

      if (hasAcceptLens) break
      Thread.sleep(1000)
      attempts++
    }
    if (attempts >= maxAttempts) {
      fail("Awaiting successful edit: No accept lens found after $maxAttempts attempts")
    }
  }

  fun runAndWaitForCleanState(actionIdToRun: String) {
    runAndWaitForLenses(actionIdToRun)
  }

  fun runAndWaitForLenses(
      actionIdToRun: String,
      vararg expectedLenses: String
  ): List<ProtocolCodeLens> {
    val future = CompletableFuture<List<ProtocolCodeLens>>()
    synchronized(lensSubscribers) {
      lensSubscribers.add { codeLenses ->
        val error = codeLenses.find { it.command?.command == "cody.fixup.codelens.error" }
        if (error != null) {
          future.completeExceptionally(
              IllegalStateException("Error group shown: ${error.command?.title}"))
          return@add false
        }

        if ((expectedLenses.isEmpty() && codeLenses.isEmpty()) ||
            expectedLenses.all { expected -> codeLenses.any { it.command?.command == expected } }) {
          future.complete(codeLenses)
          return@add true
        }
        return@add false
      }
    }

    triggerAction(actionIdToRun)

    try {
      return future.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (e: Exception) {
      val codeLenses = LensesService.getInstance(myFixture.project).getLenses(editor)
      fail(
          "Error while awaiting after action $actionIdToRun. Expected lenses: [${expectedLenses.joinToString()}], got: $codeLenses")
      throw e
    }
  }
}
