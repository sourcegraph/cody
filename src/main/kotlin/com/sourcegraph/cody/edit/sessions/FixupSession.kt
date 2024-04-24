package com.sourcegraph.cody.edit.sessions

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ScrollType
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfoRt
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.io.createFile
import com.intellij.util.io.exists
import com.intellij.util.withScheme
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentCodebase
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.CodyTaskState
import com.sourcegraph.cody.agent.protocol.EditTask
import com.sourcegraph.cody.agent.protocol.GetFoldingRangeParams
import com.sourcegraph.cody.agent.protocol.Position
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol.Range
import com.sourcegraph.cody.agent.protocol.TaskIdParam
import com.sourcegraph.cody.agent.protocol.TextEdit
import com.sourcegraph.cody.agent.protocol.WorkspaceEditParams
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.edit.EditShowDiffAction
import com.sourcegraph.cody.edit.EditShowDiffAction.Companion.DIFF_SESSION_DATA_KEY
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.cody.edit.exception.EditCreationException
import com.sourcegraph.cody.edit.exception.EditExecutionException
import com.sourcegraph.cody.edit.fixupActions.FixupUndoableAction
import com.sourcegraph.cody.edit.fixupActions.InsertUndoableAction
import com.sourcegraph.cody.edit.fixupActions.ReplaceUndoableAction
import com.sourcegraph.cody.edit.widget.LensGroupFactory
import com.sourcegraph.cody.edit.widget.LensWidgetGroup
import com.sourcegraph.utils.CodyEditorUtil
import java.net.URI
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.TimeUnit
import kotlin.io.path.toPath

/**
 * Common functionality for commands that let the agent edit the code inline, such as adding a doc
 * string, or fixing up a region according to user instructions.
 */
