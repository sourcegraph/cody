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
import com.sourcegraph.cody.agent.CodyStartingNotification
import com.sourcegraph.cody.agent.EditingNotAvailableNotification
import com.sourcegraph.cody.edit.sessions.DocumentCodeSession
import com.sourcegraph.cody.edit.sessions.FixupSession
import com.sourcegraph.cody.edit.sessions.TestCodeSession
import com.sourcegraph.cody.ignore.ActionInIgnoredFileNotification
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.ignore.IgnorePolicy
import com.sourcegraph.cody.statusbar.CodyStatus
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.utils.CodyEditorUtil
import java.util.concurrent.atomic.AtomicReference

/** Controller for commands that allow the LLM to edit the code directly. */
@Service(Service.Level.PROJECT)
class FixupService(val project: Project) : Disposable {
  private val logger = Logger.getInstance(FixupService::class.java)

  private val fixupSessionStateListeners: MutableList<ActiveFixupSessionStateListener> =
      mutableListOf()

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
        DocumentCodeSession(this, editor, editor.project ?: return@runInEdt)
      }
    }
  }

  /** Entry point for the test code command, called by the action handler. */
  fun startTestCode(editor: Editor) {
    runInEdt {
      if (isEligibleForInlineEdit(editor)) {
        TestCodeSession(this, editor, editor.project ?: return@runInEdt)
      }
    }
  }

  @RequiresEdt
  fun isEligibleForInlineEdit(editor: Editor): Boolean {
    if (!isCodyEnabled()) {
      logger.warn("Edit code invoked when Cody not enabled")
      return false
    }
    if (CodyStatusService.getCurrentStatus(project) == CodyStatus.CodyAgentNotRunning) {
      runInEdt { CodyStartingNotification().notify(project) }
      logger.warn("The agent is not connected")
      return false
    }
    if (!CodyEditorUtil.isEditorValidForAutocomplete(editor)) {
      runInEdt { EditingNotAvailableNotification().notify(project) }
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

  fun startNewSession(newSession: FixupSession) {
    activeSession?.let { currentSession ->
      // TODO: This should be done on the agent side, but we would need to add new client capability
      // (parallel edits, disabled in JetBrains).
      // We want to enable parallel edits in JetBrains soon, so this would be a wasted effort.
      if (currentSession.isShowingAcceptLens()) {
        currentSession.accept()
        currentSession.dispose()
      } else throw IllegalStateException("Cannot start new session when one is already active")
    }
    activeSession = newSession
  }

  fun clearActiveSession() {
    activeSession = null
    notifySessionStateChanged()
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

  fun addListener(listener: ActiveFixupSessionStateListener) {
    synchronized(fixupSessionStateListeners) { fixupSessionStateListeners.add(listener) }
  }

  fun isEditInProgress(): Boolean {
    return activeSession?.isShowingWorkingLens() ?: false
  }

  fun notifySessionStateChanged() {
    synchronized(fixupSessionStateListeners) {
      for (listener in fixupSessionStateListeners) {
        listener.fixupSessionStateChanged(isEditInProgress())
      }
    }
  }

  interface ActiveFixupSessionStateListener {
    fun fixupSessionStateChanged(isInProgress: Boolean)
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): FixupService {
      return project.service<FixupService>()
    }
  }
}
