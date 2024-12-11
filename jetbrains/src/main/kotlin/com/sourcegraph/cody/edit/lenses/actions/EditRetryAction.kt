package com.sourcegraph.cody.edit.lenses.actions

import com.intellij.openapi.application.runInEdt
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.edit.actions.EditCodeAction

class EditRetryAction :
    LensEditAction({ project, _, editor, taskId ->
      runInEdt {
        val completedFixup = EditCodeAction.completedEditTasks[taskId]
        if (completedFixup != null) {
          runInEdt {
            EditCommandPrompt(project, editor, "Edit instructions and Retry", completedFixup)
          }
        }
      }
    }) {
  companion object {
    const val ID = "cody.fixup.codelens.retry"
  }
}
