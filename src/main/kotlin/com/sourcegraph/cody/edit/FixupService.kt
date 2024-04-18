package com.sourcegraph.cody.edit

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.protocol.EditTask
import com.sourcegraph.cody.edit.sessions.DocumentCodeSession
import com.sourcegraph.cody.edit.sessions.FixupSession
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.utils.CodyEditorUtil

/** Controller for commands that allow the LLM to edit the code directly. */
@Service(Service.Level.PROJECT)
class FixupService(val project: Project) : Disposable {
  private val logger = Logger.getInstance(FixupService::class.java)

  // We only use this for multiplexing task updates from the Agent to concurrent sessions.
  // TODO: Consider doing the multiplexing in CodyAgentClient instead.
  private var activeSessions: MutableMap<String, FixupSession> = mutableMapOf()

  // Sessions for which we have not yet received a task ID, but may receive an edit anyway.
  private var pendingSessions: MutableSet<FixupSession> = mutableSetOf()

  // The last text the user typed in without saving it, for continuity.
  private var lastPrompt: String = ""

  /** Entry point for the inline edit command, called by the action handler. */
  fun startCodeEdit(editor: Editor) {
    if (isEligibleForInlineEdit(editor)) {
      EditCommandPrompt(this, editor, "Edit Code with Cody").displayPromptUI()
    }
  }

  /** Entry point for the document code command, called by the action handler. */
  fun startDocumentCode(editor: Editor) {
    if (!isEligibleForInlineEdit(editor)) return
    DocumentCodeSession(this, editor, editor.project ?: return, editor.document)
  }

  fun isEligibleForInlineEdit(editor: Editor): Boolean {
    if (!isCodyEnabled()) {
      logger.warn("Edit code invoked when Cody not enabled")
      return false
    }
    if (!CodyEditorUtil.isEditorValidForAutocomplete(editor)) {
      logger.warn("Inline edit invoked when editing not available")
      return false
    }
    return true
  }

  fun getLastPrompt(): String = lastPrompt

  fun getActiveSession(): FixupSession? {
    val session: FixupSession? =
        pendingSessions.firstOrNull() ?: activeSessions.values.firstOrNull()
    if (session == null) {
      logger.warn("No sessions found for performing inline edits")
    }
    return session
  }

  fun getSessionForTask(task: EditTask): FixupSession? {
    val session = activeSessions[task.id]
    if (session == null) {
      logger.warn("No session found for task ${task.id}")
    }
    return session
  }

  fun addSession(session: FixupSession) {
    val taskId = session.taskId
    if (taskId == null) {
      pendingSessions.add(session)
    } else {
      pendingSessions.remove(session)
      activeSessions[session.taskId!!] = session
    }
  }

  fun removeSession(session: FixupSession) {
    pendingSessions.remove(session)
    activeSessions.remove(session.taskId)
  }

  override fun dispose() {
    activeSessions.values.forEach { it.dispose() }
    pendingSessions.forEach { it.dispose() }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): FixupService {
      return project.service<FixupService>()
    }
  }
}
