package com.sourcegraph.cody.util

import com.intellij.ide.lightEdit.LightEdit
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.EditorTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.HeavyIdeaTestFixture
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.runInEdtAndWait
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities
import com.sourcegraph.cody.agent.protocol_generated.ProtocolAuthenticatedAuthStatus
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue

open class BaseIntegrationTextFixture(
    private val recordingName: String,
    private val credentials: TestingCredentials,
    private val capabilities: ClientCapabilities,
    codySettingsContent: String = "{\n  \n}"
) {
  companion object {
    const val ASYNC_WAIT_TIMEOUT_SECONDS = 20L
  }

  private val logger = Logger.getInstance(BaseIntegrationTextFixture::class.java)

  // We don't want to use .!! or .? everywhere in the tests,
  // and if those won't be initialized test should crash anyway
  lateinit var editor: Editor
  lateinit var file: VirtualFile

  val project: Project

  protected val myFixture: HeavyIdeaTestFixture

  init {
    val projectBuilder =
        IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder(this::class.java.name)

    myFixture = projectBuilder.fixture as HeavyIdeaTestFixture
    myFixture.setUp()
    project = myFixture.project
    Disposer.register(myFixture.testRootDisposable) { shutdown() }

    CodyEditorUtil.createFileOrScratchFromUntitled(
        project, ConfigUtil.getSettingsFile(project).toUri().toString(), codySettingsContent)

    initCredentialsAndAgent()
    baseCheckInitialConditions()
  }

  fun openFile(relativeFilePath: String) {
    val testDataPath = System.getProperty("test.resources.dir")
    val sourceFile = "$testDataPath/testProjects/$relativeFilePath"
    val basePath = project.basePath!!
    WriteCommandAction.runWriteCommandAction(project) {
      file =
          myFixture
              .addFileToProject(basePath, relativeFilePath, File(sourceFile).readText())
              ?.virtualFile!!

      editor =
          FileEditorManager.getInstance(project)
              .openTextEditor(OpenFileDescriptor(project, file), true)!!
    }

    initCaretPosition()
    checkInitialConditionsForOpenFile()
  }

  private fun awaitPendingPromises() {
    val done = CompletableFuture<Void>()
    CodyAgentService.withAgent(project) { agent ->
      agent.server.testing_awaitPendingPromises(null).thenAccept { done.complete(null) }
    }
    done.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
  }

  fun shutdown() {
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
        .stopAgent()
        ?.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    CodyAgentService.getInstance(project).dispose()
  }

  // Ideally we should call this method only once per recording session, but since we need a
  // `project` to be present it is currently hard to do with Junit 4.
  // Methods there are mostly idempotent though, so calling again for every test case should not
  // change anything.
  private fun initCredentialsAndAgent() {
    val endpoint = SourcegraphServerPath.from(credentials.serverEndpoint, "")
    val token = credentials.token ?: credentials.redactedToken

    System.setProperty("CODY_RECORDING_NAME", recordingName)

    assertNotNull(
        "Unable to start agent in a timely fashion!",
        CodyAgentService.getInstance(project)
            .startAgent(capabilities, endpoint, token)
            .completeOnTimeout(null, ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .get())
  }

  private fun baseCheckInitialConditions() {
    awaitPendingPromises()
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
  }

  open fun checkInitialConditionsForOpenFile() {}

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

  // This provides a crude mechanism for specifying the caret position in the test file.
  private fun initCaretPosition() {
    runInEdtAndWait {
      val document = FileDocumentManager.getInstance().getDocument(file)!!
      val caretToken = "[[caret]]"
      val caretIndex = document.text.indexOf(caretToken)

      if (caretIndex != -1) { // Remove caret token from doc
        WriteCommandAction.runWriteCommandAction(project) {
          document.deleteString(caretIndex, caretIndex + caretToken.length)
        }
        // Place the caret at the position where the token was found.
        editor.caretModel.moveToOffset(caretIndex)
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
      val document = FileDocumentManager.getInstance().getDocument(file)!!
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
        editor.selectionModel.setSelection(start, end)
      } else {
        logger.warn("No caret or selection range specified in test file.")
      }
    }
  }

  fun triggerAction(actionId: String) {
    runInEdtAndWait {
      PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
      EditorTestUtil.executeAction(editor, actionId)
    }
  }

  fun hasJavadocComment(text: String): Boolean {
    // TODO: Check for the exact contents once they are frozen.
    val javadocPattern = Pattern.compile("/\\*\\*.*?\\*/", Pattern.DOTALL)
    return javadocPattern.matcher(text).find()
  }
}