abstract class FixupSession(
    val controller: FixupService,
    val project: Project,
    var editor: Editor
) : Disposable {

  private val logger = Logger.getInstance(FixupSession::class.java)
  private val fixupService = FixupService.getInstance(project)

  // This is passed back by the Agent when we initiate the editing task.
  var taskId: String? = null

  private var lensGroup: LensWidgetGroup? = null

  private var selectionRange: Range? = null

  private val performedActions: MutableList<FixupUndoableAction> = mutableListOf()

  private val lensActionCallbacks =
      mapOf(
          COMMAND_ACCEPT to { accept() },
          COMMAND_CANCEL to { cancel() },
          COMMAND_RETRY to { retry() },
          COMMAND_DIFF to { diff() },
          COMMAND_UNDO to { undo() },
      )

  init {
    triggerDocumentCodeAsync()
  }

  fun commandCallbacks(): Map<String, () -> Unit> = lensActionCallbacks

  private val document
    get() = editor.document

  @RequiresEdt
  private fun triggerDocumentCodeAsync() {
    // Those lookups require us to be on the EDT.
    val file = FileDocumentManager.getInstance().getFile(document)
    val textFile = file?.let { ProtocolTextDocument.fromVirtualFile(editor, it) } ?: return

    CodyAgentService.withAgent(project) { agent ->
      workAroundUninitializedCodebase()
      // Force a round-trip to get folding ranges before showing lenses.
      ensureSelectionRange(agent, textFile)
      showWorkingGroup()
      // All this because we can get the workspace/edit before the request returns!
      fixupService.addSession(this) // puts in Pending
      makeEditingRequest(agent)
          .handle { result, error ->
            if (error != null || result == null) {
              // TODO: Adapt logic from CodyCompletionsManager.handleError
              logger.warn("Error while generating doc string: $error")
              fixupService.removeSession(this)
            } else {
              taskId = result.id
              selectionRange = adjustToDocumentRange(result.selectionRange)
              fixupService.addSession(this)
            }
            null
          }
          .exceptionally { error: Throwable? ->
            if (!(error is CancellationException || error is CompletionException)) {
              logger.warn("Error while generating doc string: $error")
            }
            fixupService.removeSession(this)
            null
          }
          .completeOnTimeout(null, 3, TimeUnit.SECONDS)
    }
  }

  // We're consistently triggering the 'retrieved codebase context before initialization' error
  // in ContextProvider.ts. It's a different initialization path from completions & chat.
  // Calling onFileOpened forces the right initialization path.
  private fun workAroundUninitializedCodebase() {
    val file = FileDocumentManager.getInstance().getFile(document)
    if (file != null) {
      CodyAgentCodebase.getInstance(project).onFileOpened(file)
    } else {
      logger.warn("No virtual file associated with $document")
    }
  }

  private fun ensureSelectionRange(agent: CodyAgent, textFile: ProtocolTextDocument) {
    val selection = textFile.selection ?: return
    selectionRange = selection
    agent.server
        .getFoldingRanges(GetFoldingRangeParams(uri = textFile.uri, range = selection))
        .thenApply { result -> selectionRange = result.range }
        .get()
  }

  fun update(task: EditTask) {
    logger.warn("Task updated: $task")
    when (task.state) {
      CodyTaskState.Idle -> {}
      CodyTaskState.Working,
      CodyTaskState.Inserting,
      CodyTaskState.Applying,
      CodyTaskState.Formatting -> {}
      // Tasks remain in this state until explicit accept/undo/cancel.
      CodyTaskState.Applied -> showAcceptGroup()
      // Then they transition to finished.
      CodyTaskState.Finished -> {}
      CodyTaskState.Error -> {}
      CodyTaskState.Pending -> {}
    }
  }

  /** Notification that the Agent has deleted the task. Clean up if we haven't yet. */
  fun taskDeleted() {
    finish()
  }

  private fun showLensGroup(group: LensWidgetGroup) {
    lensGroup?.let { if (!it.isDisposed.get()) Disposer.dispose(it) }
    lensGroup = group
    var range = selectionRange
    if (range == null) {
      // Be defensive, as the protocol has been fragile with respect to selection ranges.
      logger.warn("No selection range for session: $this")
      // Last-ditch effort to show it somewhere other than top of file.
      val position = Position(editor.caretModel.currentCaret.logicalPosition.line, 0)
      range = Range(start = position, end = position)
    } else {
      val position = Position(range.start.line, 0)
      range = Range(start = position, end = position)
    }
    group.show(range)
    // Make sure the lens is visible.
    ApplicationManager.getApplication().invokeLater {
      val logicalPosition = LogicalPosition(range.start.line, range.start.character)
      editor.scrollingModel.scrollTo(logicalPosition, ScrollType.CENTER)
    }
  }

  private fun showWorkingGroup() {
    showLensGroup(LensGroupFactory(this).createTaskWorkingGroup())
  }

  private fun showAcceptGroup() {
    showLensGroup(LensGroupFactory(this).createAcceptGroup())
  }

  fun finish() {
    try {
      controller.removeSession(this)
    } catch (x: Exception) {
      logger.debug("Session cleanup error", x)
    }
    Disposer.dispose(this)
  }

  /** Subclass sends a fixup command to the agent, and returns the initial task. */
  abstract fun makeEditingRequest(agent: CodyAgent): CompletableFuture<EditTask>

  fun accept() {
    CodyAgentService.withAgent(project) { agent ->
      agent.server.acceptEditTask(TaskIdParam(taskId!!))
    }
    finish()
  }

  fun cancel() {
    CodyAgentService.withAgent(project) { agent ->
      agent.server.cancelEditTask(TaskIdParam(taskId!!))
    }
    if (performedActions.isNotEmpty()) {
      undo()
    } else {
      finish()
    }
  }

  fun retry() {
    // TODO: The actual prompt we sent is displayed as ghost text in the text input field, in VS
    // Code.
    // E.g. "Write a brief documentation comment for the selected code <etc.>"
    // We need to send the prompt along with the lenses, so that the client can display it.
    EditCommandPrompt(controller, editor, "Edit instructions and Retry").displayPromptUI()
  }

  fun diff() {
    val editShowDiffAction = ActionManager.getInstance().getAction("cody.editShowDiffAction")

    editShowDiffAction.actionPerformed(
        AnActionEvent(
            /* inputEvent = */ null,
            /* dataContext = */ { dataId ->
              when (dataId) {
                CommonDataKeys.PROJECT.name -> project
                EditShowDiffAction.EDITOR_DATA_KEY.name -> editor
                DIFF_SESSION_DATA_KEY.name -> createDiffDocument()
                else -> null
              }
            },
            /* place = */ ActionPlaces.UNKNOWN,
            /* presentation = */ Presentation(),
            /* actionManager = */ ActionManager.getInstance(),
            /* modifiers = */ 0))
  }

  fun undo() {
    CodyAgentService.withAgent(project) { agent ->
      agent.server.undoEditTask(TaskIdParam(taskId!!))
    }
    undoEdits()
    finish()
  }

  fun performWorkspaceEdit(workspaceEditParams: WorkspaceEditParams) {

    for (op in workspaceEditParams.operations) {

      op.uri?.let { createAndSwitchFileIfNeeded(it) }

      // TODO: We need to support the file-level operations.
      when (op.type) {
        "create-file" -> {
          logger.warn("Workspace edit operation created a file: ${op.uri}")
        }
        "rename-file" -> {
          logger.warn("Workspace edit operation renamed a file: ${op.oldUri} -> ${op.newUri}")
        }
        "delete-file" -> {
          logger.warn("Workspace edit operation deleted a file: ${op.uri}")
        }
        "edit-file" -> {
          if (op.edits == null) {
            logger.warn("Workspace edit operation has no edits")
          } else {
            logger.info("Applying edits to a file (size ${document.textLength} chars): ${op.uri}")
            performInlineEdits(op.edits)
          }
        }
        else ->
            logger.warn(
                "DocumentCommand session received unknown workspace edit operation: ${op.type}")
      }
    }
  }

  private fun createAndSwitchFileIfNeeded(path: String) {
    val uri = URI.create(path).withScheme("file")
    if (!uri.toPath().exists()) uri.toPath().createFile()

    val vf = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(uri.toPath()) ?: return
    if (FileDocumentManager.getInstance().getFile(document) == vf) {
      return
    }

    ApplicationManager.getApplication().invokeAndWait { CodyEditorUtil.showDocument(project, path) }
    editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return
    val textFile = ProtocolTextDocument.fromVirtualFile(editor, vf)

    CodyAgentService.withAgent(project) { agent ->
      ensureSelectionRange(agent, textFile)
      ApplicationManager.getApplication().invokeLater { showWorkingGroup() }
    }
  }

  fun performInlineEdits(edits: List<TextEdit>) {
    // TODO: This is an artifact of the update to concurrent editing tasks.
    // We do need to mute any LensGroup listeners, but this is an ugly way to do it.
    // There are multiple Lens groups; we need a Document-level listener list.
    lensGroup?.withListenersMuted {
      if (!controller.isEligibleForInlineEdit(editor)) {
        return@withListenersMuted logger.warn("Inline edit not eligible")
      }

      WriteCommandAction.runWriteCommandAction(project) {
        val currentActions =
            edits.mapNotNull { edit ->
              try {
                when (edit.type) {
                  "replace",
                  "delete" -> ReplaceUndoableAction(project, edit, document)
                  "insert" -> InsertUndoableAction(project, edit, document)
                  else -> {
                    logger.warn("Unknown edit type: ${edit.type}")
                    null
                  }
                }
              } catch (e: RuntimeException) {
                throw EditCreationException(edit, e)
              }
            }

        currentActions.forEach { action ->
          try {
            action.apply()
          } catch (e: RuntimeException) {
            throw EditExecutionException(action, e)
          }
        }

        performedActions += currentActions
      }
    }
  }

  private fun adjustToDocumentRange(r: Range): Range {
    // Negative values of the start/end line are used to mark beginning/end of the document
    val start = if (r.start.line < 0) Position(line = 0, character = r.start.character) else r.start
    val endLine = document.getLineNumber(document.textLength)
    val endLineLength = document.getLineEndOffset(endLine) - document.getLineStartOffset(endLine)
    val end = if (r.end.line < 0) Position(line = endLine, character = endLineLength) else r.end
    return Range(start, end)
  }

  private fun undoEdits() {
    if (project.isDisposed) return
    WriteCommandAction.runWriteCommandAction(project) {
      performedActions.reversed().forEach { it.undo() }
    }
  }

  private fun createDiffDocument(): Document {
    val document = EditorFactory.getInstance().createDocument(document.text)
    val diffActions = performedActions.map { it.copyForDocument(document) }
    WriteCommandAction.runWriteCommandAction(project) {
      diffActions.reversed().forEach { it.undo() }
    }
    return document
  }

  override fun dispose() {
    if (project.isDisposed) return
    performedActions.forEach { it.dispose() }
  }

  companion object {
    // Lens actions the user can take; we notify the Agent when they are taken.
    const val COMMAND_ACCEPT = "cody.fixup.codelens.accept"
    const val COMMAND_CANCEL = "cody.fixup.codelens.cancel"
    const val COMMAND_RETRY = "cody.fixup.codelens.retry"
    const val COMMAND_DIFF = "cody.fixup.codelens.diff"
    const val COMMAND_UNDO = "cody.fixup.codelens.undo"

    // TODO: Register the hotkeys now that we are displaying them.
    fun getHotKey(command: String): String {
      val mac = SystemInfoRt.isMac
      return when (command) {
        COMMAND_ACCEPT -> if (mac) "⌥⌘A" else "Ctrl+Alt+A"
        COMMAND_CANCEL -> if (mac) "⌥⌘R" else "Ctrl+Alt+R"
        COMMAND_DIFF -> if (mac) "⌘D" else "Ctrl+D" // JB default
        COMMAND_RETRY -> if (mac) "⌘Z" else "Ctrl+Z" // JB default
        COMMAND_UNDO -> if (mac) "⌥⌘C" else "Alt+Ctrl+C"
        else -> ""
      }
    }
  }
}
