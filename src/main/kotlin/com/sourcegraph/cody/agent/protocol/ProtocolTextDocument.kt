package com.sourcegraph.cody.agent.protocol

import com.intellij.codeInsight.codeVision.ui.popup.layouter.bottom
import com.intellij.codeInsight.codeVision.ui.popup.layouter.right
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VirtualFile
import java.awt.Point
import java.nio.file.FileSystems
import java.util.*
import kotlin.math.max
import kotlin.math.min

class ProtocolTextDocument
private constructor(
    val uri: String,
    val content: String? = null,
    val selection: Range? = null,
    val visibleRange: Range? = null,
    val contentChanges: List<ProtocolTextDocumentContentChangeEvent>? = null,
) {

  companion object {

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
      val endOffsetLine = max(0, min(endOffset.line, editor.document.lineCount))
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
      return ProtocolTextDocument(uri = uriFor(file), selection = Range(position, position))
    }

    @JvmStatic
    fun fromEditorWithRangeSelection(editor: Editor): ProtocolTextDocument? {
      val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
      return ProtocolTextDocument(uri = uriFor(file), selection = getSelection(editor))
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
      val text = FileDocumentManager.getInstance().getDocument(file)?.text
      return ProtocolTextDocument(
          uri = uriFor(file),
          content = text,
          selection = getSelection(editor),
          visibleRange = getVisibleRange(editor))
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
