package com.sourcegraph.cody.autoedit

import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vcs.ex.Range
import com.sourcegraph.cody.agent.protocol_extensions.toOffsetRange
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem

@Service(Service.Level.PROJECT)
class AutoeditManager(private val project: Project) {
  private var activeAutocompleteEditItem: AutocompleteEditItem? = null
  private var activeAutoeditEditor: Editor? = null

  fun showAutoEdit(editor: Editor, item: AutocompleteEditItem) {
    val virtualFile = editor.virtualFile ?: return

    activeAutoeditEditor = editor
    activeAutocompleteEditItem = item

    val disposable = Disposer.newDisposable()

    val offsetRange = item.range.toOffsetRange(editor.document) ?: return

    val beforeInsertion = editor.document.text.take(offsetRange.first)
    val afterInsertion = editor.document.text.drop(offsetRange.second)

    val document =
        EditorFactory.getInstance()
            .createDocument(beforeInsertion + item.insertText + afterInsertion)

    val endLineAfterInsert =
        item.range.start.line.toInt() + item.insertText.count { it == '\n' } - 1
    val range =
        Range(
            item.range.start.line.toInt(),
            item.range.end.line.toInt(),
            item.range.start.line.toInt(),
            endLineAfterInsert)
    AutoeditLineStatusMarkerPopupRenderer(
            AutoeditTracker(
                project,
                disposable = disposable,
                document = editor.document,
                vcsDocument = document,
                virtualFile = virtualFile,
                range = range))
        .showHintAt(editor, range, mousePosition = null)
  }
}
