package com.sourcegraph.cody.edit.fixupActions

import com.intellij.openapi.Disposable
import com.intellij.openapi.command.undo.DocumentReference
import com.intellij.openapi.command.undo.DocumentReferenceManager
import com.intellij.openapi.command.undo.UndoManager
import com.intellij.openapi.command.undo.UndoableAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.protocol.TextEdit

abstract class FixupUndoableAction(
    val project: Project,
    val edit: TextEdit,
    val document: Document
) : UndoableAction, Disposable {
  val logger = Logger.getInstance(FixupUndoableAction::class.java)

  abstract fun copyForDocument(doc: Document): FixupUndoableAction

  override fun getAffectedDocuments(): Array<out DocumentReference> {
    val documentReference = DocumentReferenceManager.getInstance().create(document)
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
