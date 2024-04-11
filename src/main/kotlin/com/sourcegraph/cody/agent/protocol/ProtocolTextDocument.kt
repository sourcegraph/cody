package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.agent.protocol.util.Rfc3986UriEncoder

class ProtocolTextDocument
private constructor(
    var uri: String,
    var content: String?,
    var selection: Range?,
) {

  companion object {

    private fun getSelection(editor: Editor): Range? {
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
      val caret = editor.caretModel.allCarets.firstOrNull() ?: return null
      val position = Position(caret.logicalPosition.line, caret.logicalPosition.column)
      // A single-offset caret is a selection where end == start.
      return Range(position, position)
    }

    @JvmStatic
    @JvmOverloads
    fun fromVirtualFile(
        fileEditorManager: FileEditorManager,
        file: VirtualFile,
    ): ProtocolTextDocument {
      val rfc3986Uri = Rfc3986UriEncoder.encode(file.url)
      val text = FileDocumentManager.getInstance().getDocument(file)?.text
      val selection = fileEditorManager.selectedTextEditor?.let { getSelection(it) }
      return ProtocolTextDocument(rfc3986Uri, text, selection)
    }
  }
}
