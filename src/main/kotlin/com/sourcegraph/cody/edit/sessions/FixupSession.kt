package com.sourcegraph.cody.edit.sessions

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ScrollType
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.concurrency.annotations.RequiresEdt
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
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.cody.edit.exception.EditCreationException
import com.sourcegraph.cody.edit.exception.EditExecutionException
import com.sourcegraph.cody.edit.fixupActions.FixupUndoableAction
import com.sourcegraph.cody.edit.fixupActions.InsertUndoableAction
import com.sourcegraph.cody.edit.fixupActions.ReplaceUndoableAction
import com.sourcegraph.cody.edit.widget.LensGroupFactory
import com.sourcegraph.cody.edit.widget.LensWidgetGroup
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.utils.CodyEditorUtil
import java.net.URI
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.TimeUnit
import kotlin.io.path.toPath

/**
 * Common functionality for commands that let the agent edit the code inline, such as adding a doc
 * string, or fixing up a region according to user instructions. Instances of this class map 1:1
 * with FixupTask instances in the Agent.
 */
abstract class FixupSession(
    val controller: FixupService,
    val project: Project,
    var editor: Editor
) : Disposable {

  private val logger = Logger.getInstance(FixupSession::class.java)
  private val fixupService = FixupService.getInstance(project)

  // This is passed back by the Agent when we initiate the editing task.
  @Volatile var taskId: String? = null

  // The current lens group. Changes as the state machine proceeds.
  private var lensGroup: LensWidgetGroup? = null

  var selectionRange: Range? = null

  // The prompt that the Agent used for this task. For Edit, it's the same as
  // the most recent prompt the user sent, which we already have. But for Document Code,
  // it enables us to show the user what we sent and let them hand-edit it.
  var instruction: String? = null

  private val performedActions: MutableList<FixupUndoableAction> = mutableListOf()

  private val cancellationToken = CancellationToken()

  private val completionFuture: CompletableFuture<Void> =
      cancellationToken.onFinished {
        try {
          controller.clearActiveSession()
        } catch (x: Exception) {
          logger.debug("Session cleanup error", x)
        }

        runInEdt {
          try { // Disposing inlay requires EDT.
            Disposer.dispose(this)
          } catch (x: Exception) {
            logger.warn("Error disposing fixup session $this", x)
          }
        }
      }

  init {
    triggerFixupAsync()

    runInEdt { Disposer.register(controller, this) }
  }

  private val document
    get() = editor.document

  @RequiresEdt
  private fun triggerFixupAsync() {
    // Those lookups require us to be on the EDT.
    val file = FileDocumentManager.getInstance().getFile(document)
    val textFile = file?.let { ProtocolTextDocument.fromVirtualFile(editor, it) } ?: return

    CodyAgentService.withAgent(project) { agent ->
      workAroundUninitializedCodebase()

      fixupService.startNewSession(this)

      // Spend a turn to get folding ranges before showing lenses.
      ensureSelectionRange(agent, textFile)

      showWorkingGroup()

      makeEditingRequest(agent)
          .handle { result, error ->
            if (error != null || result == null) {
              showErrorGroup("Error while generating doc string: $error")
            } else {
              selectionRange = adjustToDocumentRange(result.selectionRange)
            }
            null
          }
          .exceptionally { error: Throwable? ->
            if (!(error is CancellationException || error is CompletionException)) {
              showErrorGroup("Error while generating code: ${error?.localizedMessage}")
            }
            cancel()
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
    task.instruction?.let { instruction = it }

    when (task.state) {
      // This is an internal state (parked/ready tasks) and we should never see it.
      CodyTaskState.Idle -> {}
      // These four may or may not all arrive, depending on the operation, testing, etc.
      // They are all sent in quick succession and any one can substitute for another.
      CodyTaskState.Working,
      CodyTaskState.Inserting,
      CodyTaskState.Applying,
      CodyTaskState.Formatting -> {
        taskId = task.id
      }
      // Tasks remain in this state until explicit accept/undo/cancel.
      CodyTaskState.Applied -> showAcceptGroup()
      // Then they transition to finished.
      CodyTaskState.Finished -> cancellationToken.dispose()
      CodyTaskState.Error -> cancellationToken.dispose()
      CodyTaskState.Pending -> {}
    }
  }

  // N.B. Blocks calling thread until the lens group is shown,
  // which may require switching to the EDT. This is primarily to help smooth
  // integration testing, but also because there's no real harm blocking pool threads.
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
    val future = group.show(range)
    // Make sure the lens is visible.
    ApplicationManager.getApplication().invokeLater {
      if (!editor.isDisposed) {
        val logicalPosition = LogicalPosition(range.start.line, range.start.character)
        editor.scrollingModel.scrollTo(logicalPosition, ScrollType.CENTER)
      }
    }
    if (!ApplicationManager.getApplication().isDispatchThread) { // integration test
      future.get()
    }

    controller.notifySessionStateChanged()
  }

  private fun showWorkingGroup() {
    showLensGroup(LensGroupFactory(this).createTaskWorkingGroup())
  }

  private fun showAcceptGroup() {
    showLensGroup(LensGroupFactory(this).createAcceptGroup())
  }

  private fun showErrorGroup(hoverText: String) {
    showLensGroup(LensGroupFactory(this).createErrorGroup(hoverText))
  }

  /** Subclass sends a fixup command to the agent, and returns the initial task. */
  abstract fun makeEditingRequest(agent: CodyAgent): CompletableFuture<EditTask>

  fun accept() {
    CodyAgentService.withAgent(project) { agent ->
      agent.server.acceptEditTask(TaskIdParam(taskId!!))
    }
  }

  fun cancel() {
    if (taskId == null) {
      dismiss()
    } else {
      CodyAgentService.withAgent(project) { agent ->
        agent.server.cancelEditTask(TaskIdParam(taskId!!))
      }
    }
  }

  fun undo() {
    runInEdt { showWorkingGroup() }
    CodyAgentService.withAgent(project) { agent ->
      agent.server.undoEditTask(TaskIdParam(taskId!!))
    }
  }

  fun showRetryPrompt() {
    runInEdt {
      // Close loophole where you can keep retrying after the ignore policy changes.
      if (controller.isEligibleForInlineEdit(editor)) {
        EditCommandPrompt(controller, editor, "Edit instructions and Retry", instruction)
      }
    }
  }

  fun afterSessionFinished(action: Runnable) {
    completionFuture.thenRun(action)
  }

  fun dismiss() {
    cancellationToken.dispose()
  }

  fun performWorkspaceEdit(workspaceEditParams: WorkspaceEditParams) {

    for (op in workspaceEditParams.operations) {

      op.uri?.let { updateEditorIfNeeded(it) }

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

  private fun updateEditorIfNeeded(path: String) {
    val uri = URI.create(path).withScheme("file")
    val vf = LocalFileSystem.getInstance().findFileByNioFile(uri.toPath()) ?: return
    val documentForFile = FileDocumentManager.getInstance().getDocument(vf)

    if (document != documentForFile) {
      CodyEditorUtil.getAllOpenEditors()
          .firstOrNull { it.document == documentForFile }
          ?.let { newEditor -> editor = newEditor }

      val textFile = ProtocolTextDocument.fromVirtualFile(editor, vf)
      CodyAgentService.withAgent(project) { agent ->
        ensureSelectionRange(agent, textFile)
        runInEdt { showWorkingGroup() }
      }
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

  fun createDiffDocument(): Document {
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

  fun isShowingWorkingLens(): Boolean {
    return lensGroup?.isInWorkingGroup == true
  }

  /** Returns true if the Accept lens group is currently active. */
  fun isShowingAcceptLens(): Boolean {
    return lensGroup?.isAcceptGroup == true
  }

  fun isShowingErrorLens(): Boolean {
    return lensGroup?.isErrorGroup == true
  }

  companion object {
    // JetBrains Actions that we fire when the lenses are clicked.
    const val ACTION_ACCEPT = "cody.inlineEditAcceptAction"
    const val ACTION_CANCEL = "cody.inlineEditCancelAction"
    const val ACTION_RETRY = "cody.inlineEditRetryAction"
    const val ACTION_DIFF = "cody.editShowDiffAction"
    const val ACTION_UNDO = "cody.inlineEditUndoAction"
    const val ACTION_DISMISS = "cody.inlineEditDismissAction"
  }
}
