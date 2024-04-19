package com.sourcegraph.cody.edit

import com.intellij.openapi.command.undo.DocumentReference
import com.intellij.openapi.command.undo.DocumentReferenceManager
import com.intellij.openapi.command.undo.UndoManager
import com.intellij.openapi.command.undo.UndoableAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.sourcegraph.cody.agent.protocol.TextEdit

abstract class FixupUndoableAction(
    val project: Project,
    val session: DocumentMarkerSession,
    val edit: TextEdit,
    var beforeMarker: RangeMarker
) : UndoableAction {
  val logger = Logger.getInstance(FixupUndoableAction::class.java)

  var originalText =
      session.document.getText(TextRange(beforeMarker.startOffset, beforeMarker.endOffset))

  var afterMarker: RangeMarker? = null

  override fun getAffectedDocuments(): Array<out DocumentReference> {
    val documentReference = DocumentReferenceManager.getInstance().create(session.document)
    return arrayOf(documentReference)
  }

  override fun isGlobal() = true

  private fun getUndoManager() = UndoManager.getInstance(project)

  fun isUndoInProgress() = getUndoManager()?.isUndoOrRedoInProgress == true

  fun addUndoableAction(action: UndoableAction) {
    UndoManager.getInstance(project).undoableActionPerformed(action)
  }

  /** Applies the initial edit and records Undo/Redo information. */
  abstract fun apply()

  override fun redo() {
    apply()
  }
}

class InsertUndoableAction(
    project: Project,
    session: DocumentMarkerSession,
    edit: TextEdit,
    beforeMarker: RangeMarker
) : FixupUndoableAction(project, session, edit, beforeMarker) {

  private val insertText = edit.value ?: ""

  override fun apply() {
    if (isUndoInProgress()) return
    val start = beforeMarker.startOffset
    session.removeMarker(beforeMarker)
    // This is called from a WriteAction, so we can safely modify the document.
    session.document.insertString(start, insertText)
    afterMarker = session.createMarker(start, start + insertText.length)
    addUndoableAction(this)
  }

  override fun undo() {
    if (isUndoInProgress()) return
    val (start, end) = Pair(afterMarker!!.startOffset, afterMarker!!.endOffset)
    session.removeMarker(afterMarker!!)
    session.document.deleteString(start, end)
    beforeMarker = session.createMarker(start, start + originalText.length)
  }
}

// Handles deletion requests as well, which are just replacements with "".
class ReplaceUndoableAction(
    project: Project,
    session: DocumentMarkerSession,
    edit: TextEdit, // Instructions for the replacement.
    beforeMarker: RangeMarker // Marks bounds of the original text to be replaced.
) : FixupUndoableAction(project, session, edit, beforeMarker) {

  private val replacementText = edit.value ?: "" // "" for deletions

  override fun apply() {
    if (isUndoInProgress()) return
    val (start, end) = Pair(beforeMarker.startOffset, beforeMarker.endOffset)
    session.removeMarker(beforeMarker)
    // This is called from a WriteAction, so we can safely modify the document.
    session.document.replaceString(start, end, replacementText)
    afterMarker = session.createMarker(start, start + replacementText.length)
    addUndoableAction(this)
  }

  override fun undo() {
    if (isUndoInProgress()) return
    val (start, end) = Pair(afterMarker!!.startOffset, afterMarker!!.endOffset)
    session.removeMarker(afterMarker!!)
    session.document.replaceString(start, end, originalText)
    beforeMarker = session.createMarker(start, start + originalText.length)
  }
}
