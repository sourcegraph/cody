package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ex.Range
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem

@Service(Service.Level.PROJECT)
class AutoeditManager(private val project: Project) {
  var activeAutocompleteEditItem: AutocompleteEditItem? = null
    private set

  var activeAutoeditEditor: Editor? = null
    private set

  var disposable: Disposable = Disposable {}
    private set

  private fun findOriginalTextInDocument(editor: Editor, item: AutocompleteEditItem): Int? {
    val document = editor.document
    val text = document.text

    val searchStartOffset = document.getLineStartOffset(item.range.start.line.toInt())
    val matchIndex = text.indexOf(item.originalText, searchStartOffset)
    val acceptableLinesPositionDifference = 3

    if (matchIndex == -1 ||
        text.substring(searchStartOffset, matchIndex).lines().count() >
            acceptableLinesPositionDifference) {
      return null
    }

    return matchIndex
  }

  fun showAutoedit(editor: Editor, item: AutocompleteEditItem) {
    val virtualFile = editor.virtualFile ?: return

    activeAutoeditEditor = editor
    activeAutocompleteEditItem = item

    val myDisposable = Disposable {
      activeAutoeditEditor = null
      activeAutocompleteEditItem = null
    }
    disposable = myDisposable

    val startOffset = findOriginalTextInDocument(editor, item) ?: return
    val replacementRange = IntRange(startOffset, startOffset + item.originalText.length - 1)

    val document =
        EditorFactory.getInstance()
            .createDocument(editor.document.text.replaceRange(replacementRange, item.insertText))

    // Range parameters explanation:
    // - line1, line2: Define the line range in the main editor document [line1, line2)
    // - vcsLine1, vcsLine2: Define the line range in the popup editor document [vcsLine1, vcsLine2)
    // vcs.ex.Range uses exclusive end bounds [,) while our ranges use inclusive [,].

    val startLine = document.getLineNumber(startOffset) + 1
    // Excluding shared suffix from the diff increases diff visibility
    val sharedSuffixLinesCount = item.originalText.commonSuffixWith(item.insertText).lines().size
    val originalLinesCount = item.originalText.lines().count()
    val replacementLinesCount = item.insertText.lines().count()

    val range =
        Range(
            line1 = startLine,
            line2 = startLine + originalLinesCount - sharedSuffixLinesCount,
            vcsLine1 = startLine,
            vcsLine2 = startLine + replacementLinesCount - sharedSuffixLinesCount)

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
