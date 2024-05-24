package com.sourcegraph.cody.agent.protocol

import com.intellij.codeInsight.codeVision.ui.popup.layouter.bottom
import com.intellij.codeInsight.codeVision.ui.popup.layouter.right
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VirtualFile
import java.awt.Point
import java.nio.file.FileSystems
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

class ProtocolTextDocument
private constructor(
    val uri: String,
    val content: String? = null,
    val selection: Range? = null,
    val visibleRange: Range? = null,
    val contentChanges: List<ProtocolTextDocumentContentChangeEvent>? = null,
    val testing: TestingParams? = null,
) {

  companion object {

    private fun getTestingParams(
        uri: String,
        content: String? = null,
        selection: Range? = null,
        selectedText: String? = null
    ): TestingParams? {
      if (!TestingParams.doIncludeTestingParam) {
        return null
      }
      return TestingParams(
          selectedText = selectedText,
          sourceOfTruthDocument =
              ProtocolTextDocument(
                  uri = uri,
                  content = content,
                  selection = selection,
              ))
    }

    private fun getSelection(editor: Editor): Range {
      val selectionModel = editor.selectionModel
      val selectionStartPosition =
          selectionModel.selectionStartPosition?.let { editor.visualToLogicalPosition(it) }
      val selectionEndPosition =
          selectionModel.selectionEndPosition?.let { editor.visualToLogicalPosition(it) }
      if (selectionStartPosition != null && selectionEndPosition != null) {
        return Range(
            Position(selectionStartPosition.line, selectionStartPosition.column),
            Position(selectionEndPosition.line, selectionEndPosition.column))
      }
      val caret = editor.caretModel.primaryCaret
      val position = Position(caret.logicalPosition.line, caret.logicalPosition.column)
      // A single-offset caret is a selection where end == start.
      return Range(position, position)
    }

    private fun getVisibleRange(editor: Editor): Range {
      val visibleArea = editor.scrollingModel.visibleArea

      val startOffset = editor.xyToLogicalPosition(visibleArea.location)
      val startOffsetLine = max(startOffset.line, 0)
      val startOffsetColumn = max(startOffset.column, 0)

      val endOffset = editor.xyToLogicalPosition(Point(visibleArea.right, visibleArea.bottom))
      val endOffsetLine = max(0, min(endOffset.line, editor.document.lineCount - 1))
      val endOffsetColumn = min(endOffset.column, editor.document.getLineEndOffset(endOffsetLine))

      return Range(
          Position(startOffsetLine, startOffsetColumn), Position(endOffsetLine, endOffsetColumn))
    }

    @JvmStatic
    fun fromEditorWithOffsetSelection(
        editor: Editor,
        newPosition: LogicalPosition
    ): ProtocolTextDocument? {
      val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
      val position = newPosition.codyPosition()
      val uri = uriFor(file)
      val selection = Range(position, position)
      return ProtocolTextDocument(
          uri = uri,
          selection = selection,
          testing = getTestingParams(uri, selection = selection, selectedText = ""))
    }

    @JvmStatic
    fun fromEditorWithRangeSelection(editor: Editor, event: SelectionEvent): ProtocolTextDocument? {
      val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
      val uri = uriFor(file)
      val document = editor.document

      val startOffset = event.newRange.startOffset
      val startLine = document.getLineNumber(startOffset)
      val lineStartOffset1 = document.getLineStartOffset(startLine)
      val startCharacter = startOffset - lineStartOffset1

      val endOffset = event.newRange.endOffset
      val endLine = document.getLineNumber(endOffset)
      val lineStartOffset2 =
          if (startLine == endLine) {
            lineStartOffset1
          } else {
            document.getLineStartOffset(endLine)
          }
      val endCharacter = endOffset - lineStartOffset2

      val selection = Range(Position(startLine, startCharacter), Position(endLine, endCharacter))
      return ProtocolTextDocument(
          uri = uri,
          selection = selection,
          testing =
              getTestingParams(
                  uri = uri,
                  content = document.text,
                  selection = selection,
                  selectedText = editor.selectionModel.selectedText))
    }

    @JvmStatic
    fun fromEditorForDocumentEvent(editor: Editor, event: DocumentEvent): ProtocolTextDocument? {
      val oldFragment = event.oldFragment.toString()
      val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
      val startPosition = editor.offsetToLogicalPosition(event.offset).codyPosition()
      // allocate List once to avoid three unnecessary duplicate allocations
      val oldFragmentLines = oldFragment.lines()
      val endCharacter =
          if (oldFragmentLines.size > 1) oldFragmentLines.last().length
          else startPosition.character + oldFragment.length
      val endPosition = Position(startPosition.line + oldFragmentLines.size - 1, endCharacter)

      return ProtocolTextDocument(
          uri = uriFor(file),
          content = null,
          contentChanges =
              listOf(
                  ProtocolTextDocumentContentChangeEvent(
                      Range(startPosition, endPosition), event.newFragment.toString())))
    }

    @JvmStatic
    fun fromEditor(editor: Editor): ProtocolTextDocument? {
      val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
      return fromVirtualFile(editor, file)
    }

    @JvmStatic
    fun fromVirtualFile(
        editor: Editor,
        file: VirtualFile,
    ): ProtocolTextDocument {
      val content = FileDocumentManager.getInstance().getDocument(file)?.text
      val uri = uriFor(file)
      val selection = getSelection(editor)
      return ProtocolTextDocument(
          uri = uri,
          content = content,
          selection = selection,
          visibleRange = getVisibleRange(editor),
          testing = getTestingParams(uri = uri, content = content, selection = selection))
    }

    @JvmStatic
    private fun uriFor(file: VirtualFile): String {
      val uri = FileSystems.getDefault().getPath(file.path).toUri().toString()
      return uri.replace(Regex("file:///(\\w):/")) {
        val driveLetter =
            it.groups[1]?.value?.lowercase(Locale.getDefault()) ?: return@replace it.value
        "file:///$driveLetter%3A/"
      }
    }
  }
}

// Logical positions are 0-based (!), just like in VS Code.
private fun LogicalPosition.codyPosition(): Position {
  return Position(this.line, this.column)
}
