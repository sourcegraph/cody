package com.sourcegraph.cody.util

import com.intellij.ide.lightEdit.LightEdit
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.EditorTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.runInEdtAndWait
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ProtocolAuthenticatedAuthStatus
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCodeLens
import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.cody.edit.lenses.LensListener
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.cody.edit.lenses.providers.EditAcceptCodeVisionProvider
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern
import junit.framework.TestCase

open class CodyIntegrationTextFixture : BasePlatformTestCase(), LensListener {
  private val logger = Logger.getInstance(CodyIntegrationTextFixture::class.java)
  private val lensSubscribers = mutableListOf<(List<ProtocolCodeLens>) -> Boolean>()

  override fun setUp() {
    super.setUp()

    myProject = project
    myFixture.testDataPath = System.getProperty("test.resources.dir")
    // The file we pass to configureByFile must be relative to testDataPath.
    myFixture.configureByFile("testProjects/documentCode/src/main/java/Foo.java")
    TestCase.assertTrue(myFixture.file.virtualFile.exists())

    initCredentialsAndAgent()
    initCaretPosition()

    val done = CompletableFuture<Void>()
    CodyAgentService.withAgent(project) { agent ->
      agent.server.testing_awaitPendingPromises(null).thenAccept { done.complete(null) }
    }
    done.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)

