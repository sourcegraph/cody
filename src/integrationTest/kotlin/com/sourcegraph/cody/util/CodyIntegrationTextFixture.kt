package com.sourcegraph.cody.util

import com.intellij.ide.lightEdit.LightEdit
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.testFramework.EditorTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.runInEdtAndWait
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCodeLens
import com.sourcegraph.cody.config.CodyPersistentAccountsHost
import com.sourcegraph.cody.config.SourcegraphServerPath
import com.sourcegraph.cody.edit.LensListener
import com.sourcegraph.cody.edit.LensesService
import com.sourcegraph.cody.edit.widget.LensAction
import com.sourcegraph.cody.edit.widget.LensWidgetGroup
import com.sourcegraph.config.ConfigUtil
import java.io.File
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

open class CodyIntegrationTextFixture : BasePlatformTestCase(), LensListener {
  private val logger = Logger.getInstance(CodyIntegrationTextFixture::class.java)
  private val lensSubscribers =
      mutableListOf<
          Pair<(List<ProtocolCodeLens>) -> Boolean, CompletableFuture<LensWidgetGroup?>>>()

  override fun setUp() {
    super.setUp()
    myProject = project
    configureFixture()
    checkInitialConditions()
    LensesService.getInstance(project).addListener(this)
  }

  override fun tearDown() {
    try {
      LensesService.getInstance(project).removeListener(this)
      CodyAgentService.getInstance(myFixture.project).apply {
        try {
          stopAgent(project)
        } catch (x: Exception) {
          logger.warn("Error shutting down agent", x)
        }
      }
    } finally {
      super.tearDown()
    }
  }

  private fun configureFixture() {
    // If you don't specify this system property with this setting when running the tests,
    // the tests will fail, because IntelliJ will run them from the EDT, which can't block.
    // Setting this property invokes the tests from an executor pool thread, which lets us
    // block/wait on potentially long-running operations during the integration test.
    val policy = System.getProperty("idea.test.execution.policy")
    assertTrue(policy == "com.sourcegraph.cody.test.NonEdtIdeaTestExecutionPolicy")

    // This is wherever src/integrationTest/resources is on the box running the tests.
    val testResourcesDir = File(System.getProperty("test.resources.dir"))
    assertTrue(testResourcesDir.exists())

    // During test runs this is set by IntelliJ to a private temp folder.
    // We pass it to the Agent during initialization.
    val workspaceRootUri = ConfigUtil.getWorkspaceRootPath(project)

    // We copy the test resources there manually, bypassing Gradle, which is picky.
    val testDataPath = Paths.get(workspaceRootUri.toString(), "src/").toFile()
    testResourcesDir.copyRecursively(testDataPath, overwrite = true)

    // This useful setting lets us tell the fixture to look where we copied them.
    myFixture.testDataPath = testDataPath.path

    // The file we pass to configureByFile must be relative to testDataPath.
    val projectFile = "testProjects/documentCode/src/main/java/Foo.java"
    val sourcePath = Paths.get(testDataPath.path, projectFile).toString()
    assertTrue(File(sourcePath).exists())
    myFixture.configureByFile(projectFile)

    initCredentialsAndAgent()
    initCaretPosition()
  }

  // Ideally we should call this method only once per recording session, but since we need a
  // `project` to be present it is currently hard to do with Junit 4.
  // Methods there are mostly idempotent though, so calling again for every test case should not
  // change anything.
  private fun initCredentialsAndAgent() {
    val credentials = TestingCredentials.dotcom
    CodyPersistentAccountsHost(project)
        .addAccount(
            SourcegraphServerPath.from(credentials.serverEndpoint, ""),
            login = "test_user",
            displayName = "Test User",
            token = credentials.token ?: credentials.redactedToken,
            id = "random-unique-testing-id-1337")

    assertNotNull(
        "Unable to start agent in a timely fashion!",
        CodyAgentService.getInstance(project)
            .startAgent(project)
            .completeOnTimeout(null, ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .get())
  }

  private fun checkInitialConditions() {
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
    assertTrue("Action should be enabled", presentation.isEnabled)
    assertTrue("Action should be visible", presentation.isVisible)
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

  protected fun assertNoInlayShown() {
    runInEdtAndWait {
      PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
      assertFalse(
          "Lens group inlay should NOT be displayed",
          myFixture.editor.inlayModel.hasBlockElements())
    }
  }

  protected fun assertInlayIsShown() {
    runInEdtAndWait {
      PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
      assertTrue(
          "Lens group inlay should be displayed", myFixture.editor.inlayModel.hasBlockElements())
    }
  }

  override fun onLensesUpdate(
      lensWidgetGroup: LensWidgetGroup?,
      codeLenses: List<ProtocolCodeLens>
  ) {
    synchronized(lensSubscribers) {
      lensSubscribers.removeAll { (checkFunc, future) ->
        val hasLensAppeared = checkFunc(codeLenses)
        if (hasLensAppeared) future.complete(lensWidgetGroup)
        hasLensAppeared
      }
    }
  }

  fun runAndWaitForLenses(actionId: String, actionLensId: String): LensWidgetGroup? {
    val future = CompletableFuture<LensWidgetGroup?>()
    val check = { codeLens: List<ProtocolCodeLens> ->
      codeLens.any { it.command?.command == actionLensId }
    }
    lensSubscribers.add(check to future)

    triggerAction(actionId)

    try {
      return future.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (e: Exception) {
      val stackTrace = e.stackTrace.joinToString("\n") { it.toString() }
      assertTrue(
          "Error while awaiting condition after action $actionId: ${e.localizedMessage}\n$stackTrace",
          false)
      throw e
    }
  }

  fun runLensAction(lensWidgetGroup: LensWidgetGroup, actionLensId: String): LensWidgetGroup? {
    val future = CompletableFuture<LensWidgetGroup?>()
    val check = { codeLens: List<ProtocolCodeLens> -> codeLens.isEmpty() }
    lensSubscribers.add(check to future)

    runInEdtAndWait {
      val action: LensAction? =
          lensWidgetGroup.widgets.filterIsInstance<LensAction>().find {
            it.actionId == actionLensId
          }
      PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
      assertTrue("Lens action $actionLensId should be available", action != null)
      action?.triggerAction(myFixture.editor)
    }

    try {
      return future.get(ASYNC_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (e: Exception) {
      val stackTrace = e.stackTrace.joinToString("\n") { it.toString() }
      assertTrue(
          "Error while awaiting condition after lens action $actionLensId: ${e.localizedMessage}\n$stackTrace",
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
