package com.sourcegraph.cody.autoedit

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditResult

@Service(Service.Level.PROJECT)
class AutoEditManager(private val project: Project) {
  private var activeAutoEdit: AutoEdit? = null
  private var myActiveAutoEditEditor: Editor? = null

  init {
    val connection = project.messageBus.connect()

    connection.subscribe(
        DumbService.DUMB_MODE,
        object : DumbService.DumbModeListener {
          override fun enteredDumbMode() {
            hideAutoEdit()
          }

          override fun exitDumbMode() {
            hideAutoEdit()
          }
        })

    EditorFactory.getInstance()
        .addEditorFactoryListener(
            object : EditorFactoryListener {
              override fun editorReleased(event: EditorFactoryEvent) {
                if (event.editor === myActiveAutoEditEditor) {
                  hideAutoEdit()
                }
              }
            },
            project)
  }

  fun showAutoEdit(editor: Editor, result: AutocompleteEditResult): AutoEdit? {
    val autoEdit = createAutoEdit(editor, result)
    return if (autoEdit.showAutoEdit()) autoEdit else null
  }

  private fun createAutoEdit(
      editor: Editor,
      result: AutocompleteEditResult,
  ): AutoEdit {
    hideAutoEdit()

    val autoEdit = AutoEdit(project, editor, result)

    ApplicationManager.getApplication().assertIsDispatchThread()

    activeAutoEdit = autoEdit
    myActiveAutoEditEditor = editor
    Disposer.register(autoEdit) {
      activeAutoEdit = null
      myActiveAutoEditEditor = null
    }

    return autoEdit
  }

  fun hideAutoEdit() {
    activeAutoEdit?.hideAutoEdit()
  }
}
