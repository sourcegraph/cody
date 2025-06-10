package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ex.Range
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem
import kotlin.math.max
import kotlin.math.min

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

    val matchOffset = text.indexOf(item.originalText, searchStartOffset).takeIf { it != -1 }
      ?: text.lastIndexOf(item.originalText, searchStartOffset).takeIf { it != -1 }
      ?: return null

    val distanceInLines = text.substring(
      min(searchStartOffset, matchOffset),
      max(searchStartOffset, matchOffset)
    ).lines().count()

    val acceptableLinesPositionDifference = 3
    return if (distanceInLines <= acceptableLinesPositionDifference) matchOffset else null
  }

  fun computeAutoedit(editor: Editor, item: AutocompleteEditItem): Pair<Document, Range>? {
    val startOffset = findOriginalTextInDocument(editor, item) ?: return null
    val replacementRange = IntRange(startOffset, startOffset + item.originalText.length - 1)

    val vcsDocument =
      EditorFactory.getInstance()
        .createDocument(editor.document.text.replaceRange(replacementRange, item.insertText))

    // Range parameters explanation:
    // - line1, line2: Define the line range in the main editor document [line1, line2)
    // - vcsLine1, vcsLine2: Define the line range in the popup editor document [vcsLine1, vcsLine2)
    // vcs.ex.Range uses exclusive end bounds [,) while our ranges use inclusive [,].

    val startLine = vcsDocument.getLineNumber(startOffset) + 1
    // Excluding shared suffix from the diff increases diff visibility
    val sharedSuffixLinesCount = item.originalText.commonSuffixWith(item.insertText).lines().size
    val originalLinesCount = item.originalText.lines().count()
    val replacementLinesCount = item.insertText.lines().count()

    return vcsDocument to Range(
        line1 = startLine,
        line2 = startLine + originalLinesCount - sharedSuffixLinesCount,
        vcsLine1 = startLine,
        vcsLine2 = startLine + replacementLinesCount - sharedSuffixLinesCount)
  }

  fun showAutoedit(editor: Editor, item: AutocompleteEditItem) {
    val virtualFile = editor.virtualFile ?: return
    val (vcsDocument, range) = computeAutoedit(editor, item) ?: return

    val myDisposable = Disposable {
      activeAutoeditEditor = null
      activeAutocompleteEditItem = null
    }
    disposable = myDisposable

    activeAutoeditEditor = editor
    activeAutocompleteEditItem = item

    AutoeditLineStatusMarkerPopupRenderer(
            AutoeditTracker(
                project,
                disposable = myDisposable,
                document = editor.document,
                vcsDocument = vcsDocument,
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
