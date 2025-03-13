package com.sourcegraph.cody.autoedit

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditResult

@Service(Service.Level.PROJECT)
class AutoEditManager(private val project: Project) {
  private var activeAutoEdit: AutoEdit? = null
  private var activeAutoEditEditor: Editor? = null

  fun showAutoEdit(editor: Editor, result: AutocompleteEditResult): AutoEdit? {
    val autoEdit = createAutoEdit(editor, result)
    return if (autoEdit.showAutoEdit()) autoEdit else null
  }

  private fun createAutoEdit(
      editor: Editor,
      result: AutocompleteEditResult,
  ): AutoEdit {
    ApplicationManager.getApplication().assertIsDispatchThread()

    activeAutoEdit?.hideAutoEdit()
    val autoEdit = AutoEdit(project, editor, result)

    activeAutoEdit = autoEdit
    activeAutoEditEditor = editor
    Disposer.register(autoEdit) {
      activeAutoEdit = null
      activeAutoEditEditor = null
    }

    return autoEdit
  }
}
