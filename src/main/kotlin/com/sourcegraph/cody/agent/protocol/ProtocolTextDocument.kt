package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.FileSystems
import java.util.Locale

class ProtocolTextDocument
private constructor(
    var uri: String,
    var content: String?,
    var selection: Range?,
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

    @JvmStatic
    fun fromEditor(editor: Editor): ProtocolTextDocument? {
      val file = FileDocumentManager.getInstance().getFile(editor.document)
      return if (file != null) fromVirtualFile(editor, file) else null
    }

    @JvmStatic
    fun fromVirtualFile(
        editor: Editor,
        file: VirtualFile,
    ): ProtocolTextDocument {
      val text = FileDocumentManager.getInstance().getDocument(file)?.text
      val selection = getSelection(editor)
      return ProtocolTextDocument(uriFor(file), text, selection)
    }

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
