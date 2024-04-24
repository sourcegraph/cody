package com.sourcegraph.cody.edit.fixupActions

import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.sourcegraph.cody.agent.protocol.TextEdit

// Handles deletion requests as well, which are just replacements with "".
class ReplaceUndoableAction(
    project: Project,
    edit: TextEdit, // Instructions for the replacement.
    document: Document
) : FixupUndoableAction(project, edit, document) {

  private val replacementText = edit.value ?: "" // "" for deletions
  private var beforeMarker = createBeforeMarker()
  private var originalText: String? = null
  private var afterMarker: RangeMarker? = null

  private constructor(
      other: ReplaceUndoableAction,
      document: Document
  ) : this(other.project, other.edit, document) {
    this.beforeMarker =
        other.beforeMarker?.let { document.createRangeMarker(it.startOffset, it.endOffset) }
    this.afterMarker =
        other.afterMarker?.let { document.createRangeMarker(it.startOffset, it.endOffset) }
    this.originalText = other.originalText
  }

  override fun apply() {
    val (start, end) =
        beforeMarker?.let { Pair(it.startOffset, it.endOffset) } ?: Pair(0, document.textLength)
    originalText = document.getText(TextRange(start, end))
    document.replaceString(start, end, replacementText)
    afterMarker =
        beforeMarker?.let { document.createRangeMarker(start, start + replacementText.length) }
  }

  override fun undo() {
    val (start, end) =
        afterMarker?.let { Pair(it.startOffset, it.endOffset) } ?: Pair(0, document.textLength)
    document.replaceString(start, end, originalText!!)
  }

  override fun dispose() {
    beforeMarker?.dispose()
    afterMarker?.dispose()
  }

  override fun copyForDocument(doc: Document): ReplaceUndoableAction {
    return ReplaceUndoableAction(this, doc)
  }

  private fun createBeforeMarker(): RangeMarker? {
    val range = edit.range ?: return null
    if (range.start.line == -1 || range.end.line == -1) return null
    val startOffset = document.getLineStartOffset(range.start.line) + range.start.character
    val endOffset = document.getLineStartOffset(range.end.line) + range.end.character
    return document.createRangeMarker(startOffset, endOffset)
  }

  override fun toString(): String {
    return """${javaClass.name} for $edit
      beforeMarker: $beforeMarker
      afterMarker: $afterMarker
      originalText: $originalText
      replacementText: $replacementText
    """
        .trimIndent()
  }
}
