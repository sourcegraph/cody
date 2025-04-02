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

    // Calculate the ending line after insertion
    // by adding the number of newlines in the inserted text
    val endLineAfterInsert =
        item.range.start.line.toInt() + item.insertText.count { it == '\n' } - 1

    // Range parameters explanation:
    // - line1, line2: Define the line range in the main editor document [line1, line2)
    // - vcsLine1, vcsLine2: Define the line range in the popup editor document [vcsLine1, vcsLine2)
    // The +1 adjustments are needed because Range uses exclusive end bounds [,)
    // while our ranges use inclusive [,].
    // For single-line edits (no newlines), we ensure vcsLine2 > vcsLine1
    // to properly display the edit.
    val range =
        Range(
            line1 = item.range.start.line.toInt(), // Starting line in main editor
            line2 = item.range.end.line.toInt() + 1, // Ending line in main editor (exclusive)
            vcsLine1 = item.range.start.line.toInt(), // Starting line in popup editor
            vcsLine2 = endLineAfterInsert + 1) // Ending line in popup editor (exclusive)
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
    @JvmStatic fun getInstance(project: Project): AutoeditManager = project.service()
  }
}
