package com.sourcegraph.cody.edit.sessions

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.edit.DocumentMarkerSession
import com.sourcegraph.cody.edit.FixupUndoableAction
import com.sourcegraph.cody.edit.InsertUndoableAction
import com.sourcegraph.cody.edit.ReplaceUndoableAction

class DiffSession(
    project: Project,
    document: Document,
    performedActions: MutableList<FixupUndoableAction>
) : DocumentMarkerSession(document) {
  private val logger = Logger.getInstance(DiffSession::class.java)

  init {
    performedActions
        .mapNotNull { it.afterMarker }
        .map { createMarker(it.startOffset, it.endOffset) }
    val sortedEdits =
        performedActions.zip(rangeMarkers).sortedByDescending { it.second.startOffset }

    WriteCommandAction.runWriteCommandAction(project) {
      for ((fixupAction, marker) in sortedEdits) {
        val tmpAfterMarker = fixupAction.afterMarker ?: break

        when (fixupAction.edit.type) {
          "replace",
          "delete" -> {
            ReplaceUndoableAction(project, session = this, fixupAction.edit, marker)
                .apply {
                  afterMarker = createMarker(tmpAfterMarker.startOffset, tmpAfterMarker.endOffset)
                  originalText = fixupAction.originalText
                }
                .undo()
          }
          "insert" -> {
            InsertUndoableAction(project, session = this, fixupAction.edit, marker)
                .apply {
                  afterMarker = createMarker(tmpAfterMarker.startOffset, tmpAfterMarker.endOffset)
                  originalText = fixupAction.originalText
                }
                .undo()
          }
          else -> logger.warn("Unknown edit type: ${fixupAction.edit.type}")
        }
      }
    }
  }
}
