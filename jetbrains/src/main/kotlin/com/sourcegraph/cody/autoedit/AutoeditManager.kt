package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ex.Range
import com.sourcegraph.cody.agent.protocol_extensions.toOffsetRange
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem

@Service(Service.Level.PROJECT)
class AutoeditManager(private val project: Project) {
  var activeAutocompleteEditItem: AutocompleteEditItem? = null
    private set

  var activeAutoeditEditor: Editor? = null
    private set

  var disposable: Disposable = Disposable {}
    private set

  fun showAutoedit(editor: Editor, item: AutocompleteEditItem) {
    val virtualFile = editor.virtualFile ?: return

    activeAutoeditEditor = editor
    activeAutocompleteEditItem = item

    val myDisposable = Disposable {
      activeAutoeditEditor = null
      activeAutocompleteEditItem = null
    }
    disposable = myDisposable

    val offsetRange = item.range.toOffsetRange(editor.document) ?: return

    val beforeInsertion = editor.document.text.take(offsetRange.first)
    val afterInsertion = editor.document.text.drop(offsetRange.second)

    val document =
        EditorFactory.getInstance()
            .createDocument(beforeInsertion + item.insertText + afterInsertion)

    val endLineAfterInsert =
        item.range.start.line.toInt() + item.insertText.count { it == '\n' } - 1
    // [com.intellij.openapi.vcs.ex.Range] is [,) while ours is [,]. Hence, let's add 1 to the ends.
    // TODO(mkondratek): a single line autoedit to be supported
    // https://linear.app/sourcegraph/issue/CODY-5620
    val range =
        Range(
            item.range.start.line.toInt(),
            item.range.end.line.toInt() + 1,
            item.range.start.line.toInt(),
            endLineAfterInsert + 1)
    AutoeditLineStatusMarkerPopupRenderer(
            AutoeditTracker(
                project,
                disposable = myDisposable,
                document = editor.document,
                vcsDocument = document,
                virtualFile = virtualFile,
                range = range))
        .showHintAt(editor, range, mousePosition = null)
  }

  fun hide() {
    disposable.dispose()
  }

  companion object {
    fun getInstance(project: Project): AutoeditManager {
      return project.service<AutoeditManager>()
    }
  }
}
