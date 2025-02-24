package com.sourcegraph.cody.edit.lenses.actions

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.EditorFactory
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.toOffsetRange
import com.sourcegraph.cody.agent.protocol_generated.EditTask_GetTaskDetailsParams
import com.sourcegraph.common.ShowDocumentDiffAction

class EditShowDiffAction :
    LensEditAction({ project, event, editor, taskId ->
      CodyAgentService.withAgent(project) { agent ->
        WriteCommandAction.runWriteCommandAction<Unit>(project) {
          val editTask =
              agent.server.editTask_getTaskDetails(EditTask_GetTaskDetailsParams(taskId)).get()
          if (editTask != null) {
            val documentAfter = editor.document
            val documentBefore = EditorFactory.getInstance().createDocument(documentAfter.text)
            val (startOffset, endOffset) =
                try {
                  editTask.selectionRange.toOffsetRange(documentBefore)
                } catch (ex: IllegalArgumentException) {
                  return@runWriteCommandAction
                }
            documentBefore.replaceString(startOffset, endOffset, editTask.originalText ?: "")
            ShowDocumentDiffAction(documentBefore, documentAfter).actionPerformed(event)
          }
        }
      }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.diff"
  }
}
