package com.sourcegraph.cody.edit.lenses.actions

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.EditorFactory
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.toOffsetRange
import com.sourcegraph.cody.agent.protocol_generated.EditTask_GetTaskDetailsParams
import com.sourcegraph.common.ShowDocumentDiffAction

class EditShowDiffAction :
    LensEditAction({ project, event, editor, taskId ->
      CodyAgentService.withServer(project) { server ->
        WriteCommandAction.runWriteCommandAction<Unit>(project) {
          val editTask = server.editTask_getTaskDetails(EditTask_GetTaskDetailsParams(taskId)).get()
          if (editTask != null) {
            val documentAfter = editor.document
            val documentBefore = EditorFactory.getInstance().createDocument(documentAfter.text)
            val (startOffset, endOffset) =
                editTask.selectionRange.toOffsetRange(documentBefore)
                    ?: return@runWriteCommandAction
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