    checkInitialConditions()
    LensesService.getInstance(project).addListener(this)
  }

  override fun tearDown() {
    try {
      LensesService.getInstance(project).removeListener(this)

      runInEdt { WriteAction.run<RuntimeException> { myFixture.file.virtualFile.delete(this) } }

      val recordingsFuture = CompletableFuture<Void>()
      CodyAgentService.withAgent(project) { agent ->
        val errors = agent.server.testing_requestErrors(null).get()
        // We extract polly.js errors to notify users about the missing recordings, if any
        val missingRecordings =
            errors.errors.filter { it.error?.contains("`recordIfMissing` is") == true }
        missingRecordings.forEach { missing ->
          logger.error(
              """Recording is missing: ${missing.error}
                |
                |${missing.body}
                |
                |------------------------------------------------------------------------------------------
                |To fix this problem please run `./gradlew :recordingIntegrationTest`.
                |You need to export access tokens first, using script from the `sourcegraph/cody` repository:
                |`agent/scripts/export-cody-http-recording-tokens.sh`
                |------------------------------------------------------------------------------------------
              """
                  .trimMargin())
        }
        recordingsFuture.complete(null)
      }
      recordingsFuture.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      CodyAgentService.getInstance(project)
          .stopAgent(project)
          ?.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      CodyAgentService.getInstance(project).dispose()
    } finally {
      super.tearDown()
    }
  }

  // Ideally we should call this method only once per recording session, but since we need a
  // `project` to be present it is currently hard to do with Junit 4.
  // Methods there are mostly idempotent though, so calling again for every test case should not
  // change anything.
  private fun initCredentialsAndAgent() {
    val credentials = TestingCredentials.dotcom
    val account = CodyAccount(SourcegraphServerPath.from(credentials.serverEndpoint, ""))
    account.storeToken(
        credentials.token ?: credentials.redactedToken,
    )
    CodyAccount.setActiveAccount(account)

    assertNotNull(
        "Unable to start agent in a timely fashion!",
        CodyAgentService.getInstance(project)
            .startAgent(project)
            .completeOnTimeout(null, ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .get())
  }

  private fun checkInitialConditions() {
    isAuthenticated()

    // If you don't specify this system property with this setting when running the tests,
    // the tests will fail, because IntelliJ will run them from the EDT, which can't block.
    // Setting this property invokes the tests from an executor pool thread, which lets us
    // block/wait on potentially long-running operations during the integration test.
    val policy = System.getProperty("idea.test.execution.policy")
    assertTrue(policy == "com.sourcegraph.cody.NonEdtIdeaTestExecutionPolicy")

    val project = myFixture.project

    // Check if the project is in dumb mode
    val isDumbMode = DumbService.getInstance(project).isDumb
    assertFalse("Project should not be in dumb mode", isDumbMode)

    // Check if the project is in LightEdit mode
    val isLightEditMode = LightEdit.owns(project)
    assertFalse("Project should not be in LightEdit mode", isLightEditMode)

    // Check the initial state of the action's presentation
    val action = ActionManager.getInstance().getAction("cody.documentCodeAction")
    val event =
        AnActionEvent.createFromAnAction(action, null, "", createEditorContext(myFixture.editor))
    action.update(event)
    val presentation = event.presentation
    assertEquals("Action description should be empty", "", presentation.description)
    assertTrue("Action should be enabled", presentation.isEnabled)
    assertTrue("Action should be visible", presentation.isVisible)
  }

  private fun isAuthenticated() {
    val authenticated = CompletableFuture<Boolean>()
    CodyAgentService.withAgent(project) { agent ->
      agent.server.extensionConfiguration_status(null).thenAccept { authStatus ->
        authenticated.complete(authStatus is ProtocolAuthenticatedAuthStatus)
      }
    }

    assertTrue(
        "User is not authenticated",
        authenticated.completeOnTimeout(false, ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS).get())
  }

  private fun createEditorContext(editor: Editor): DataContext {
    return (editor as? EditorEx)?.dataContext ?: DataContext.EMPTY_CONTEXT
  }

  // This provides a crude mechanism for specifying the caret position in the test file.
  private fun initCaretPosition() {
    runInEdtAndWait {
      val virtualFile = myFixture.file.virtualFile
      val document = FileDocumentManager.getInstance().getDocument(virtualFile)!!
      val caretToken = "[[caret]]"
      val caretIndex = document.text.indexOf(caretToken)

      if (caretIndex != -1) { // Remove caret token from doc
        WriteCommandAction.runWriteCommandAction(project) {
          document.deleteString(caretIndex, caretIndex + caretToken.length)
        }
        // Place the caret at the position where the token was found.
        myFixture.editor.caretModel.moveToOffset(caretIndex)
        // myFixture.editor.selectionModel.setSelection(caretIndex, caretIndex)
      } else {
        initSelectionRange()
      }
    }
  }

  // Provides  a mechanism to specify the selection range via [[start]] and [[end]].
  // The tokens are removed and the range is selected, notifying the Agent.
  private fun initSelectionRange() {
    runInEdtAndWait {
      val virtualFile = myFixture.file.virtualFile
      val document = FileDocumentManager.getInstance().getDocument(virtualFile)!!
      val startToken = "[[start]]"
      val endToken = "[[end]]"
      val start = document.text.indexOf(startToken)
      val end = document.text.indexOf(endToken)
      // Remove the tokens from the document.
      if (start != -1 && end != -1) {
        ApplicationManager.getApplication().runWriteAction {
          document.deleteString(start, start + startToken.length)
          document.deleteString(end, end + endToken.length)
        }
        myFixture.editor.selectionModel.setSelection(start, end)
      } else {
        logger.warn("No caret or selection range specified in test file.")
      }
    }
  }

  private fun triggerAction(actionId: String) {
    runInEdtAndWait {
      PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
      EditorTestUtil.executeAction(myFixture.editor, actionId)
    }
  }

  override fun onLensesUpdate(vf: VirtualFile, codeLenses: List<ProtocolCodeLens>) {
    synchronized(lensSubscribers) { lensSubscribers.removeAll { it(codeLenses) } }
  }

  fun waitForSuccessfulEdit() {
    var attempts = 0
    val maxAttempts = 10

    while (attempts < maxAttempts) {
      val hasAcceptLens =
          LensesService.getInstance(myFixture.project).getLenses(myFixture.editor).any {
            it.command?.command == EditAcceptCodeVisionProvider.command
          }

      if (hasAcceptLens) break
      Thread.sleep(1000)
      attempts++
    }
    if (attempts >= maxAttempts) {
      assertTrue(
          "Awaiting successful edit: No accept lens found after $maxAttempts attempts", false)
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
      val codeLenses = LensesService.getInstance(myFixture.project).getLenses(myFixture.editor)
      assertTrue(
          "Error while awaiting after action $actionIdToRun. Expected lenses: [${expectedLenses.joinToString()}], got: $codeLenses",
          false)
      throw e
    }
  }

  protected fun hasJavadocComment(text: String): Boolean {
    // TODO: Check for the exact contents once they are frozen.
    val javadocPattern = Pattern.compile("/\\*\\*.*?\\*/", Pattern.DOTALL)
    return javadocPattern.matcher(text).find()
  }

  companion object {
    const val ASYNC_WAIT_TIMEOUT_SECONDS = 20L
    var myProject: Project? = null
  }
}
