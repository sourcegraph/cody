package com.sourcegraph.cody.autoedit

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem

@Service(Service.Level.PROJECT)
class AutoeditManager(private val project: Project) {
  private var activeAutoedit: Autoedit? = null
  private var activeAutoeditEditor: Editor? = null

  fun showAutoEdit(editor: Editor, result: AutocompleteEditItem): Autoedit? {
    val autoedit = createAutoedit(editor, result)
    return if (autoedit.showAutoedit()) autoedit else null
  }

  private fun createAutoedit(
      editor: Editor,
      result: AutocompleteEditItem,
  ): Autoedit {
    ApplicationManager.getApplication().assertIsDispatchThread()

    activeAutoedit?.hideAutoedit()
    val autoeditImageDiff = result.render.aside.image ?: TODO("Not implemented yet")
    val autoedit = Autoedit(project, editor, autoeditImageDiff)

    activeAutoedit = autoedit
    activeAutoeditEditor = editor
    Disposer.register(autoedit) {
      activeAutoedit = null
      activeAutoeditEditor = null
    }

    return autoedit
  }
}
