package com.sourcegraph.cody.edit

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.undo.DocumentReference
import com.intellij.openapi.command.undo.DocumentReferenceManager
import com.intellij.openapi.command.undo.UndoManager
import com.intellij.openapi.command.undo.UndoableAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.util.TextRange
import com.sourcegraph.cody.agent.protocol.TextEdit
import com.sourcegraph.cody.edit.sessions.FixupSession

abstract class FixupUndoableAction(
    val session: FixupSession,
    val edit: TextEdit,
    var beforeMarker: RangeMarker
) : UndoableAction {
  val logger = Logger.getInstance(FixupUndoableAction::class.java)
  val editor = session.editor

  val document: Document = editor.document

  protected val originalText =
      document.getText(TextRange(beforeMarker.startOffset, beforeMarker.endOffset))

  protected var afterMarker: RangeMarker? = null

  override fun getAffectedDocuments(): Array<out DocumentReference> {
    val documentReference = DocumentReferenceManager.getInstance().create(document)
    return arrayOf(documentReference)
  }

  override fun isGlobal() = true

  private fun getUndoManager() = editor.project?.let { UndoManager.getInstance(it) }

  fun isUndoInProgress() = getUndoManager()?.isUndoOrRedoInProgress == true

  fun addUndoableAction(action: UndoableAction) {
    editor.project?.let { UndoManager.getInstance(it).undoableActionPerformed(action) }
  }

  /** Applies the initial edit and records Undo/Redo information. */
  abstract fun apply()

  override fun redo() {
    apply()
  }
}

class InsertUndoableAction(session: FixupSession, edit: TextEdit, marker: RangeMarker) :
    FixupUndoableAction(session, edit, marker) {

  private val insertText = edit.value ?: ""

  init {
    apply()
  }

  override fun apply() {
    if (isUndoInProgress()) return
    val start = beforeMarker.startOffset
    session.removeMarker(beforeMarker)
    // This is called from a WriteAction, so we can safely modify the document.
    document.insertString(start, insertText)
    afterMarker = session.createMarker(start, start + insertText.length)
    addUndoableAction(this)
  }

  override fun undo() {
    if (isUndoInProgress()) return
    val (start, end) = Pair(afterMarker!!.startOffset, afterMarker!!.endOffset)
    session.removeMarker(afterMarker!!)
    ApplicationManager.getApplication().runWriteAction {
      editor.document.deleteString(start, end)
      beforeMarker = session.createMarker(start, start + originalText.length)
    }
  }
}

// Handles deletion requests as well, which are just replacements with "".
class ReplaceUndoableAction(
    session: FixupSession,
    edit: TextEdit, // Instructions for the replacement.
    beforeMarker: RangeMarker // Marks bounds of the original text to be replaced.
) : FixupUndoableAction(session, edit, beforeMarker) {

  private val replacementText = edit.value ?: "" // "" for deletions

  init {
    apply()
  }

  override fun apply() {
    if (isUndoInProgress()) return
    val (start, end) = Pair(beforeMarker.startOffset, beforeMarker.endOffset)
    session.removeMarker(beforeMarker)
    // This is called from a WriteAction, so we can safely modify the document.
    document.replaceString(start, end, replacementText)
    afterMarker = session.createMarker(start, start + replacementText.length)
    addUndoableAction(this)
  }

  override fun undo() {
    if (isUndoInProgress()) return
    val (start, end) = Pair(afterMarker!!.startOffset, afterMarker!!.endOffset)
    session.removeMarker(afterMarker!!)
    ApplicationManager.getApplication().runWriteAction {
      editor.document.replaceString(start, end, originalText)
      beforeMarker = session.createMarker(start, start + originalText.length)
    }
  }
}
