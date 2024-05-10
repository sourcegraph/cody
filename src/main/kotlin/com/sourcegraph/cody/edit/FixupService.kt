package com.sourcegraph.cody.edit

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.edit.sessions.DocumentCodeSession
import com.sourcegraph.cody.edit.sessions.FixupSession
import com.sourcegraph.cody.edit.sessions.TestCodeSession
import com.sourcegraph.cody.ignore.ActionInIgnoredFileNotification
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.ignore.IgnorePolicy
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.utils.CodyEditorUtil
import java.util.concurrent.atomic.AtomicReference

/** Controller for commands that allow the LLM to edit the code directly. */
@Service(Service.Level.PROJECT)
class FixupService(val project: Project) : Disposable {
  private val logger = Logger.getInstance(FixupService::class.java)

  @Volatile private var activeSession: FixupSession? = null

  // We only have one editing session at a time in JetBrains, for now.
  // This reference ensures we only have one inline-edit dialog active at a time.
  val currentEditPrompt: AtomicReference<EditCommandPrompt?> = AtomicReference(null)

  /** Entry point for the inline edit command, called by the action handler. */
  fun startCodeEdit(editor: Editor) {
    runInEdt {
      if (isEligibleForInlineEdit(editor)) {
        currentEditPrompt.set(EditCommandPrompt(this, editor, "Edit Code with Cody"))
      }
    }
  }

  /** Entry point for the document code command, called by the action handler. */
  fun startDocumentCode(editor: Editor) {
    runInEdt {
      if (isEligibleForInlineEdit(editor)) {
        editor.project?.let { project -> DocumentCodeSession(this, editor, project) }
      }
    }
  }

  /** Entry point for the test code command, called by the action handler. */
  fun startTestCode(editor: Editor) {
    if (isEligibleForInlineEdit(editor)) {
      TestCodeSession(this, editor, editor.project ?: return)
    }
  }

  @RequiresEdt
  fun isEligibleForInlineEdit(editor: Editor): Boolean {
    if (!isCodyEnabled()) {
      logger.warn("Edit code invoked when Cody not enabled")
      return false
    }
    if (!CodyEditorUtil.isEditorValidForAutocomplete(editor)) {
      logger.warn("Edit code invoked when editing not available")
      return false
    }
    val policy = IgnoreOracle.getInstance(project).policyForEditor(editor)
    if (policy != IgnorePolicy.USE) {
      runInEdt { ActionInIgnoredFileNotification().notify(project) }
      logger.warn("Ignoring file for inline edits: $editor, policy=$policy")
      return false
    }
    return true
  }

  fun getActiveSession(): FixupSession? = activeSession

  fun setActiveSession(session: FixupSession) {
    activeSession?.let { if (it.isShowingAcceptLens()) it.accept() else it.cancel() }
    waitUntilActiveSessionIsFinished()
    activeSession = session
  }

  fun waitUntilActiveSessionIsFinished() {
    while (activeSession != null) {
      Thread.sleep(100)
    }
  }

  fun clearActiveSession() {
    // N.B. This cannot call back into the activeSession, or it will recurse.
    activeSession = null
  }

  override fun dispose() {
    activeSession?.let {
      try {
        Disposer.dispose(it)
      } catch (x: Exception) {
        logger.warn("Error disposing session", x)
      }
    }
    currentEditPrompt.get()?.let {
      try {
        Disposer.dispose(it)
      } catch (x: Exception) {
        logger.warn("Error disposing prompt", x)
      }
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): FixupService {
      return project.service<FixupService>()
    }
  }
}
